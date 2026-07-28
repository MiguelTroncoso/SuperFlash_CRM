import { Request } from 'express';

import { requestIdOf } from '../../infrastructure/http/request-correlation';
import { AuthenticatedUser } from '../auth/auth.types';
import { AutomationRequestContext } from './automation.types';

export function automationRequestContext(
  request: Request,
  user: AuthenticatedUser,
): AutomationRequestContext {
  const forwardedFor = request.headers['x-forwarded-for'];
  const forwardedIp =
    typeof forwardedFor === 'string' ? forwardedFor.split(',')[0]?.trim() : undefined;
  const ipAddress = forwardedIp || request.ip;
  return {
    user,
    metadata: {
      ...(ipAddress ? { ipAddress } : {}),
      requestId: requestIdOf(request),
    },
  };
}
