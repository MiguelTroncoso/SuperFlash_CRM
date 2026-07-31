import { mkdir, rm } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import makeWASocket, { DisconnectReason, type WAMessage } from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';

import { ReaderApiClient, type ReaderMessage } from './api-client.js';
import { createEncryptedMultiFileAuthState } from './encrypted-auth-state.js';

interface StringRecord {
  readonly [key: string]: unknown;
}

function record(value: unknown): StringRecord | null {
  return typeof value === 'object' && value !== null ? (value as StringRecord) : null;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function phoneFromJid(value: string): string | null {
  const normalized = value.split('@')[0]?.replace(/[^\d+]/g, '') ?? '';
  return normalized.length > 5 ? normalized : null;
}

function isIgnoredJid(value: string): boolean {
  return (
    value.endsWith('@g.us') ||
    value.endsWith('@newsletter') ||
    value === 'status@broadcast' ||
    value.endsWith('@broadcast')
  );
}

function normalizeMessage(message: WAMessage, api: ReaderApiClient): ReaderMessage | null {
  const key = record(message.key);
  const remoteJid = stringValue(key?.remoteJid);
  const externalMessageId = stringValue(key?.id);
  if (!remoteJid || !externalMessageId || key?.fromMe === true || isIgnoredJid(remoteJid))
    return null;
  const body = record(message.message);
  if (!body || body.protocolMessage || body.senderKeyDistributionMessage) return null;
  const phone = phoneFromJid(remoteJid);
  if (!phone) return null;
  const pushName = stringValue(message.pushName);
  const extended = record(body.extendedTextMessage);
  const text = stringValue(body.conversation) ?? stringValue(extended?.text);
  const image = record(body.imageMessage);
  const video = record(body.videoMessage);
  const audio = record(body.audioMessage);
  const document = record(body.documentMessage);
  const location = record(body.locationMessage);
  const contactMessage = body.contactMessage ?? body.contactsArrayMessage;
  const type =
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
                  : 'UNKNOWN';
  const media = image ?? video ?? audio ?? document;
  const mediaMimeType = stringValue(media?.mimetype);
  const mediaFilename = stringValue(media?.fileName);
  const caption =
    stringValue(image?.caption) ?? stringValue(video?.caption) ?? stringValue(document?.caption);
  const timestamp =
    typeof message.messageTimestamp === 'number'
      ? message.messageTimestamp
      : Number(message.messageTimestamp ?? 0);
  return {
    externalMessageId,
    phone,
    phoneNormalized: phone,
    ...(pushName ? { contactName: pushName } : {}),
    type,
    ...(text ? { text } : {}),
    ...(mediaMimeType ? { mediaMimeType } : {}),
    ...(mediaFilename ? { mediaFilename } : {}),
    ...(caption ? { caption } : {}),
    ...(location ? { location } : {}),
    occurredAt: new Date(timestamp > 0 ? timestamp * 1_000 : Date.now()).toISOString(),
    requestId: api.requestId(),
  };
}

export class WhatsAppWebReadOnlyAdapter {
  private readonly enabled = process.env.WHATSAPP_READER_ENABLED === 'true';
  private readonly api: ReaderApiClient | null = this.enabled ? new ReaderApiClient() : null;
  private readonly authDir = process.env.WHATSAPP_READER_AUTH_DIR?.trim() || '/data/auth';
  private socket: ReturnType<typeof makeWASocket> | null = null;
  private stopping = false;
  private reconnectCount = 0;
  private historicalDiscarded = 0;

  async start(): Promise<void> {
    this.stopping = false;
    if (!this.enabled) {
      process.stdout.write('whatsapp-reader disabled; waiting for WHATSAPP_READER_ENABLED=true.\n');
      return;
    }
    await mkdir(this.authDir, { recursive: true, mode: 0o700 });
    await this.connect();
  }

  async stop(): Promise<void> {
    this.stopping = true;
    this.socket?.end(undefined);
    this.socket = null;
    if (this.api) await this.api.status('DISCONNECTED', { reconnectCount: this.reconnectCount });
  }

  async unlink(): Promise<void> {
    await this.stop();
    await rm(this.authDir, { recursive: true, force: true });
    await mkdir(this.authDir, { recursive: true, mode: 0o700 });
  }

  async server(): Promise<void> {
    const port = Number(process.env.READER_PORT ?? 3010);
    const server = createServer((request, response) => void this.handleControl(request, response));
    await new Promise<void>((resolve) => server.listen(port, '0.0.0.0', resolve));
    process.stdout.write(`whatsapp-reader listening on ${port}\n`);
  }

  private async connect(): Promise<void> {
    const { state, saveCreds } = await createEncryptedMultiFileAuthState(this.authDir);
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
      void this.readerApi().status('CONNECTED', { historicalDiscarded: this.historicalDiscarded });
    });
  }

  private async onConnection(update: {
    connection?: string;
    lastDisconnect?: { error?: unknown };
    qr?: string;
  }): Promise<void> {
    if (update.qr) {
      process.stdout.write('\nEscanea este QR con WhatsApp Business (solo lectura):\n');
      qrcode.generate(update.qr, { small: true });
      await this.readerApi().qr(update.qr, new Date(Date.now() + 120_000).toISOString());
    }
    if (update.connection === 'open') {
      const id = this.socket?.user?.id?.split(':')[0] ?? '';
      this.reconnectCount = 0;
      process.stdout.write('Conectado correctamente. Activando lectura de mensajes nuevos.\n');
      await this.readerApi().status('CONNECTED', {
        phoneNumber: id,
        reconnectCount: this.reconnectCount,
      });
    }
    if (update.connection === 'close' && !this.stopping) {
      this.reconnectCount += 1;
      const loggedOut = String(update.lastDisconnect?.error ?? '').includes(
        String(DisconnectReason.loggedOut),
      );
      await this.readerApi().status(loggedOut ? 'AUTHENTICATION_ERROR' : 'DISCONNECTED', {
        reconnectCount: this.reconnectCount,
        error: loggedOut ? 'Sesión desvinculada.' : 'Conexión cerrada; reintentando.',
      });
      if (!loggedOut)
        setTimeout(
          () => void this.connect(),
          Math.min(30_000, this.reconnectCount * 2_000),
        ).unref();
    }
  }

  private async onMessages(messages: readonly WAMessage[], type: string): Promise<void> {
    if (type !== 'notify') return;
    for (const message of messages) {
      const normalized = normalizeMessage(message, this.readerApi());
      if (!normalized) continue;
      try {
        await this.readerApi().message(normalized);
      } catch (error: unknown) {
        process.stderr.write(
          `${error instanceof Error ? error.message : 'Error enviando mensaje al API'}\n`,
        );
      }
    }
  }

  private async handleControl(request: IncomingMessage, response: ServerResponse): Promise<void> {
    if (request.url === '/health' && request.method === 'GET') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ ok: true, readOnly: true, enabled: this.enabled }));
      return;
    }
    if (!this.enabled) {
      response.writeHead(503, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ ok: false, code: 'READER_DISABLED' }));
      return;
    }
    const authorization = request.headers.authorization;
    const expected = process.env.WHATSAPP_READER_SERVICE_TOKEN?.trim();
    if (!expected || authorization !== `Bearer ${expected}`) {
      response.writeHead(401);
      response.end();
      return;
    }
    if (request.method === 'POST' && request.url === '/pair') {
      void this.start();
      response.writeHead(202);
      response.end();
      return;
    }
    if (request.method === 'POST' && request.url === '/reconnect') {
      void this.start();
      response.writeHead(202);
      response.end();
      return;
    }
    if (request.method === 'POST' && request.url === '/cancel') {
      void this.stop();
      response.writeHead(202);
      response.end();
      return;
    }
    if (request.method === 'POST' && request.url === '/unlink') {
      void this.unlink();
      response.writeHead(202);
      response.end();
      return;
    }
    response.writeHead(404);
    response.end();
  }

  private readerApi(): ReaderApiClient {
    if (!this.api) throw new Error('WhatsApp reader API is disabled.');
    return this.api;
  }
}
