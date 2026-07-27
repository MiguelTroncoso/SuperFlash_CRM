import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';

interface ErrorResponseBody {
  statusCode?: unknown;
  code?: unknown;
  message?: unknown;
  existingContactId?: unknown;
  existingTagId?: unknown;
  existingOpportunityId?: unknown;
  existingStageId?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const rawResponse = exception instanceof HttpException ? exception.getResponse() : undefined;
    const body = isRecord(rawResponse) ? (rawResponse as ErrorResponseBody) : undefined;
    const message = this.normalizeMessage(body?.message ?? rawResponse, status);
    const code = this.normalizeCode(body?.code, status);

    if (status >= 500) {
      this.logger.error(exception instanceof Error ? exception.message : 'Unhandled exception');
    }

    response.status(status).json({
      statusCode: status,
      code,
      message,
      ...this.safeDetails(body),
    });
  }

  private safeDetails(body: ErrorResponseBody | undefined): Record<string, string> {
    const details: Record<string, string> = {};
    if (typeof body?.existingContactId === 'string') {
      details.existingContactId = body.existingContactId;
    }
    if (typeof body?.existingTagId === 'string') {
      details.existingTagId = body.existingTagId;
    }
    if (typeof body?.existingOpportunityId === 'string') {
      details.existingOpportunityId = body.existingOpportunityId;
    }
    if (typeof body?.existingStageId === 'string') {
      details.existingStageId = body.existingStageId;
    }
    return details;
  }

  private normalizeMessage(value: unknown, status: number): string {
    if (Array.isArray(value)) {
      return value.filter((item): item is string => typeof item === 'string').join(' ');
    }
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
    if (status === HttpStatus.UNAUTHORIZED) {
      return 'No estás autenticado.';
    }
    if (status === HttpStatus.FORBIDDEN) {
      return 'No tienes permisos para realizar esta acción.';
    }
    if (status === HttpStatus.TOO_MANY_REQUESTS) {
      return 'Demasiadas solicitudes. Intenta nuevamente más tarde.';
    }
    return 'Ocurrió un error inesperado.';
  }

  private normalizeCode(value: unknown, status: number): string {
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
    if (status === HttpStatus.UNAUTHORIZED) {
      return 'AUTH_UNAUTHORIZED';
    }
    if (status === HttpStatus.FORBIDDEN) {
      return 'AUTH_FORBIDDEN';
    }
    if (status === HttpStatus.TOO_MANY_REQUESTS) {
      return 'AUTH_RATE_LIMITED';
    }
    if (status === HttpStatus.BAD_REQUEST) {
      return 'VALIDATION_ERROR';
    }
    if (status === HttpStatus.NOT_FOUND) {
      return 'NOT_FOUND';
    }
    if (status === HttpStatus.CONFLICT) {
      return 'CONFLICT';
    }
    return 'INTERNAL_SERVER_ERROR';
  }
}
