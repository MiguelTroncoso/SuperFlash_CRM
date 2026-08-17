import { Injectable } from '@nestjs/common';
import { PaymentMethod, Prisma } from '@prisma/client';

import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser, RequestMetadata } from '../auth/auth.types';
import { jsonObject, parseMoney } from '../commercial/commercial.types';
import { UpdateCommissionDto } from './dto/commission.dto';

export interface CommissionInput {
  organizationId: string;
  method: PaymentMethod;
  grossAmount: Prisma.Decimal;
  isInternational?: boolean;
  currencyConversion?: boolean;
}

@Injectable()
export class CommissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async calculate(input: CommissionInput): Promise<Prisma.Decimal> {
    const config = await this.prisma.paymentFeeConfig.findFirst({
      where: {
        organizationId: input.organizationId,
        method: input.method,
        active: true,
        deletedAt: null,
      },
    });
    if (!config) return new Prisma.Decimal(0);
    const percentage = config.percentage
      .add(input.isInternational ? config.internationalPercentage : 0)
      .add(input.currencyConversion ? config.conversionPercentage : 0);
    return input.grossAmount.mul(percentage).div(100).add(config.fixedFee).toDecimalPlaces(2);
  }

  async list(user: AuthenticatedUser): Promise<Array<Record<string, unknown>>> {
    const rows = await this.prisma.paymentFeeConfig.findMany({
      where: { organizationId: user.organizationId, deletedAt: null },
      orderBy: { method: 'asc' },
    });
    return rows.map((row) => this.map(row));
  }

  async update(
    dto: UpdateCommissionDto,
    user: AuthenticatedUser,
    metadata: RequestMetadata,
  ): Promise<Record<string, unknown>> {
    const values = {
      percentage: parseMoney(dto.percentage),
      fixedFee: parseMoney(dto.fixedFee),
      internationalPercentage: parseMoney(dto.internationalPercentage),
      conversionPercentage: parseMoney(dto.conversionPercentage),
      active: dto.active,
    };
    const row = await this.prisma.paymentFeeConfig.upsert({
      where: { organizationId_method: { organizationId: user.organizationId, method: dto.method } },
      update: { ...values, deletedAt: null },
      create: { organizationId: user.organizationId, method: dto.method, ...values },
    });
    await this.audit.record({
      organizationId: user.organizationId,
      userId: user.userId,
      action: 'PAYMENT_COMMISSION_UPDATED',
      tableName: 'PaymentFeeConfig',
      recordId: row.id,
      newValue: jsonObject({ method: dto.method, percentage: values.percentage.toFixed(4) }),
      ip: metadata.ipAddress,
      requestId: metadata.requestId,
    });
    return this.map(row);
  }

  private map(row: {
    id: string;
    method: PaymentMethod;
    percentage: Prisma.Decimal;
    fixedFee: Prisma.Decimal;
    internationalPercentage: Prisma.Decimal;
    conversionPercentage: Prisma.Decimal;
    active: boolean;
  }): Record<string, unknown> {
    return {
      id: row.id,
      method: row.method,
      percentage: row.percentage.toFixed(4),
      fixedFee: row.fixedFee.toFixed(2),
      internationalPercentage: row.internationalPercentage.toFixed(4),
      conversionPercentage: row.conversionPercentage.toFixed(4),
      active: row.active,
    };
  }
}
