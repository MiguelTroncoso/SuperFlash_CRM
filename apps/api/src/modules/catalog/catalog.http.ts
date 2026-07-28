import { Request } from 'express';

import { RequestMetadata } from '../auth/auth.types';

export function requestMetadata(request: Request): RequestMetadata {
  const forwardedFor = request.headers['x-forwarded-for'];
  const forwardedIp =
    typeof forwardedFor === 'string' ? forwardedFor.split(',')[0]?.trim() : undefined;
  const ipAddress = forwardedIp || request.ip;
  const userAgent = request.get('user-agent')?.slice(0, 512);
  return { ...(ipAddress ? { ipAddress } : {}), ...(userAgent ? { userAgent } : {}) };
}
