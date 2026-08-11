import { SetMetadata } from '@nestjs/common';

export const ANY_PERMISSIONS_KEY = 'auth:any-permissions';

export const AnyPermissions = (...permissions: string[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ANY_PERMISSIONS_KEY, permissions);
