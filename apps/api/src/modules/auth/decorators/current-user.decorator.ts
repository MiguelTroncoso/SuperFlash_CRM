import { createParamDecorator, ExecutionContext } from '@nestjs/common';

import { AuthenticatedRequest, AuthenticatedUser } from '../auth.types';

export const CurrentUser = createParamDecorator(
  (_data: undefined, context: ExecutionContext): AuthenticatedUser => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.user) {
      throw new Error('Authenticated user context is unavailable.');
    }
    return request.user;
  },
);
