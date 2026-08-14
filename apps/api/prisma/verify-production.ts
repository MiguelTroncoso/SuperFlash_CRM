import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const requiredPipelineKeys = [
  'NEW_LEAD',
  'LEFT_ON_READ',
  'DEMO_DELIVERED',
  'AWAITING_CREDIT_USAGE',
  'AWAITING_MONEY',
  'POTENTIAL_BUYER',
  'WON',
  'LOST',
  'MESSAGE_SENT',
  'ACTIVATING',
  'ACTIVE',
  'FUTURE_REACTIVATION',
] as const;

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

async function verifyProductionData(): Promise<void> {
  const organizations = await prisma.organization.findMany({
    where: { deletedAt: null },
    select: { id: true, slug: true },
  });
  const permission = await prisma.permission.findUnique({
    where: { key: 'marketing.attribution.manage' },
    select: { id: true, deletedAt: true },
  });

  if (!permission || permission.deletedAt !== null) {
    throw new Error('Required attribution permission is missing or deleted.');
  }

  for (const organization of organizations) {
    const systemRoles = await prisma.role.findMany({
      where: {
        organizationId: organization.id,
        name: { in: ['Owner', 'Admin', 'Sales', 'Viewer'] },
        deletedAt: null,
      },
      include: { permissions: { select: { id: true } } },
    });
    const roleNames = new Set(systemRoles.map((role) => role.name));
    for (const requiredRole of ['Owner', 'Admin', 'Sales', 'Viewer']) {
      assert(
        roleNames.has(requiredRole),
        `Organization ${organization.slug} is missing ${requiredRole} role.`,
      );
    }
    assert(
      systemRoles
        .filter((role) => role.name === 'Owner' || role.name === 'Admin')
        .every((role) =>
          role.permissions.some((rolePermission) => rolePermission.id === permission.id),
        ),
      `Organization ${organization.slug} has an Owner/Admin role without attribution permission.`,
    );

    const stages = await prisma.pipelineStage.findMany({
      where: { organizationId: organization.id, deletedAt: null },
      select: { systemKey: true },
    });
    const stageKeys = stages.flatMap((stage) => (stage.systemKey ? [stage.systemKey] : []));
    const stageKeySet = new Set(stageKeys);
    assert(
      stageKeys.length === stageKeySet.size,
      `Organization ${organization.slug} contains duplicate active pipeline system keys.`,
    );
    for (const requiredKey of requiredPipelineKeys) {
      assert(
        stageKeySet.has(requiredKey),
        `Organization ${organization.slug} is missing pipeline state ${requiredKey}.`,
      );
    }

    const categories = await prisma.productCategory.findMany({
      where: { organizationId: organization.id, active: true, deletedAt: null },
      select: { slug: true },
    });
    const categorySlugs = categories.map((category) => category.slug);
    assert(
      categorySlugs.length === new Set(categorySlugs).size,
      `Organization ${organization.slug} contains duplicate active category slugs.`,
    );

    const products = await prisma.product.findMany({
      where: { organizationId: organization.id, active: true, deletedAt: null },
      select: { slug: true },
    });
    const productSlugs = products.map((product) => product.slug);
    assert(
      productSlugs.length === new Set(productSlugs).size,
      `Organization ${organization.slug} contains duplicate active product slugs.`,
    );
  }
}

verifyProductionData()
  .then(() => {
    console.info('Production data verification passed.');
  })
  .catch((error: unknown) => {
    console.error('Production data verification failed.', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
