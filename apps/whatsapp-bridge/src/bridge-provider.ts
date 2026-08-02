import { mkdir, rm } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import makeWASocket, { DisconnectReason, type WAMessage } from '@whiskeysockets/baileys';
import { parsePhoneNumberFromString } from 'libphonenumber-js';

import { BridgeApiClient } from './api-client.js';
import { readConfiguration, type BridgeConfiguration } from './config.js';
import { createEncryptedAuthState } from './encrypted-auth-state.js';
import { verifySignature } from './signature.js';
import type { BridgeMessage, BridgeMessageType, BridgeStatus } from './types.js';

const MAX_CLOCK_SKEW_MS = 300_000;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

interface UnknownRecord {
  readonly [key: string]: unknown;
}

function record(value: unknown): UnknownRecord | null {
  return typeof value === 'object' && value !== null ? (value as UnknownRecord) : null;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function phoneFromJid(value: string): string | null {
  const [local, server] = value.split('@');
  if (!local || !server || !['s.whatsapp.net', 'c.us'].includes(server)) return null;
  const phone = `+${local.replace(/\D/g, '')}`;
  const parsed = parsePhoneNumberFromString(phone);
  return parsed?.isValid() ? parsed.number : null;
}

function locationValue(value: UnknownRecord | null): Record<string, unknown> | undefined {
  if (!value) return undefined;
  const result: Record<string, unknown> = {};
  for (const key of ['degreesLatitude', 'degreesLongitude', 'name', 'address']) {
    const current = value[key];
    if (typeof current === 'string' || typeof current === 'number') result[key] = current;
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function normalizeMessage(message: WAMessage, api: BridgeApiClient): BridgeMessage | null {
  const key = record(message.key);
  const remoteJid = stringValue(key?.remoteJid);
  const externalMessageId = stringValue(key?.id);
  if (!remoteJid || !externalMessageId || key?.fromMe === true) return null;
  const body = record(message.message);
  if (!body || body.protocolMessage || body.senderKeyDistributionMessage || body.reactionMessage)
    return null;
  const phone = phoneFromJid(remoteJid);
  if (!phone) return null;
  const pushName = stringValue(message.pushName);
  const extended = record(body.extendedTextMessage);
  const contextInfo = record(extended?.contextInfo);
  const quotedMessageId = stringValue(contextInfo?.stanzaId);
  const text = stringValue(body.conversation) ?? stringValue(extended?.text);
  const image = record(body.imageMessage);
  const video = record(body.videoMessage);
  const audio = record(body.audioMessage);
  const document = record(body.documentMessage);
  const location = record(body.locationMessage);
  const contactMessage = body.contactMessage ?? body.contactsArrayMessage;
  const sticker = record(body.stickerMessage);
  const type: BridgeMessageType =
    body.conversation || body.extendedTextMessage
      ? 'TEXT'
      : image
        ? 'IMAGE'
        : video
          ? 'VIDEO'
          : audio
            ? 'AUDIO'
            : document
              ? 'DOCUMENT'
              : location
                ? 'LOCATION'
                : contactMessage
                  ? 'CONTACTS'
                  : sticker
                    ? 'STICKER'
                    : 'UNKNOWN';
  if (type === 'UNKNOWN') return null;
  const media = image ?? video ?? audio ?? document;
  const timestamp = Number(message.messageTimestamp ?? 0);
  const parsed = parsePhoneNumberFromString(phone);
  return {
    externalMessageId,
    phone,
    phoneNormalized: parsed?.number ?? phone,
    ...(parsed?.country ? { country: parsed.country } : {}),
    ...(pushName ? { contactName: pushName } : {}),
    ...(quotedMessageId ? { quotedMessageId } : {}),
    type,
    ...(text ? { text: text.slice(0, 10_000) } : {}),
    ...(media && stringValue(media.mimetype) ? { mediaMimeType: stringValue(media.mimetype) } : {}),
    ...(media && stringValue(media.fileName) ? { mediaFilename: stringValue(media.fileName) } : {}),
    ...(image && stringValue(image.caption)
      ? { caption: stringValue(image.caption) }
      : video && stringValue(video.caption)
        ? { caption: stringValue(video.caption) }
        : document && stringValue(document.caption)
          ? { caption: stringValue(document.caption) }
          : {}),
    ...(locationValue(location) ? { location: locationValue(location) } : {}),
    occurredAt: new Date(timestamp > 0 ? timestamp * 1_000 : Date.now()).toISOString(),
    requestId: api.requestId(),
  };
}

async function readRequestBody(request: IncomingMessage): Promise<string> {
  let content = '';
  for await (const chunk of request) {
    content += String(chunk);
    if (content.length > 32_768) throw new Error('Solicitud de control demasiado grande.');
  }
  return content;
}

export class WhatsAppWebChannelProvider {
  private readonly configuration: BridgeConfiguration;
  private readonly api: BridgeApiClient | null;
  private socket: ReturnType<typeof makeWASocket> | null = null;
  private active = false;
  private stopping = false;
  private reconnectCount = 0;
  private historicalDiscarded = 0;
  private status: BridgeStatus = 'DISCONNECTED';
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private readonly seenControlRequests = new Map<string, number>();

  constructor(configuration = readConfiguration()) {
    this.configuration = configuration;
    this.api =
      configuration.enabled && configuration.internalSecret && configuration.channelKey
        ? new BridgeApiClient({
            apiUrl: configuration.apiUrl,
            secret: configuration.internalSecret,
            channelKey: configuration.channelKey,
          })
        : null;
  }

  async start(): Promise<void> {
    this.stopping = false;
    if (!this.configuration.enabled) return;
    if (this.active) return;
    this.active = true;
    this.startHeartbeat();
    await mkdir(this.configuration.sessionDir, { recursive: true, mode: 0o700 });
    await this.connect();
  }

  async stop(): Promise<void> {
    this.stopping = true;
    this.active = false;
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
    this.socket?.end(undefined);
    this.socket = null;
    this.status = 'DISCONNECTED';
    if (this.api)
      await this.api.status({
        status: 'DISCONNECTED',
        reconnectCount: this.reconnectCount,
        requestId: this.api.requestId(),
      });
  }

  async unlink(): Promise<void> {
    await this.stop();
    await rm(this.configuration.sessionDir, { recursive: true, force: true });
    await mkdir(this.configuration.sessionDir, { recursive: true, mode: 0o700 });
  }

  async serve(): Promise<void> {
    const server = createServer((request, response) => void this.handleControl(request, response));
    await new Promise<void>((resolve) =>
      server.listen(this.configuration.port, '0.0.0.0', resolve),
    );
    process.stdout.write(`whatsapp-bridge listening on ${this.configuration.port}\n`);
  }

  private async connect(): Promise<void> {
    if (!this.configuration.sessionEncryptionKey || !this.api) return;
    const { state, saveCreds } = await createEncryptedAuthState(
      this.configuration.sessionDir,
      this.configuration.sessionEncryptionKey,
    );
    this.socket = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      syncFullHistory: false,
      markOnlineOnConnect: false,
      browser: ['SuperFlash', 'Chrome', '1.0.0'],
    });
    this.socket.ev.on('creds.update', saveCreds);
    this.socket.ev.on('connection.update', (update) => void this.onConnection(update));
    this.socket.ev.on(
      'messages.upsert',
      (event) => void this.onMessages(event.messages, event.type),
    );
    this.socket.ev.on('messaging-history.set', (event) => {
      this.historicalDiscarded += event.messages.length;
      void this.api?.status({
        status: 'CONNECTED',
        historicalDiscarded: this.historicalDiscarded,
        reconnectCount: this.reconnectCount,
        requestId: this.api.requestId(),
      });
    });
  }

  private async onConnection(update: {
    connection?: string;
    lastDisconnect?: { error?: unknown };
    qr?: string;
  }): Promise<void> {
    if (!this.api) return;
    if (update.qr) {
      this.status = 'PAIRING';
      await this.api.qr(update.qr, new Date(Date.now() + 120_000).toISOString());
    }
    if (update.connection === 'open') {
      this.status = 'CONNECTED';
      const id = this.socket?.user?.id?.split(':')[0] ?? '';
      this.reconnectCount = 0;
      await this.api.status({
        status: 'CONNECTED',
        phoneNumber: id,
        reconnectCount: this.reconnectCount,
        requestId: this.api.requestId(),
        connectedAt: new Date().toISOString(),
      });
    }
    if (update.connection === 'close' && !this.stopping && this.active) {
      this.reconnectCount += 1;
      const loggedOut = String(update.lastDisconnect?.error ?? '').includes(
        String(DisconnectReason.loggedOut),
      );
      this.status = loggedOut ? 'AUTHENTICATION_ERROR' : 'DISCONNECTED';
      await this.api.status({
        status: this.status,
        reconnectCount: this.reconnectCount,
        error: loggedOut ? 'Sesión desvinculada.' : 'Conexión cerrada; reintento controlado.',
        requestId: this.api.requestId(),
      });
      if (!loggedOut) {
        const delay = Math.min(120_000, Math.max(5_000, this.reconnectCount * 5_000));
        setTimeout(() => void this.connect(), delay).unref();
      }
    }
  }

  private async onMessages(messages: readonly WAMessage[], type: string): Promise<void> {
    if (type !== 'notify' || !this.api || !this.active) return;
    for (const message of messages) {
      const normalized = normalizeMessage(message, this.api);
      if (!normalized) continue;
      try {
        await this.api.message(normalized);
      } catch {
        this.status = 'ERROR';
      }
    }
  }

  private async handleControl(request: IncomingMessage, response: ServerResponse): Promise<void> {
    if (request.url === '/health' && request.method === 'GET') {
      this.json(response, 200, {
        ok: true,
        provider: 'BAILEYS_WHATSAPP_WEB_BRIDGE',
        enabled: this.configuration.enabled,
        active: this.active,
        status: this.status,
        missingConfiguration: this.configuration.missing,
      });
      return;
    }
    const body = await readRequestBody(request).catch(() => '');
    const requestId = request.headers['x-request-id'];
    const requestIdValue = Array.isArray(requestId) ? requestId[0] : requestId;
    const authorized =
      Boolean(this.configuration.internalSecret) &&
      requestIdValue !== undefined &&
      REQUEST_ID_PATTERN.test(requestIdValue) &&
      request.headers['x-superflash-bridge-channel-key'] === this.configuration.channelKey &&
      verifySignature(
        this.configuration.internalSecret ?? '',
        body,
        this.header(request, 'x-superflash-bridge-timestamp'),
        this.header(request, 'x-superflash-bridge-signature'),
      );
    if (!authorized || !this.acceptControlRequest(requestIdValue ?? '')) {
      this.json(response, 401, { ok: false, code: 'BRIDGE_UNAUTHORIZED' });
      return;
    }
    if (request.method !== 'POST') {
      this.json(response, 405, { ok: false, code: 'METHOD_NOT_ALLOWED' });
      return;
    }
    try {
      if (request.url === '/pair' || request.url === '/reconnect') {
        if (!this.configuration.enabled) {
          this.json(response, 503, { ok: false, code: 'BRIDGE_DISABLED' });
          return;
        }
        await this.start();
        this.json(response, 202, { ok: true, readOnly: true });
        return;
      }
      if (request.url === '/cancel') {
        await this.stop();
        this.json(response, 202, { ok: true, readOnly: true });
        return;
      }
      if (request.url === '/unlink') {
        await this.unlink();
        this.json(response, 202, { ok: true, readOnly: true });
        return;
      }
      this.json(response, 404, { ok: false, code: 'NOT_FOUND' });
    } catch {
      this.json(response, 503, { ok: false, code: 'BRIDGE_OPERATION_FAILED' });
    }
  }

  private header(request: IncomingMessage, name: string): string | undefined {
    const value = request.headers[name];
    return Array.isArray(value) ? value[0] : value;
  }

  private startHeartbeat(): void {
    if (this.heartbeatTimer || !this.api) return;
    this.heartbeatTimer = setInterval(() => {
      void this.api?.heartbeat(this.status).catch(() => {
        this.status = 'ERROR';
      });
    }, 30_000);
    this.heartbeatTimer.unref();
  }

  private acceptControlRequest(requestId: string): boolean {
    const now = Date.now();
    for (const [knownRequestId, seenAt] of this.seenControlRequests) {
      if (now - seenAt > MAX_CLOCK_SKEW_MS) this.seenControlRequests.delete(knownRequestId);
    }
    if (this.seenControlRequests.has(requestId)) return false;
    this.seenControlRequests.set(requestId, now);
    return true;
  }

  private json(response: ServerResponse, status: number, value: Record<string, unknown>): void {
    response.writeHead(status, { 'content-type': 'application/json' });
    response.end(JSON.stringify(value));
  }
}
