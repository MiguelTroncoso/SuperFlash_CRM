import { createParamDecorator, ExecutionContext } from '@nestjs/common';

import { AuthenticatedRequest } from '../auth.types';

export const CurrentOrganization = createParamDecorator(
  (_data: undefined, context: ExecutionContext): string => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.user) {
      throw new Error('Authenticated organization context is unavailable.');
    }
    return request.user.organizationId;
  },
);
