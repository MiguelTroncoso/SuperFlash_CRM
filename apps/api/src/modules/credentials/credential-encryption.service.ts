import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

import { AppConfiguration } from '../../config/configuration';

@Injectable()
export class CredentialEncryptionService {
  private readonly key: Buffer;
  private readonly version = 'v1';

  constructor(config: ConfigService) {
    const configuration = config.getOrThrow<AppConfiguration>('app');
    this.key = createHash('sha256').update(configuration.credentialEncryptionKey, 'utf8').digest();
  }

  encrypt(value: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [
      this.version,
      iv.toString('base64url'),
      tag.toString('base64url'),
      ciphertext.toString('base64url'),
    ].join(':');
  }

  decrypt(value: string): string {
    const [version, ivValue, tagValue, ciphertextValue] = value.split(':');
    if (version !== this.version || !ivValue || !tagValue || ciphertextValue === undefined)
      throw new Error('Invalid credential ciphertext.');
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(ivValue, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertextValue, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  }
}
