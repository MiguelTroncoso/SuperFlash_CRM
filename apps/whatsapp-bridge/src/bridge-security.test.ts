import assert from 'node:assert/strict';
import { test } from 'node:test';

import { signBody, verifySignature } from './signature.js';

test('verifies an HMAC request only within the timestamp window', () => {
  const body = JSON.stringify({ requestId: 'test-request' });
  const timestamp = String(Date.now());
  const signature = signBody('a'.repeat(32), body, timestamp);
  assert.equal(verifySignature('a'.repeat(32), body, timestamp, signature), true);
  assert.equal(verifySignature('b'.repeat(32), body, timestamp, signature), false);
  assert.equal(verifySignature('a'.repeat(32), `${body}x`, timestamp, signature), false);
});
