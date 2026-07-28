import { randomUUID } from 'node:crypto';

import { NextFunction, Request, Response } from 'express';

const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

declare module 'express-serve-static-core' {
  interface Request {
    requestId?: string;
  }
}

export function requestCorrelationMiddleware(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  const incoming = request.header('x-request-id')?.trim();
  const requestId = incoming && REQUEST_ID_PATTERN.test(incoming) ? incoming : randomUUID();
  request.requestId = requestId;
  response.setHeader('x-request-id', requestId);
  next();
}

export function requestIdOf(request: Request): string {
  return request.requestId ?? randomUUID();
}
