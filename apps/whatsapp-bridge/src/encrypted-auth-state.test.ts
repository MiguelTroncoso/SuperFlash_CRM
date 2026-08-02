import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { createEncryptedAuthState } from './encrypted-auth-state.js';

test('persists Baileys credentials encrypted at rest', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'superflash-whatsapp-bridge-'));
  try {
    const { saveCreds } = await createEncryptedAuthState(folder, 'a'.repeat(32));
    await saveCreds();
    const files = await readdir(folder);
    assert.deepEqual(files, ['creds.json']);
    const serialized = await readFile(join(folder, 'creds.json'), 'utf8');
    assert.match(serialized, /^v1:[A-Za-z0-9+/=]+:/);
    assert.doesNotMatch(serialized, /noiseKey|signedIdentityKey|registrationId/);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
