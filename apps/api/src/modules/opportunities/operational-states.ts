import { DateTime } from 'luxon';

export const OPERATIONAL_STATE_DEFINITIONS = [
  { key: 'NEW', label: 'Nuevo', followUpDays: null, manualFollowUp: false },
  { key: 'MESSAGE_SENT', label: 'Mensaje enviado', followUpDays: 2, manualFollowUp: false },
  { key: 'DEMO_SENT', label: 'Demo enviada', followUpDays: 1, manualFollowUp: false },
  { key: 'NO_RESPONSE', label: 'No responde', followUpDays: 3, manualFollowUp: false },
  { key: 'TALK_LATER', label: 'Hablar más adelante', followUpDays: null, manualFollowUp: true },
  { key: 'WANTS_TO_BUY', label: 'Quiere comprar', followUpDays: null, manualFollowUp: true },
  { key: 'PURCHASED', label: 'Compró', followUpDays: null, manualFollowUp: false },
  { key: 'LOST', label: 'Perdido', followUpDays: null, manualFollowUp: false },
] as const;

export type OperationalStateKey = (typeof OPERATIONAL_STATE_DEFINITIONS)[number]['key'];

const STATE_BY_KEY = new Map(
  OPERATIONAL_STATE_DEFINITIONS.map((definition) => [definition.key, definition]),
);

const LEGACY_STATE_KEYS: Record<string, OperationalStateKey> = {
  NEW_LEAD: 'NO_RESPONSE',
  NUEVO_LEAD: 'NO_RESPONSE',
  NUEVO: 'NEW',
  MENSAJE_ENVIADO: 'MESSAGE_SENT',
  DEJO_EN_VISTO: 'NO_RESPONSE',
  WAITING_CUSTOMER: 'NO_RESPONSE',
  DEMO_ENTREGADA: 'DEMO_SENT',
  LEFT_ON_READ: 'NO_RESPONSE',
  DEMO_DELIVERED: 'DEMO_SENT',
  COMPRO: 'PURCHASED',
  DEMO_ENVIADA: 'DEMO_SENT',
  HABLAR_MAS_ADELANTE: 'TALK_LATER',
  QUIERE_COMPRAR: 'WANTS_TO_BUY',
  PERDIDO: 'LOST',
  PAID: 'PURCHASED',
  WON: 'PURCHASED',
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
  const normalized = systemKey
    ?.normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_');
  // Preserve the historical SLA for legacy stages while the new visible
  // NO_RESPONSE state uses the Sprint 34 rule of three days.
  if (
    normalized === 'LEFT_ON_READ' ||
    normalized === 'DEJO_EN_VISTO' ||
    normalized === 'WAITING_CUSTOMER'
  )
    return 4;
  const key = operationalStateKey(systemKey);
  return key ? (STATE_BY_KEY.get(key)?.followUpDays ?? null) : null;
}

export function stateRequiresManualFollowUp(systemKey: string | null | undefined): boolean {
  const key = operationalStateKey(systemKey);
  return key ? (STATE_BY_KEY.get(key)?.manualFollowUp ?? false) : false;
}

export function isPurchasedState(systemKey: string | null | undefined): boolean {
  return operationalStateKey(systemKey) === 'PURCHASED';
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
