import argon2 from 'argon2';

import { buildConfiguration } from '../src/config/configuration';
import {
  createOpaqueToken,
  hashOpaqueToken,
  hashPassword,
  isOpaqueTokenFormat,
  isStrongPassword,
  normalizeEmail,
  verifyPassword,
} from '../src/modules/auth/auth.crypto';

describe('auth crypto primitives', () => {
  it('normalizes email addresses consistently', () => {
    expect(normalizeEmail('  Owner@Example.COM ')).toBe('owner@example.com');
  });

  it('creates opaque tokens with a strict format and one-way hash', () => {
    const token = createOpaqueToken();
    expect(isOpaqueTokenFormat(token)).toBe(true);
    expect(hashOpaqueToken(token)).not.toBe(token);
    expect(hashOpaqueToken(token)).toBe(hashOpaqueToken(token));
  });

  it('uses Argon2id for password hashes', async () => {
    const password = 'OwnerPassword1!';
    const passwordHash = await hashPassword(password);
    expect(passwordHash.startsWith('$argon2id$')).toBe(true);
    expect(await verifyPassword(passwordHash, password)).toBe(true);
    expect(await verifyPassword(passwordHash, 'WrongPassword1!')).toBe(false);
    await expect(argon2.verify(passwordHash, password)).resolves.toBe(true);
  });

  it('enforces the password policy', () => {
    expect(isStrongPassword('OwnerPassword1!')).toBe(true);
    expect(isStrongPassword('short')).toBe(false);
    expect(isStrongPassword('onlylowercase123!')).toBe(false);
    expect(isStrongPassword('OnlyLettersHere!')).toBe(false);
  });

  it('rejects insecure JWT configuration in production', () => {
    expect(() =>
      buildConfiguration({ NODE_ENV: 'production', DATABASE_URL: 'postgresql://localhost/app' }),
    ).toThrow('JWT_ACCESS_SECRET');
  });
});
