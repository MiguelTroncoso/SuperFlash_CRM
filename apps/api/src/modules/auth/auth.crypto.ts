import { createHash, randomBytes } from 'node:crypto';

import argon2 from 'argon2';

export const PASSWORD_POLICY_MESSAGE =
  'La contraseña debe tener entre 10 y 128 caracteres, con mayúscula, minúscula, número y símbolo.';

const PASSWORD_POLICY = /^(?=.{10,128}$)(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[^A-Za-z0-9]).*$/;
const OPAQUE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isStrongPassword(password: string): boolean {
  return PASSWORD_POLICY.test(password);
}

export function createOpaqueToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashOpaqueToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function isOpaqueTokenFormat(token: string): boolean {
  return OPAQUE_TOKEN_PATTERN.test(token);
}

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  });
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  return argon2.verify(hash, password);
}
