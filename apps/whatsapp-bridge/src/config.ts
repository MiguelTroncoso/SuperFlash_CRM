export interface BridgeConfiguration {
  readonly enabled: boolean;
  readonly apiUrl: string;
  readonly internalSecret: string | null;
  readonly channelKey: string | null;
  readonly sessionEncryptionKey: string | null;
  readonly sessionDir: string;
  readonly port: number;
  readonly missing: readonly string[];
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error('WHATSAPP_BRIDGE_PORT inválido.');
  return parsed;
}

export function readConfiguration(
  environment: NodeJS.ProcessEnv = process.env,
): BridgeConfiguration {
  const required = {
    WHATSAPP_BRIDGE_API_URL: environment.WHATSAPP_BRIDGE_API_URL?.trim(),
    WHATSAPP_BRIDGE_INTERNAL_SECRET: environment.WHATSAPP_BRIDGE_INTERNAL_SECRET?.trim(),
    WHATSAPP_BRIDGE_CHANNEL_KEY: environment.WHATSAPP_BRIDGE_CHANNEL_KEY?.trim(),
    WHATSAPP_WEB_SESSION_ENCRYPTION_KEY: environment.WHATSAPP_WEB_SESSION_ENCRYPTION_KEY?.trim(),
  };
  const missing = Object.entries(required)
    .filter(([, value]) => !value)
    .map(([key]) => key);
  const killSwitch = environment.WHATSAPP_WEB_BRIDGE_ENABLED === 'true';
  return {
    enabled: killSwitch && missing.length === 0,
    apiUrl: required.WHATSAPP_BRIDGE_API_URL ?? 'http://api:3001/api/v1',
    internalSecret: required.WHATSAPP_BRIDGE_INTERNAL_SECRET ?? null,
    channelKey: required.WHATSAPP_BRIDGE_CHANNEL_KEY ?? null,
    sessionEncryptionKey: required.WHATSAPP_WEB_SESSION_ENCRYPTION_KEY ?? null,
    sessionDir: environment.WHATSAPP_WEB_SESSION_DIR?.trim() || '/data/session',
    port: positiveInteger(environment.WHATSAPP_BRIDGE_PORT, 3020),
    missing,
  };
}
