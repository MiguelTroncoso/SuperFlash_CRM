import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Request } from 'express';
import { map, Observable } from 'rxjs';

function isResponseRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

@Injectable()
export class RequestCorrelationInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const requestId = request.requestId;
    return next.handle().pipe(
      map((body: unknown) => {
        if (!requestId || !isResponseRecord(body)) return body;
        return { ...body, requestId };
      }),
    );
  }
}
