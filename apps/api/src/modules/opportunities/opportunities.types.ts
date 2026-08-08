import { OpportunityPriority, PipelineStageCategory, Prisma } from '@prisma/client';

const DECIMAL_AMOUNT = /^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/;

export type OpportunityStatus = 'OPEN' | 'WON' | 'LOST' | 'ARCHIVED';

export interface OpportunityWarning {
  code: string;
}

export interface PublicOpportunityStage {
  id: string;
  name: string;
  color: string;
  category: PipelineStageCategory;
  systemKey: string | null;
  order: number;
  active: boolean;
}

export interface PublicOpportunityContact {
  id: string;
  displayName: string | null;
  phone: string | null;
  country: string | null;
}

export interface PublicOpportunityUser {
  id: string;
  firstName: string;
  lastName: string | null;
}

export interface PublicOpportunityRelation {
  id: string;
  name: string;
}

export interface PublicOpportunity {
  id: string;
  title: string;
  notes: string | null;
  expectedAmount: string | null;
  currency: string | null;
  probability: number;
  priority: OpportunityPriority;
  status: OpportunityStatus;
  archivedAt: Date | null;
  archiveReason: string | null;
  wonAt: Date | null;
  lostAt: Date | null;
  lostReason: string | null;
  closedAt: Date | null;
  lastStageChangedAt: Date | null;
  contact: PublicOpportunityContact;
  pipelineStage: PublicOpportunityStage;
  assignedTo: PublicOpportunityUser | null;
  campaign: PublicOpportunityRelation | null;
  category: PublicOpportunityRelation | null;
  product: PublicOpportunityRelation | null;
  nextFollowUp: { id: string; title: string; dueAt: Date; status: string } | null;
  createdAt: Date;
  updatedAt: Date;
}

export type OpportunityAuditValue = Prisma.InputJsonObject;

export function opportunityStatus(
  archivedAt: Date | null,
  category: PipelineStageCategory,
): OpportunityStatus {
  if (archivedAt) return 'ARCHIVED';
  if (category === PipelineStageCategory.WON) return 'WON';
  if (category === PipelineStageCategory.LOST) return 'LOST';
  return 'OPEN';
}

export function normalizeTitle(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const normalized = value.trim().replace(/\s+/g, ' ');
  return normalized.length > 0 ? normalized : null;
}

export function normalizeCurrency(value: string | null | undefined): string | null {
  if (value === null || value === undefined || value.trim().length === 0) return null;
  return value.trim().toUpperCase();
}

export function isValidExpectedAmount(value: string | null | undefined): boolean {
  return value === null || value === undefined || DECIMAL_AMOUNT.test(value.trim());
}

export function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(`${createdAt.toISOString()}|${id}`, 'utf8').toString('base64url');
}

export function decodeCursor(cursor: string): { createdAt: Date; id: string } | null {
  try {
    const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
    const separator = decoded.indexOf('|');
    if (separator <= 0) return null;
    const createdAt = new Date(decoded.slice(0, separator));
    const id = decoded.slice(separator + 1);
    if (Number.isNaN(createdAt.getTime()) || !/^[0-9a-f-]{36}$/i.test(id)) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}
