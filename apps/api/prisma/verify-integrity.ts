import { randomUUID } from 'node:crypto';

import {
  FollowUpPriority,
  FollowUpStatus,
  PaymentStatus,
  PipelineStageCategory,
  Prisma,
  PrismaClient,
  SaleStatus,
} from '@prisma/client';

const prisma = new PrismaClient();

type AsyncOperation = () => Promise<unknown>;

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

async function expectFailure(label: string, operation: AsyncOperation): Promise<void> {
  try {
    await operation();
  } catch {
    return;
  }

  throw new Error(`Integrity check failed: ${label}`);
}

async function cleanup(organizationIds: string[]): Promise<void> {
  const where = { organizationId: { in: organizationIds } };

  await prisma.$transaction([
    prisma.auditLog.deleteMany({ where }),
    prisma.payment.deleteMany({ where }),
    prisma.saleItem.deleteMany({ where }),
    prisma.activity.deleteMany({ where }),
    prisma.followUpHistory.deleteMany({ where }),
    prisma.followUp.deleteMany({ where }),
    prisma.sale.deleteMany({ where }),
    prisma.opportunityStageHistory.deleteMany({ where }),
    prisma.opportunity.deleteMany({ where }),
    prisma.expense.deleteMany({ where }),
    prisma.contactTag.deleteMany({ where }),
    prisma.campaign.deleteMany({ where }),
    prisma.tag.deleteMany({ where }),
    prisma.contact.deleteMany({ where }),
    prisma.pipelineStage.deleteMany({ where }),
    prisma.product.deleteMany({ where }),
    prisma.user.deleteMany({ where }),
    prisma.role.deleteMany({ where }),
    prisma.organization.deleteMany({ where: { id: { in: organizationIds } } }),
  ]);
}

async function verifyIntegrity(): Promise<void> {
  const token = randomUUID().slice(0, 8);
  const organizationIds: string[] = [];

  try {
    const organizationA = await prisma.organization.create({
      data: {
        name: `Integrity A ${token}`,
        slug: `integrity-a-${token}`,
      },
    });
    const organizationB = await prisma.organization.create({
      data: {
        name: `Integrity B ${token}`,
        slug: `integrity-b-${token}`,
      },
    });
    organizationIds.push(organizationA.id, organizationB.id);

    const roleA = await prisma.role.create({
      data: {
        organizationId: organizationA.id,
        name: 'Integrity Owner',
      },
    });
    const roleB = await prisma.role.create({
      data: {
        organizationId: organizationB.id,
        name: 'Integrity Owner',
      },
    });

    const userA = await prisma.user.create({
      data: {
        organizationId: organizationA.id,
        roleId: roleA.id,
        email: `a-${token}@integrity.test`,
        firstName: 'Integrity A',
      },
    });
    const userB = await prisma.user.create({
      data: {
        organizationId: organizationB.id,
        roleId: roleB.id,
        email: `b-${token}@integrity.test`,
        firstName: 'Integrity B',
      },
    });

    const stageA = await prisma.pipelineStage.create({
      data: {
        organizationId: organizationA.id,
        name: 'Integrity Open',
        order: 1,
        color: '#000000',
        category: PipelineStageCategory.OPEN,
      },
    });
    const stageB = await prisma.pipelineStage.create({
      data: {
        organizationId: organizationB.id,
        name: 'Integrity Open',
        order: 1,
        color: '#000000',
        category: PipelineStageCategory.OPEN,
      },
    });

    const campaignA = await prisma.campaign.create({
      data: {
        organizationId: organizationA.id,
        externalId: `campaign-${token}`,
        name: 'Integrity Campaign A',
        source: 'integrity',
        platform: 'meta',
      },
    });
    const campaignB = await prisma.campaign.create({
      data: {
        organizationId: organizationB.id,
        externalId: `campaign-${token}`,
        name: 'Integrity Campaign B',
        source: 'integrity',
        platform: 'meta',
      },
    });

    await prisma.campaign.create({
      data: {
        organizationId: organizationA.id,
        name: 'Null Campaign A',
        source: 'integrity',
        platform: 'meta',
        externalId: null,
      },
    });
    await prisma.campaign.create({
      data: {
        organizationId: organizationA.id,
        name: 'Null Campaign B',
        source: 'integrity',
        platform: 'meta',
        externalId: null,
      },
    });

    const productA = await prisma.product.create({
      data: {
        organizationId: organizationA.id,
        name: 'Integrity Product A',
        sku: `sku-${token}`,
        price: new Prisma.Decimal('100.00'),
        currency: 'USD',
        active: true,
      },
    });
    const productB = await prisma.product.create({
      data: {
        organizationId: organizationB.id,
        name: 'Integrity Product B',
        sku: `sku-${token}`,
        price: new Prisma.Decimal('100.00'),
        currency: 'USD',
        active: true,
      },
    });

    await expectFailure('duplicate active product SKU in one organization', () =>
      prisma.product.create({
        data: {
          organizationId: organizationA.id,
          name: 'Duplicate SKU Product',
          sku: productA.sku,
          price: new Prisma.Decimal('100.00'),
          currency: 'USD',
          active: true,
        },
      }),
    );
    await prisma.product.update({
      where: { id: productA.id },
      data: { deletedAt: new Date() },
    });
    await prisma.product.create({
      data: {
        organizationId: organizationA.id,
        name: 'Replacement SKU Product',
        sku: productA.sku,
        price: new Prisma.Decimal('100.00'),
        currency: 'USD',
        active: true,
      },
    });

    const manualContactA = await prisma.contact.create({
      data: {
        organizationId: organizationA.id,
      },
    });
    const secondManualContactA = await prisma.contact.create({
      data: {
        organizationId: organizationA.id,
      },
    });
    assert(
      manualContactA.phoneNormalized === null && secondManualContactA.phoneNormalized === null,
      'manual contacts without phone must be allowed',
    );

    const phone = `phone-${token}`;
    const phoneContactA = await prisma.contact.create({
      data: {
        organizationId: organizationA.id,
        firstName: 'Phone A',
        phoneNormalized: phone,
      },
    });
    const contactB = await prisma.contact.create({
      data: {
        organizationId: organizationB.id,
        firstName: 'Phone B',
        phoneNormalized: phone,
      },
    });
    await expectFailure('duplicate active phone in one organization', () =>
      prisma.contact.create({
        data: {
          organizationId: organizationA.id,
          firstName: 'Duplicate',
          phoneNormalized: phone,
        },
      }),
    );

    await prisma.contact.update({
      where: { id: phoneContactA.id },
      data: { deletedAt: new Date() },
    });
    await prisma.contact.create({
      data: {
        organizationId: organizationA.id,
        firstName: 'Replacement',
        phoneNormalized: phone,
      },
    });

    await expectFailure('contact assigned to a user from another organization', () =>
      prisma.contact.create({
        data: {
          organizationId: organizationA.id,
          userId: userB.id,
          firstName: 'Cross Tenant Contact',
        },
      }),
    );

    const opportunityData = {
      organizationId: organizationA.id,
      contactId: manualContactA.id,
      pipelineStageId: stageA.id,
      campaignId: campaignA.id,
      productId: productA.id,
      title: 'Integrity Opportunity',
      expectedAmount: new Prisma.Decimal('250.00'),
      currency: 'USD',
    };

    await expectFailure('opportunity linked to another organization contact', () =>
      prisma.opportunity.create({
        data: { ...opportunityData, contactId: contactB.id },
      }),
    );
    await expectFailure('opportunity linked to another organization stage', () =>
      prisma.opportunity.create({
        data: { ...opportunityData, pipelineStageId: stageB.id },
      }),
    );
    await expectFailure('opportunity linked to another organization campaign', () =>
      prisma.opportunity.create({
        data: { ...opportunityData, campaignId: campaignB.id },
      }),
    );
    await expectFailure('opportunity linked to another organization product', () =>
      prisma.opportunity.create({
        data: { ...opportunityData, productId: productB.id },
      }),
    );

    const opportunity = await prisma.opportunity.create({
      data: opportunityData,
    });

    const followUp = await prisma.followUp.create({
      data: {
        organizationId: organizationA.id,
        userId: userA.id,
        opportunityId: opportunity.id,
        title: 'Integrity follow-up',
        dueAt: new Date(),
        priority: FollowUpPriority.NORMAL,
        status: FollowUpStatus.PENDING,
      },
    });
    const opportunityB = await prisma.opportunity.create({
      data: {
        organizationId: organizationB.id,
        contactId: contactB.id,
        pipelineStageId: stageB.id,
        title: 'Integrity Opportunity B',
      },
    });
    await expectFailure('follow-up linked to another organization opportunity', () =>
      prisma.followUp.create({
        data: {
          organizationId: organizationA.id,
          userId: userA.id,
          opportunityId: opportunityB.id,
          title: 'Cross Tenant Follow-up',
          dueAt: new Date(Date.now() + 60_000),
          priority: FollowUpPriority.NORMAL,
          status: FollowUpStatus.PENDING,
        },
      }),
    );
    await expectFailure('follow-up assigned to another organization user', () =>
      prisma.followUp.create({
        data: {
          organizationId: organizationA.id,
          userId: userB.id,
          opportunityId: opportunity.id,
          title: 'Cross Tenant Assignee',
          dueAt: new Date(Date.now() + 120_000),
          priority: FollowUpPriority.NORMAL,
          status: FollowUpStatus.PENDING,
        },
      }),
    );
    await prisma.followUpHistory.create({
      data: {
        organizationId: organizationA.id,
        followUpId: followUp.id,
        action: 'CREATED',
        changedByUserId: userA.id,
      },
    });
    await expectFailure('follow-up history linked to another organization actor', () =>
      prisma.followUpHistory.create({
        data: {
          organizationId: organizationA.id,
          followUpId: followUp.id,
          action: 'UPDATED',
          changedByUserId: userB.id,
        },
      }),
    );

    const initialHistory = await prisma.opportunityStageHistory.create({
      data: {
        organizationId: organizationA.id,
        opportunityId: opportunity.id,
        toStageId: stageA.id,
        changedByUserId: userA.id,
        reason: 'Integrity initial stage',
      },
    });
    assert(
      initialHistory.fromStageId === null,
      'initial stage history must have no previous stage',
    );
    await expectFailure('stage history linked to another organization actor', () =>
      prisma.opportunityStageHistory.create({
        data: {
          organizationId: organizationA.id,
          opportunityId: opportunity.id,
          toStageId: stageA.id,
          changedByUserId: userB.id,
        },
      }),
    );

    const sale = await prisma.sale.create({
      data: {
        organizationId: organizationA.id,
        opportunityId: opportunity.id,
        userId: userA.id,
        status: SaleStatus.OPEN,
        subtotal: new Prisma.Decimal('200.00'),
        total: new Prisma.Decimal('200.00'),
        currency: 'USD',
      },
    });

    await expectFailure('two active sales for one opportunity', () =>
      prisma.sale.create({
        data: {
          organizationId: organizationA.id,
          opportunityId: opportunity.id,
          status: SaleStatus.OPEN,
          subtotal: new Prisma.Decimal('50.00'),
          total: new Prisma.Decimal('50.00'),
          currency: 'USD',
        },
      }),
    );

    await prisma.sale.create({
      data: {
        organizationId: organizationA.id,
        opportunityId: opportunity.id,
        status: SaleStatus.CANCELLED,
        subtotal: new Prisma.Decimal('50.00'),
        total: new Prisma.Decimal('50.00'),
        currency: 'USD',
      },
    });

    await expectFailure('negative payment gross amount', () =>
      prisma.payment.create({
        data: {
          organizationId: organizationA.id,
          saleId: sale.id,
          grossAmount: new Prisma.Decimal('-1.00'),
          feeAmount: new Prisma.Decimal('0.00'),
          netAmount: new Prisma.Decimal('-1.00'),
          currency: 'USD',
          method: 'integrity',
          status: PaymentStatus.PENDING,
          paymentDate: new Date(),
        },
      }),
    );
    await expectFailure('payment net amount greater than gross amount', () =>
      prisma.payment.create({
        data: {
          organizationId: organizationA.id,
          saleId: sale.id,
          grossAmount: new Prisma.Decimal('10.00'),
          feeAmount: new Prisma.Decimal('1.00'),
          netAmount: new Prisma.Decimal('10.01'),
          currency: 'USD',
          method: 'integrity',
          status: PaymentStatus.PENDING,
          paymentDate: new Date(),
        },
      }),
    );

    await expectFailure('zero sale item quantity', () =>
      prisma.saleItem.create({
        data: {
          organizationId: organizationA.id,
          saleId: sale.id,
          productId: productA.id,
          productNameSnapshot: productA.name,
          skuSnapshot: productA.sku,
          quantity: new Prisma.Decimal('0'),
          unitPrice: productA.price,
          total: new Prisma.Decimal('0'),
          currency: productA.currency,
        },
      }),
    );

    const saleItem = await prisma.saleItem.create({
      data: {
        organizationId: organizationA.id,
        saleId: sale.id,
        productId: productA.id,
        productNameSnapshot: productA.name,
        skuSnapshot: productA.sku,
        quantity: new Prisma.Decimal('2'),
        unitPrice: productA.price,
        total: new Prisma.Decimal('200.00'),
        currency: productA.currency,
      },
    });

    await prisma.product.update({
      where: { id: productA.id },
      data: {
        name: 'Changed Product Name',
        price: new Prisma.Decimal('125.00'),
      },
    });
    const persistedItem = await prisma.saleItem.findUnique({
      where: { id: saleItem.id },
    });
    assert(
      persistedItem?.productNameSnapshot === 'Integrity Product A' &&
        persistedItem.unitPrice.eq(new Prisma.Decimal('100.00')),
      'sale item snapshots must remain unchanged',
    );

    await expectFailure('negative expense amount', () =>
      prisma.expense.create({
        data: {
          organizationId: organizationA.id,
          amount: new Prisma.Decimal('-1.00'),
          currency: 'USD',
          expenseDate: new Date(),
        },
      }),
    );
    await expectFailure('non-positive pipeline order', () =>
      prisma.pipelineStage.create({
        data: {
          organizationId: organizationA.id,
          name: 'Invalid Order',
          order: 0,
          color: '#000000',
          category: PipelineStageCategory.OPEN,
        },
      }),
    );

    console.info('Integrity checks passed.');
  } finally {
    await cleanup(organizationIds);
    await prisma.$disconnect();
  }
}

void verifyIntegrity();
