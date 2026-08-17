import { CommercialClient } from './commercial.types';

export async function nextSaleNumber(
  transaction: CommercialClient,
  organizationId: string,
  at = new Date(),
): Promise<string> {
  const organization = await transaction.organization.update({
    where: { id: organizationId },
    data: { saleSequence: { increment: 1 } },
    select: { saleSequence: true },
  });
  const day = at.toISOString().slice(0, 10).replaceAll('-', '');
  return `SF-${day}-${String(organization.saleSequence).padStart(6, '0')}`;
}
