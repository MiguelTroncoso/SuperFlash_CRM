import { Request } from 'express';

export interface AuthenticatedUser {
  userId: string;
  organizationId: string;
  sessionId: string;
  roleId: string;
  roleName: string;
  permissions: readonly string[];
}

export interface AccessTokenPayload {
  sub: string;
  organizationId: string;
  sessionId: string;
  roleId: string;
  iat?: number;
  exp?: number;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

export interface PublicAuthenticatedUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string | null;
  phone: string | null;
  timezone: string;
  organization: {
    id: string;
    name: string;
    slug: string;
  };
  role: {
    id: string;
    name: string;
  };
  permissions: readonly string[];
}

export interface RequestMetadata {
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
}
