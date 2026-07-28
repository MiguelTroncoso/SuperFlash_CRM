import { Prisma, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function isSnapshotObject(value: Prisma.JsonValue): value is Prisma.JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function main(): Promise<void> {
  const [otherPayments, saleItems, subscriptions, renewals] = await Promise.all([
    prisma.payment.count({ where: { method: 'OTHER', deletedAt: null } }),
    prisma.saleItem.findMany({
      where: { deletedAt: null },
      select: { id: true, snapshotVersion: true, catalogSnapshot: true },
    }),
    prisma.subscription.findMany({
      where: { deletedAt: null },
      select: { id: true, snapshotVersion: true, catalogSnapshot: true },
    }),
    prisma.renewal.findMany({
      where: { deletedAt: null },
      select: { id: true, snapshotVersion: true, catalogSnapshot: true },
    }),
  ]);
  const incomplete = [...saleItems, ...subscriptions, ...renewals].filter(
    (record) =>
      record.snapshotVersion < 2 ||
      !isSnapshotObject(record.catalogSnapshot) ||
      record.catalogSnapshot.snapshotVersion !== 2,
  );

  console.log(`Legacy payment methods mapped to OTHER: ${otherPayments}`);
  console.log(`Legacy or incomplete commercial snapshots: ${incomplete.length}`);
  if (otherPayments > 0)
    console.warn(
      'Payment method provenance must be reviewed; OTHER is not reconstructed automatically.',
    );
  if (incomplete.length > 0)
    console.warn(
      'Incomplete snapshots are reported only. Unknown historical cost, pricing, or catalog attributes are not invented.',
    );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
