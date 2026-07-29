import { Prisma, WhatsAppMessageType } from '@prisma/client';

export type JsonRecord = Record<string, unknown>;

export function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

export function recordValue(value: unknown): JsonRecord | null {
  return isRecord(value) ? value : null;
}

export function arrayValue(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

export function toInputJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

const SENSITIVE_KEYS = /(token|secret|password|authorization|cookie|access[_-]?key)/i;

export function sanitizePayload(value: unknown, depth = 0): Prisma.InputJsonValue {
  if (depth > 8) return '[truncated]';
  if (value === null) return Prisma.JsonNull as unknown as Prisma.InputJsonValue;
  if (typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') return value.length > 4096 ? `${value.slice(0, 4096)}…` : value;
  if (Array.isArray(value)) {
    return value.slice(0, 100).map((item) => sanitizePayload(item, depth + 1));
  }
  if (isRecord(value)) {
    const result: Record<string, Prisma.InputJsonValue> = {};
    for (const [key, nested] of Object.entries(value).slice(0, 200)) {
      result[key] = SENSITIVE_KEYS.test(key) ? '[redacted]' : sanitizePayload(nested, depth + 1);
    }
    return result;
  }
  return String(value);
}

export function whatsappMessageType(value: unknown): WhatsAppMessageType {
  switch (value) {
    case 'text':
      return WhatsAppMessageType.TEXT;
    case 'image':
      return WhatsAppMessageType.IMAGE;
    case 'audio':
      return WhatsAppMessageType.AUDIO;
    case 'video':
      return WhatsAppMessageType.VIDEO;
    case 'document':
      return WhatsAppMessageType.DOCUMENT;
    case 'location':
      return WhatsAppMessageType.LOCATION;
    case 'contacts':
      return WhatsAppMessageType.CONTACTS;
    case 'button':
      return WhatsAppMessageType.BUTTON;
    case 'interactive':
      return WhatsAppMessageType.INTERACTIVE;
    default:
      return WhatsAppMessageType.UNKNOWN;
  }
}

export function displayName(firstName: string | null, lastName: string | null): string {
  return [firstName, lastName]
    .filter((value): value is string => Boolean(value))
    .join(' ')
    .trim();
}

export function messageTimestamp(value: unknown): Date {
  const timestamp = stringValue(value);
  if (!timestamp) return new Date();
  const seconds = Number(timestamp);
  if (Number.isFinite(seconds)) return new Date(seconds * 1000);
  const parsed = new Date(timestamp);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}
