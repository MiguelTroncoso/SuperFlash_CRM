import { registerAs } from '@nestjs/config';
import { IANAZone } from 'luxon';

export interface AppConfiguration {
  nodeEnv: string;
  apiPort: number;
  webUrl: string;
  databaseUrl: string;
  redisUrl: string;
  jwtAccessSecret: string;
  jwtAccessTtlSeconds: number;
  refreshTokenTtlDays: number;
  cookieSecure: boolean;
  swaggerEnabled: boolean;
  passwordResetTtlMinutes: number;
  defaultTimezone: string;
  credentialEncryptionKey: string;
}

type Environment = Readonly<Record<string, string | undefined>>;

const DEVELOPMENT_JWT_SECRET = 'superflash-development-access-secret-please-change';

function parsePositiveInteger(value: string | undefined, fallback: number, key: string): number {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${key} debe ser un entero positivo.`);
  }
  return parsed;
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback;
  }

  if (value === 'true' || value === '1') {
    return true;
  }

  if (value === 'false' || value === '0') {
    return false;
  }

  throw new Error(`El valor booleano "${value}" no es válido.`);
}

export function buildConfiguration(environment: Environment): AppConfiguration {
  const nodeEnv = environment.NODE_ENV?.trim() || 'development';
  const databaseUrl = environment.DATABASE_URL?.trim();
  const jwtAccessSecret = environment.JWT_ACCESS_SECRET?.trim() || DEVELOPMENT_JWT_SECRET;
  const credentialEncryptionKey =
    environment.CREDENTIAL_ENCRYPTION_KEY?.trim() ||
    'superflash-development-credential-key-please-change-before-production';

  if (!databaseUrl) {
    throw new Error('DATABASE_URL es obligatorio para iniciar la API.');
  }

  if (
    nodeEnv === 'production' &&
    (jwtAccessSecret === DEVELOPMENT_JWT_SECRET || jwtAccessSecret.length < 32)
  ) {
    throw new Error(
      'JWT_ACCESS_SECRET es obligatorio en producción y debe tener al menos 32 caracteres.',
    );
  }

  if (nodeEnv === 'production' && credentialEncryptionKey.length < 32) {
    throw new Error(
      'CREDENTIAL_ENCRYPTION_KEY es obligatorio en producción y debe tener al menos 32 caracteres.',
    );
  }

  const defaultTimezone = environment.DEFAULT_TIMEZONE?.trim() || 'America/Santiago';
  if (!IANAZone.isValidZone(defaultTimezone)) {
    throw new Error(`DEFAULT_TIMEZONE no es una zona IANA válida: ${defaultTimezone}.`);
  }

  return {
    nodeEnv,
    apiPort: parsePositiveInteger(environment.API_PORT, 3001, 'API_PORT'),
    webUrl: environment.WEB_URL?.trim() || 'http://localhost:3000',
    databaseUrl,
    redisUrl: environment.REDIS_URL?.trim() || 'redis://localhost:6379',
    jwtAccessSecret,
    jwtAccessTtlSeconds: parsePositiveInteger(
      environment.JWT_ACCESS_TTL_SECONDS,
      900,
      'JWT_ACCESS_TTL_SECONDS',
    ),
    refreshTokenTtlDays: parsePositiveInteger(
      environment.REFRESH_TOKEN_TTL_DAYS,
      30,
      'REFRESH_TOKEN_TTL_DAYS',
    ),
    cookieSecure: parseBoolean(environment.COOKIE_SECURE, nodeEnv === 'production'),
    swaggerEnabled: parseBoolean(environment.SWAGGER_ENABLED, nodeEnv !== 'production'),
    passwordResetTtlMinutes: 30,
    defaultTimezone,
    credentialEncryptionKey,
  };
}

export function validateEnvironment(environment: Record<string, unknown>): AppConfiguration {
  const normalized: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(environment)) {
    normalized[key] = typeof value === 'string' ? value : undefined;
  }
  return buildConfiguration(normalized);
}

export const appConfiguration = registerAs('app', () => buildConfiguration(process.env));
