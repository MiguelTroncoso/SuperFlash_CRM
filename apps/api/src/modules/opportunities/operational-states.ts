import { DateTime } from 'luxon';

export const OPERATIONAL_STATE_DEFINITIONS = [
  { key: 'NEW', label: 'Nuevo', followUpDays: 2 },
  { key: 'MESSAGE_SENT', label: 'Mensaje enviado', followUpDays: 2 },
  { key: 'CONVERSATION', label: 'Conversando', followUpDays: 2 },
  { key: 'DEMO_SENT', label: 'Demo enviada', followUpDays: 1 },
  { key: 'WAITING_CUSTOMER', label: 'Esperando respuesta', followUpDays: 4 },
  { key: 'INTERESTED', label: 'Interesado', followUpDays: 1 },
  { key: 'PAYMENT_PENDING', label: 'Debe pagar', followUpDays: 1 },
  { key: 'PAID', label: 'Pagó', followUpDays: null },
  { key: 'ACTIVATING', label: 'Activando', followUpDays: 1 },
  { key: 'ACTIVE', label: 'Activo', followUpDays: null },
  { key: 'LOST', label: 'Perdido', followUpDays: null },
  { key: 'FUTURE_REACTIVATION', label: 'Reactivar', followUpDays: 30 },
] as const;

export type OperationalStateKey = (typeof OPERATIONAL_STATE_DEFINITIONS)[number]['key'];

const STATE_BY_KEY = new Map(
  OPERATIONAL_STATE_DEFINITIONS.map((definition) => [definition.key, definition]),
);

const LEGACY_STATE_KEYS: Record<string, OperationalStateKey> = {
  NUEVO_LEAD: 'NEW',
  DEJO_EN_VISTO: 'WAITING_CUSTOMER',
  DEMO_ENTREGADA: 'DEMO_SENT',
  DEBE_GASTAR_CREDITOS: 'CONVERSATION',
  DEBE_JUNTAR_DINERO: 'PAYMENT_PENDING',
  POSIBLE_COMPRADOR: 'INTERESTED',
  COMPRO: 'PAID',
  NO_CONCRETADO: 'LOST',
  NEW_LEAD: 'NEW',
  LEFT_ON_READ: 'WAITING_CUSTOMER',
  DEMO_DELIVERED: 'DEMO_SENT',
  AWAITING_CREDIT_USAGE: 'CONVERSATION',
  AWAITING_MONEY: 'PAYMENT_PENDING',
  POTENTIAL_BUYER: 'INTERESTED',
  WON: 'PAID',
  LOST: 'LOST',
};

export function operationalStateKey(
  systemKey: string | null | undefined,
): OperationalStateKey | null {
  if (!systemKey) return null;
  const normalized = systemKey
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_');
  if (STATE_BY_KEY.has(normalized as OperationalStateKey)) {
    return normalized as OperationalStateKey;
  }
  return LEGACY_STATE_KEYS[normalized] ?? null;
}

export function operationalStateLabel(
  systemKey: string | null | undefined,
  fallback = 'Estado',
): string {
  const key = operationalStateKey(systemKey);
  return key ? (STATE_BY_KEY.get(key)?.label ?? fallback) : fallback;
}

export function followUpDaysForState(systemKey: string | null | undefined): number | null {
  const key = operationalStateKey(systemKey);
  return key ? (STATE_BY_KEY.get(key)?.followUpDays ?? null) : null;
}

export function suggestedFollowUpAt(
  systemKey: string | null | undefined,
  timezone: string,
  now = new Date(),
): Date | null {
  const days = followUpDaysForState(systemKey);
  if (days === null) return null;
  return DateTime.fromJSDate(now, { zone: timezone })
    .plus({ days })
    .startOf('day')
    .set({ hour: 10 })
    .toUTC()
    .toJSDate();
}

export function operationalStateSystemKey(value: string): string {
  return `CUSTOM_${value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^A-Za-z0-9_]/g, '')
    .toUpperCase()}`;
}
