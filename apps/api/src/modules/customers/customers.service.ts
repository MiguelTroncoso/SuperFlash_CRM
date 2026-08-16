import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser, RequestMetadata } from '../auth/auth.types';
import { ContactsService } from '../contacts/contacts.service';
import { CreateContactDto } from '../contacts/dto/create-contact.dto';
import { UpdateContactDto } from '../contacts/dto/update-contact.dto';
import { ExecutiveIntelligenceService } from '../executive-intelligence/executive-intelligence.service';
import { ListCustomersDto } from './dto/list-customers.dto';

interface CustomerContext {
  user: AuthenticatedUser;
  metadata: RequestMetadata;
}

function customerName(
  firstName: string | null,
  lastName: string | null,
  phone: string | null,
  email: string | null,
): string {
  return [firstName, lastName].filter(Boolean).join(' ') || phone || email || 'Cliente';
}

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly contacts: ContactsService,
    private readonly intelligence: ExecutiveIntelligenceService,
  ) {}

  async create(dto: CreateContactDto, context: CustomerContext): Promise<unknown> {
    return this.contacts.create(
      { ...dto, createOpportunity: dto.createOpportunity ?? false },
      context,
    );
  }

  async list(query: ListCustomersDto, user: AuthenticatedUser) {
    const search = query.search?.trim();
    const where: Prisma.ContactWhereInput = {
      organizationId: user.organizationId,
      deletedAt: null,
      archivedAt: query.archived ? { not: null } : null,
      ...(search
        ? {
            OR: [
              { firstName: { contains: search, mode: 'insensitive' } },
              { lastName: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
              { phone: { contains: search, mode: 'insensitive' } },
              { phoneNormalized: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [contacts, total] = await Promise.all([
      this.prisma.contact.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          country: true,
          notes: true,
          isCustomer: true,
          archivedAt: true,
          createdAt: true,
          updatedAt: true,
          sales: {
            where: { deletedAt: null, status: { in: ['CONFIRMED', 'FULFILLED'] } },
            orderBy: { soldAt: 'desc' },
            select: { total: true, currency: true, soldAt: true, createdAt: true },
          },
        },
      }),
      this.prisma.contact.count({ where }),
    ]);
    return {
      data: contacts.map((contact) => {
        const purchases = contact.sales.length;
        const totals = new Map<string, Prisma.Decimal>();
        for (const sale of contact.sales)
          totals.set(
            sale.currency,
            (totals.get(sale.currency) ?? new Prisma.Decimal(0)).add(sale.total),
          );
        const lastPurchase = contact.sales[0]?.soldAt ?? contact.sales[0]?.createdAt ?? null;
        return {
          id: contact.id,
          name: customerName(contact.firstName, contact.lastName, contact.phone, contact.email),
          firstName: contact.firstName,
          lastName: contact.lastName,
          email: contact.email,
          phone: contact.phone,
          country: contact.country,
          notes: contact.notes,
          purchaseCount: purchases,
          purchasedTotals: [...totals.entries()].map(([currency, amount]) => ({
            currency,
            amount: amount.toFixed(2),
          })),
          lastPurchaseAt: lastPurchase,
          status: contact.archivedAt ? 'INACTIVE' : 'ACTIVE',
          isCustomer: contact.isCustomer || purchases > 0,
          archivedAt: contact.archivedAt,
          createdAt: contact.createdAt,
          updatedAt: contact.updatedAt,
        };
      }),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async findOne(id: string, user: AuthenticatedUser) {
    return this.intelligence.customer360(id, user);
  }

  async update(id: string, dto: UpdateContactDto, context: CustomerContext): Promise<unknown> {
    return this.contacts.update(id, dto, context);
  }

  async deactivate(id: string, context: CustomerContext): Promise<unknown> {
    return this.contacts.archive(id, { reason: 'Cliente desactivado desde Clientes' }, context);
  }

  async activate(id: string, context: CustomerContext): Promise<unknown> {
    return this.contacts.restore(id, context);
  }

  async remove(id: string, context: CustomerContext): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      const locked = await transaction.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`SELECT "id" FROM "Contact" WHERE "id" = ${id}::uuid AND "organizationId" = ${context.user.organizationId}::uuid AND "deletedAt" IS NULL FOR UPDATE`,
      );
      if (locked.length === 0)
        throw new NotFoundException({
          code: 'CUSTOMER_NOT_FOUND',
          message: 'El cliente no existe.',
        });
      const sales = await transaction.sale.count({
        where: { organizationId: context.user.organizationId, contactId: id, deletedAt: null },
      });
      if (sales > 0) {
        throw new ConflictException({
          code: 'CUSTOMER_HAS_COMMERCIAL_HISTORY',
          message: 'No es posible eliminar un cliente con historial comercial.',
        });
      }
      const now = new Date();
      await transaction.contact.update({
        where: { organizationId_id: { organizationId: context.user.organizationId, id } },
        data: { deletedAt: now, archivedAt: now },
      });
      await this.audit.recordWithClient(transaction, {
        organizationId: context.user.organizationId,
        userId: context.user.userId,
        action: 'CUSTOMER_DELETED',
        tableName: 'Contact',
        recordId: id,
        previousValue: { deletedAt: null },
        newValue: { deletedAt: now.toISOString() },
        ip: context.metadata.ipAddress,
        requestId: context.metadata.requestId,
      });
    });
  }
}
