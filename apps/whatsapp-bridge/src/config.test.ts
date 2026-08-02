import assert from 'node:assert/strict';
import { test } from 'node:test';

import { readConfiguration } from './config.js';

test('keeps the provider disabled when the kill switch or encryption key is missing', () => {
  const configuration = readConfiguration({
    WHATSAPP_WEB_BRIDGE_ENABLED: 'true',
    WHATSAPP_BRIDGE_API_URL: 'http://api:3001/api/v1',
    WHATSAPP_BRIDGE_INTERNAL_SECRET: 'a'.repeat(32),
    WHATSAPP_BRIDGE_CHANNEL_KEY: 'channel-1',
  });

  assert.equal(configuration.enabled, false);
  assert.equal(configuration.missing.includes('WHATSAPP_WEB_SESSION_ENCRYPTION_KEY'), true);
});

test('enables the provider only with all required operational secrets', () => {
  const configuration = readConfiguration({
    WHATSAPP_WEB_BRIDGE_ENABLED: 'true',
    WHATSAPP_BRIDGE_API_URL: 'http://api:3001/api/v1',
    WHATSAPP_BRIDGE_INTERNAL_SECRET: 'a'.repeat(32),
    WHATSAPP_BRIDGE_CHANNEL_KEY: 'channel-1',
    WHATSAPP_WEB_SESSION_ENCRYPTION_KEY: 'b'.repeat(32),
  });

  assert.equal(configuration.enabled, true);
  assert.deepEqual(configuration.missing, []);
});
