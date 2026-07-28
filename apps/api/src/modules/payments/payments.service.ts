import { HttpStatus, Injectable } from '@nestjs/common';
import { ActivityType, PaymentStatus, Prisma } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';

import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { OutboxService } from '../../infrastructure/outbox/outbox.service';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../auth/auth.types';
import {
  CommercialRequestContext,
  jsonObject,
  normalizeCurrency,
  parseMoney,
  positive,
} from '../commercial/commercial.types';
import { COMMERCIAL_ERROR_CODES, commercialException } from '../commercial/commercial.errors';
import { isSupportedCurrency } from '../commercial/currency';
import { ListPaymentsQueryDto, CreatePaymentDto, RefundPaymentDto } from './dto/payments.dto';
import { PaymentsAccessPolicy } from './payments.policy';

function paymentFingerprint(input: {
  saleId: string;
  grossAmount: Prisma.Decimal;
  feeAmount: Prisma.Decimal;
  currency: string;
  method: string;
  reference: string | null;
  paymentDate: Date | null;
  note: string | null;
}): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        saleId: input.saleId,
        grossAmount: input.grossAmount.toFixed(2),
        feeAmount: input.feeAmount.toFixed(2),
        currency: input.currency,
        method: input.method,
        reference: input.reference,
        paymentDate: input.paymentDate?.toISOString() ?? null,
        note: input.note,
      }),
    )
    .digest('hex');
}

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly access: PaymentsAccessPolicy,
  ) {}

  async create(
    saleId: string,
    dto: CreatePaymentDto,
    context: CommercialRequestContext,
  ): Promise<Record<string, unknown>> {
    this.access.assertCreate(context.user);
    const gross = parseMoney(dto.amount ?? dto.grossAmount);
    const fee = parseMoney(dto.feeAmount);
    positive(gross, 'amount');
    if (fee.isNegative() || fee.gt(gross)) this.invalidMoney();
    const net = gross.sub(fee);
    const currency = normalizeCurrency(dto.currency);
    if (!isSupportedCurrency(currency))
      throw commercialException(
        HttpStatus.BAD_REQUEST,
        COMMERCIAL_ERROR_CODES.UNSUPPORTED_CURRENCY,
        'La moneda no está admitida.',
      );
    const reference = dto.reference?.trim() || null;
    const paymentDate = dto.paymentDate ? new Date(dto.paymentDate) : new Date();
    const note = dto.note?.trim() || null;
    const idempotencyKey = dto.idempotencyKey?.trim() || null;
    const fingerprint = paymentFingerprint({
      saleId,
      grossAmount: gross,
      feeAmount: fee,
      currency,
      method: dto.method,
      reference,
      paymentDate: dto.paymentDate ? paymentDate : null,
      note,
    });
    let result: { id: string; created: boolean };
    try {
      result = await this.prisma.$transaction(async (transaction) => {
        const sale = await transaction.sale.findFirst({
          where: { id: saleId, organizationId: context.user.organizationId, deletedAt: null },
          select: { id: true, currency: true, status: true, userId: true },
        });
        if (!sale) this.notFound(COMMERCIAL_ERROR_CODES.SALE_NOT_FOUND, 'La venta no existe.');
        if (sale.status !== 'CONFIRMED' && sale.status !== 'FULFILLED')
          throw commercialException(
            HttpStatus.CONFLICT,
            COMMERCIAL_ERROR_CODES.PAYMENT_SALE_STATE,
            'Solo se permiten pagos sobre ventas confirmadas o cumplidas.',
          );
        if (sale.currency !== currency)
          this.invalidMoney('La moneda del pago debe coincidir con la venta.');
        if (idempotencyKey) {
          const existing = await transaction.payment.findFirst({
            where: { organizationId: context.user.organizationId, idempotencyKey },
            select: { id: true, requestFingerprint: true },
          });
          if (existing) {
            if (existing.requestFingerprint !== fingerprint) this.idempotencyConflict();
            return { id: existing.id, created: false };
          }
        }
        const payment = await transaction.payment.create({
          data: {
            organizationId: context.user.organizationId,
            saleId,
            grossAmount: gross,
            feeAmount: fee,
            netAmount: net,
            currency,
            method: dto.method,
            reference,
            idempotencyKey,
            requestFingerprint: fingerprint,
            status: PaymentStatus.PENDING,
            paymentDate,
            note,
          },
          select: { id: true },
        });
        await transaction.activity.create({
          data: {
            organizationId: context.user.organizationId,
            userId: context.user.userId,
            saleId,
            type: ActivityType.PAYMENT,
            title: 'Pago creado',
            metadata: jsonObject({ status: PaymentStatus.PENDING, method: dto.method }),
            requestId: context.metadata.requestId ?? null,
          },
        });
        await this.audit.recordWithClient(transaction, {
          organizationId: context.user.organizationId,
          userId: context.user.userId,
          action: 'PAYMENT_CREATED',
          tableName: 'Payment',
          recordId: payment.id,
          newValue: jsonObject({ saleId, netAmount: net.toFixed(2), currency, method: dto.method }),
          ip: context.metadata.ipAddress,
          requestId: context.metadata.requestId,
        });
        await this.outbox.enqueueWithClient(transaction, {
          eventType: 'PaymentCreated',
          organizationId: context.user.organizationId,
          aggregateType: 'Payment',
          aggregateId: payment.id,
          actorId: context.user.userId,
          requestId: context.metadata.requestId ?? 'system',
          payload: jsonObject({ status: PaymentStatus.PENDING }),
        });
        return { id: payment.id, created: true };
      });
    } catch (error: unknown) {
      if (
        !idempotencyKey ||
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== 'P2002'
      )
        throw error;
      const existing = await this.prisma.payment.findFirst({
        where: { organizationId: context.user.organizationId, idempotencyKey },
        select: { id: true, requestFingerprint: true },
      });
      if (!existing) throw error;
      if (existing.requestFingerprint !== fingerprint) this.idempotencyConflict();
      result = { id: existing.id, created: false };
    }
    return this.findOne(result.id, context.user);
  }

  async list(
    query: ListPaymentsQueryDto,
    user: AuthenticatedUser,
  ): Promise<Record<string, unknown>> {
    this.access.assertRead(user);
    const where: Prisma.PaymentWhereInput = {
      organizationId: user.organizationId,
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.method ? { method: query.method } : {}),
      ...(query.saleId ? { saleId: query.saleId } : {}),
    };
    const orderBy: Prisma.PaymentOrderByWithRelationInput = { [query.sortBy]: query.sortOrder };
    const [records, total] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        orderBy: [orderBy, { id: query.sortOrder }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.payment.count({ where }),
    ]);
    return {
      data: records.map((record) => this.map(record)),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async findOne(id: string, user: AuthenticatedUser): Promise<Record<string, unknown>> {
    this.access.assertRead(user);
    const payment = await this.prisma.payment.findFirst({
      where: { id, organizationId: user.organizationId, deletedAt: null },
    });
    if (!payment) this.notFound(COMMERCIAL_ERROR_CODES.PAYMENT_NOT_FOUND, 'El pago no existe.');
    return this.map(payment);
  }

  async confirm(id: string, context: CommercialRequestContext): Promise<Record<string, unknown>> {
    await this.prisma.$transaction(async (transaction) => {
      const payment = await this.lockPayment(transaction, id, context.user.organizationId);
      const sale = await this.lockSale(transaction, payment.saleId, context.user.organizationId);
      this.access.assertMutate(context.user, sale.userId);
      if (sale.status !== 'CONFIRMED' && sale.status !== 'FULFILLED')
        throw commercialException(
          HttpStatus.CONFLICT,
          COMMERCIAL_ERROR_CODES.PAYMENT_SALE_STATE,
          'Solo se pueden confirmar pagos de ventas confirmadas o cumplidas.',
        );
      if (payment.status === PaymentStatus.CONFIRMED || payment.status === PaymentStatus.REFUNDED)
        return;
      if (payment.status !== PaymentStatus.PENDING)
        throw commercialException(
          HttpStatus.CONFLICT,
          COMMERCIAL_ERROR_CODES.INVALID_STATE,
          'El pago no está pendiente.',
        );
      const aggregate = await transaction.payment.aggregate({
        where: {
          organizationId: context.user.organizationId,
          saleId: sale.id,
          status: { in: [PaymentStatus.CONFIRMED, PaymentStatus.REFUNDED] },
          deletedAt: null,
          id: { not: id },
        },
        _sum: { netAmount: true, refundedAmount: true },
      });
      const confirmed = (aggregate._sum.netAmount ?? new Prisma.Decimal(0)).sub(
        aggregate._sum.refundedAmount ?? new Prisma.Decimal(0),
      );
      if (payment.netAmount.gt(sale.total.sub(confirmed)))
        throw commercialException(
          HttpStatus.CONFLICT,
          COMMERCIAL_ERROR_CODES.PAYMENT_EXCEEDS_BALANCE,
          'El pago excede el saldo pendiente de la venta.',
        );
      await transaction.payment.update({
        where: { organizationId_id: { organizationId: context.user.organizationId, id } },
        data: {
          status: PaymentStatus.CONFIRMED,
          confirmedAt: new Date(),
          version: { increment: 1 },
        },
      });
      await transaction.activity.create({
        data: {
          organizationId: context.user.organizationId,
          userId: context.user.userId,
          saleId: sale.id,
          type: ActivityType.PAYMENT,
          title: 'Pago confirmado',
          metadata: jsonObject({ status: PaymentStatus.CONFIRMED }),
          requestId: context.metadata.requestId ?? null,
        },
      });
      await this.audit.recordWithClient(transaction, {
        organizationId: context.user.organizationId,
        userId: context.user.userId,
        action: 'PAYMENT_CONFIRMED',
        tableName: 'Payment',
        recordId: id,
        previousValue: jsonObject({ status: PaymentStatus.PENDING }),
        newValue: jsonObject({ status: PaymentStatus.CONFIRMED }),
        ip: context.metadata.ipAddress,
        requestId: context.metadata.requestId,
      });
      await this.outbox.enqueueWithClient(transaction, {
        eventType: 'PaymentConfirmed',
        organizationId: context.user.organizationId,
        aggregateType: 'Payment',
        aggregateId: id,
        actorId: context.user.userId,
        requestId: context.metadata.requestId ?? randomUUID(),
        payload: jsonObject({ status: PaymentStatus.CONFIRMED }),
      });
    });
    return this.findOne(id, context.user);
  }

  async fail(id: string, context: CommercialRequestContext): Promise<Record<string, unknown>> {
    return this.transitionFailure(id, context);
  }

  async refund(
    id: string,
    dto: RefundPaymentDto,
    context: CommercialRequestContext,
  ): Promise<Record<string, unknown>> {
    const refund = parseMoney(dto.amount);
    positive(refund, 'refund amount');
    await this.prisma.$transaction(async (transaction) => {
      const payment = await this.lockPayment(transaction, id, context.user.organizationId);
      const sale = await transaction.sale.findFirst({
        where: { id: payment.saleId, organizationId: context.user.organizationId, deletedAt: null },
        select: { userId: true },
      });
      if (!sale) this.notFound(COMMERCIAL_ERROR_CODES.SALE_NOT_FOUND, 'La venta no existe.');
      this.access.assertMutate(context.user, sale.userId);
      if (payment.status !== PaymentStatus.CONFIRMED && payment.status !== PaymentStatus.REFUNDED)
        throw commercialException(
          HttpStatus.CONFLICT,
          COMMERCIAL_ERROR_CODES.INVALID_STATE,
          'Solo se pueden reembolsar pagos confirmados.',
        );
      const available = payment.netAmount.sub(payment.refundedAmount);
      if (refund.gt(available))
        throw commercialException(
          HttpStatus.CONFLICT,
          COMMERCIAL_ERROR_CODES.PAYMENT_INVALID_REFUND,
          'El reembolso excede el importe disponible.',
        );
      const next = payment.refundedAmount.add(refund);
      await transaction.payment.update({
        where: { organizationId_id: { organizationId: context.user.organizationId, id } },
        data: {
          refundedAmount: next,
          refundedAt: new Date(),
          refundReason: dto.reason?.trim() || null,
          status: PaymentStatus.REFUNDED,
          version: { increment: 1 },
        },
      });
      await transaction.activity.create({
        data: {
          organizationId: context.user.organizationId,
          userId: context.user.userId,
          saleId: payment.saleId,
          type: ActivityType.PAYMENT,
          title: 'Pago reembolsado',
          metadata: jsonObject({ status: PaymentStatus.REFUNDED, amount: refund.toFixed(2) }),
          requestId: context.metadata.requestId ?? null,
        },
      });
      await this.audit.recordWithClient(transaction, {
        organizationId: context.user.organizationId,
        userId: context.user.userId,
        action: 'PAYMENT_REFUNDED',
        tableName: 'Payment',
        recordId: id,
        newValue: jsonObject({ refundedAmount: next.toFixed(2) }),
        ip: context.metadata.ipAddress,
        requestId: context.metadata.requestId,
      });
      await this.outbox.enqueueWithClient(transaction, {
        eventType: 'PaymentRefunded',
        organizationId: context.user.organizationId,
        aggregateType: 'Payment',
        aggregateId: id,
        actorId: context.user.userId,
        requestId: context.metadata.requestId ?? randomUUID(),
        payload: jsonObject({ status: PaymentStatus.REFUNDED, amount: refund.toFixed(2) }),
      });
    });
    return this.findOne(id, context.user);
  }

  private async transitionFailure(
    id: string,
    context: CommercialRequestContext,
  ): Promise<Record<string, unknown>> {
    await this.prisma.$transaction(async (transaction) => {
      const payment = await this.lockPayment(transaction, id, context.user.organizationId);
      const sale = await transaction.sale.findFirst({
        where: { id: payment.saleId, organizationId: context.user.organizationId, deletedAt: null },
        select: { userId: true },
      });
      if (!sale) this.notFound(COMMERCIAL_ERROR_CODES.SALE_NOT_FOUND, 'La venta no existe.');
      this.access.assertMutate(context.user, sale.userId);
      if (payment.status === PaymentStatus.FAILED) return;
      if (payment.status !== PaymentStatus.PENDING)
        throw commercialException(
          HttpStatus.CONFLICT,
          COMMERCIAL_ERROR_CODES.INVALID_STATE,
          'El pago no está pendiente.',
        );
      await transaction.payment.update({
        where: { organizationId_id: { organizationId: context.user.organizationId, id } },
        data: { status: PaymentStatus.FAILED, failedAt: new Date(), version: { increment: 1 } },
      });
      await transaction.activity.create({
        data: {
          organizationId: context.user.organizationId,
          userId: context.user.userId,
          saleId: payment.saleId,
          type: ActivityType.PAYMENT,
          title: 'Pago fallido',
          metadata: jsonObject({ status: PaymentStatus.FAILED }),
          requestId: context.metadata.requestId ?? null,
        },
      });
      await this.audit.recordWithClient(transaction, {
        organizationId: context.user.organizationId,
        userId: context.user.userId,
        action: 'PAYMENT_FAILED',
        tableName: 'Payment',
        recordId: id,
        newValue: jsonObject({ status: PaymentStatus.FAILED }),
        ip: context.metadata.ipAddress,
        requestId: context.metadata.requestId,
      });
      await this.outbox.enqueueWithClient(transaction, {
        eventType: 'PaymentFailed',
        organizationId: context.user.organizationId,
        aggregateType: 'Payment',
        aggregateId: id,
        actorId: context.user.userId,
        requestId: context.metadata.requestId ?? randomUUID(),
        payload: jsonObject({ status: PaymentStatus.FAILED }),
      });
    });
    return this.findOne(id, context.user);
  }

  private async lockPayment(
    transaction: Prisma.TransactionClient,
    id: string,
    organizationId: string,
  ) {
    const locked = await transaction.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`SELECT "id" FROM "Payment" WHERE "id" = ${id}::uuid AND "organizationId" = ${organizationId}::uuid FOR UPDATE`,
    );
    if (locked.length === 0)
      this.notFound(COMMERCIAL_ERROR_CODES.PAYMENT_NOT_FOUND, 'El pago no existe.');
    const payment = await transaction.payment.findFirst({
      where: { id, organizationId, deletedAt: null },
    });
    if (!payment) this.notFound(COMMERCIAL_ERROR_CODES.PAYMENT_NOT_FOUND, 'El pago no existe.');
    return payment;
  }

  private async lockSale(
    transaction: Prisma.TransactionClient,
    id: string,
    organizationId: string,
  ) {
    const locked = await transaction.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`SELECT "id" FROM "Sale" WHERE "id" = ${id}::uuid AND "organizationId" = ${organizationId}::uuid AND "deletedAt" IS NULL FOR UPDATE`,
    );
    if (locked.length === 0)
      this.notFound(COMMERCIAL_ERROR_CODES.SALE_NOT_FOUND, 'La venta no existe.');
    const sale = await transaction.sale.findFirst({
      where: { id, organizationId, deletedAt: null },
      select: { id: true, total: true, currency: true, status: true, userId: true },
    });
    if (!sale) this.notFound(COMMERCIAL_ERROR_CODES.SALE_NOT_FOUND, 'La venta no existe.');
    return sale;
  }

  private map(payment: Prisma.PaymentGetPayload<object>): Record<string, unknown> {
    return {
      id: payment.id,
      saleId: payment.saleId,
      grossAmount: payment.grossAmount.toFixed(2),
      feeAmount: payment.feeAmount.toFixed(2),
      netAmount: payment.netAmount.toFixed(2),
      refundedAmount: payment.refundedAmount.toFixed(2),
      currency: payment.currency,
      method: payment.method,
      reference: payment.reference,
      status: payment.status,
      paymentDate: payment.paymentDate,
      confirmedAt: payment.confirmedAt,
      refundedAt: payment.refundedAt,
      createdAt: payment.createdAt,
      updatedAt: payment.updatedAt,
    };
  }

  private invalidMoney(message = 'Los importes del pago no son válidos.'): never {
    throw commercialException(
      HttpStatus.BAD_REQUEST,
      COMMERCIAL_ERROR_CODES.INVALID_MONEY,
      message,
    );
  }

  private idempotencyConflict(): never {
    throw commercialException(
      HttpStatus.CONFLICT,
      COMMERCIAL_ERROR_CODES.PAYMENT_IDEMPOTENCY_CONFLICT,
      'La idempotencyKey ya fue utilizada con datos diferentes.',
    );
  }

  private notFound(code: string, message: string): never {
    throw commercialException(HttpStatus.NOT_FOUND, code, message);
  }
}
