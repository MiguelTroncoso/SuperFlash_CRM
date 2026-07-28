import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  await prisma.$executeRaw`REFRESH MATERIALIZED VIEW CONCURRENTLY "revenue_sales_daily"`;
  await prisma.$executeRaw`REFRESH MATERIALIZED VIEW CONCURRENTLY "revenue_subscriptions_monthly"`;
  await prisma.$executeRaw`REFRESH MATERIALIZED VIEW CONCURRENTLY "revenue_funnel_daily"`;
  console.log('Revenue Intelligence materialized views refreshed.');
}

main()
  .catch((error: unknown) => {
    console.error('Unable to refresh Revenue Intelligence materialized views.', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
