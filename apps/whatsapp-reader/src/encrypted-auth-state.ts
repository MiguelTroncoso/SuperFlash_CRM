import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { proto } from '@whiskeysockets/baileys/WAProto/index.js';
import { initAuthCreds } from '@whiskeysockets/baileys/lib/Utils/auth-utils.js';
import { BufferJSON } from '@whiskeysockets/baileys/lib/Utils/generics.js';
import type {
  AuthenticationState,
  SignalDataSet,
  SignalDataTypeMap,
} from '@whiskeysockets/baileys/lib/Types/Auth.js';

const ALGORITHM = 'aes-256-gcm';

function keyFromEnvironment(): Buffer {
  const value = process.env.WHATSAPP_READER_AUTH_KEY?.trim();
  if (!value)
    throw new Error('WHATSAPP_READER_AUTH_KEY es obligatorio para cifrar la sesión del reader.');
  return createHash('sha256').update(value, 'utf8').digest();
}

function encrypt(value: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const content = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${content.toString('base64')}`;
}

function decrypt(value: string, key: Buffer): string {
  const [version, ivValue, tagValue, contentValue] = value.split(':');
  if (version !== 'v1' || !ivValue || !tagValue || !contentValue)
    throw new Error('Formato de sesión cifrada inválido.');
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivValue, 'base64'));
  decipher.setAuthTag(Buffer.from(tagValue, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(contentValue, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

function fileName(file: string): string {
  return file.replaceAll('/', '__').replaceAll(':', '-');
}

export async function createEncryptedMultiFileAuthState(
  folder: string,
): Promise<{ state: AuthenticationState; saveCreds: () => Promise<void> }> {
  const key = keyFromEnvironment();
  await mkdir(folder, { recursive: true, mode: 0o700 });
  const folderInfo = await stat(folder);
  if (!folderInfo.isDirectory()) throw new Error(`${folder} no es un directorio.`);

  const writeData = async (data: unknown, file: string): Promise<void> => {
    const serialized = JSON.stringify(data, BufferJSON.replacer);
    await writeFile(join(folder, fileName(file)), encrypt(serialized, key), {
      encoding: 'utf8',
      mode: 0o600,
    });
  };
  const readData = async (file: string): Promise<unknown | null> => {
    try {
      const serialized = await readFile(join(folder, fileName(file)), 'utf8');
      return JSON.parse(decrypt(serialized, key), BufferJSON.reviver) as unknown;
    } catch (error: unknown) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null;
      throw error;
    }
  };
  const removeData = async (file: string): Promise<void> => {
    try {
      await unlink(join(folder, fileName(file)));
    } catch (error: unknown) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
    }
  };

  const creds =
    ((await readData('creds.json')) as ReturnType<typeof initAuthCreds> | null) ?? initAuthCreds();
  const state: AuthenticationState = {
    creds,
    keys: {
      get: async <T extends keyof SignalDataTypeMap>(
        type: T,
        ids: string[],
      ): Promise<{ [id: string]: SignalDataTypeMap[T] }> => {
        const result: { [id: string]: SignalDataTypeMap[T] } = {};
        await Promise.all(
          ids.map(async (id) => {
            const value = await readData(`${type}-${id}.json`);
            if (value !== null)
              result[id] = (
                type === 'app-state-sync-key'
                  ? proto.Message.AppStateSyncKeyData.fromObject(value as object)
                  : value
              ) as SignalDataTypeMap[T];
          }),
        );
        return result;
      },
      set: async (data: SignalDataSet): Promise<void> => {
        await Promise.all(
          Object.entries(data).flatMap(([category, values]) =>
            Object.entries(values ?? {}).map(([id, value]) =>
              value === null
                ? removeData(`${category}-${id}.json`)
                : writeData(value, `${category}-${id}.json`),
            ),
          ),
        );
      },
    },
  };
  return { state, saveCreds: () => writeData(creds, 'creds.json') };
}
