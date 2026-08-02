import { createHmac, timingSafeEqual } from 'node:crypto';

const MAX_CLOCK_SKEW_MS = 300_000;

export function signBody(secret: string, body: string, timestamp: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${body}`, 'utf8').digest('hex');
}

export function verifySignature(
  secret: string,
  body: string,
  timestamp: string | undefined,
  signature: string | undefined,
): boolean {
  if (!timestamp || !signature || !/^\d{10,13}$/.test(timestamp)) return false;
  if (!/^[a-f0-9]{64}$/i.test(signature)) return false;
  const numeric = Number(timestamp);
  const milliseconds = timestamp.length === 13 ? numeric : numeric * 1000;
  if (!Number.isFinite(milliseconds) || Math.abs(Date.now() - milliseconds) > MAX_CLOCK_SKEW_MS)
    return false;
  const expected = Buffer.from(signBody(secret, body, timestamp), 'utf8');
  const received = Buffer.from(signature, 'utf8');
  return expected.length === received.length && timingSafeEqual(expected, received);
}
