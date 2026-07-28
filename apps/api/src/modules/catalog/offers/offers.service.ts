import { Injectable } from '@nestjs/common';
import { ProductStatus } from '@prisma/client';

import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { AuthenticatedUser } from '../../auth/auth.types';
import { CatalogAccessPolicy } from '../access/catalog-access.policy';
import { normalizeCurrency, normalizeIsoCountry } from '../catalog.types';
import { OffersQueryDto } from '../dto/catalog.dto';
import { PricingService } from '../pricing/pricing.service';

@Injectable()
export class OffersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: CatalogAccessPolicy,
    private readonly pricing: PricingService,
  ) {}

  async list(query: OffersQueryDto, user: AuthenticatedUser): Promise<Record<string, unknown>> {
    this.access.assertRead(user);
    if (query.includeCosts) this.access.assertCostsRead(user);
    const resolvedAt = new Date();
    const countryCode = normalizeIsoCountry(query.countryCode);
    const currency = normalizeCurrency(query.currency);
    const products = await this.prisma.product.findMany({
      where: {
        organizationId: user.organizationId,
        deletedAt: null,
        active: true,
        status: ProductStatus.ACTIVE,
        ...(query.categoryId ? { categoryId: query.categoryId } : {}),
        ...(query.productType ? { type: query.productType } : {}),
        ...(query.search
          ? {
              OR: [
                { name: { contains: query.search, mode: 'insensitive' } },
                { slug: { contains: query.search.toLowerCase(), mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: { name: 'asc' },
      include: {
        productCategory: { select: { id: true, name: true, slug: true } },
        plans: { where: { active: true, deletedAt: null }, orderBy: { order: 'asc' } },
        variants: { where: { active: true, deletedAt: null }, orderBy: { order: 'asc' } },
      },
    });
    const data: Record<string, unknown>[] = [];
    for (const product of products) {
      const plans: Record<string, unknown>[] = [];
      for (const plan of product.plans) {
        const variants = product.variants.filter(
          (variant) => variant.planId === plan.id || variant.planId === null,
        );
        const variantOffers: Record<string, unknown>[] = [];
        for (const variant of variants) {
          try {
            const price = await this.pricing.resolveInternal(user.organizationId, {
              productId: product.id,
              planId: plan.id,
              variantId: variant.id,
              customerSegment: query.customerSegment,
              countryCode,
              currency,
              at: resolvedAt,
              includeCosts: Boolean(query.includeCosts),
            });
            variantOffers.push({
              id: variant.id,
              name: variant.name,
              code: variant.code,
              attributes: variant.attributes,
              price,
            });
          } catch {
            /* Products without a current price are not offers. */
          }
        }
        try {
          const price = await this.pricing.resolveInternal(user.organizationId, {
            productId: product.id,
            planId: plan.id,
            variantId: null,
            customerSegment: query.customerSegment,
            countryCode,
            currency,
            at: resolvedAt,
            includeCosts: Boolean(query.includeCosts),
          });
          plans.push({
            id: plan.id,
            name: plan.name,
            code: plan.code,
            customerSegment: plan.customerSegment,
            billingPeriodUnit: plan.billingPeriodUnit,
            billingPeriodCount: plan.billingPeriodCount,
            quantity: plan.quantity?.toFixed(3) ?? null,
            deviceLimit: plan.deviceLimit,
            creditAmount: plan.creditAmount?.toFixed(3) ?? null,
            price,
            variants: variantOffers,
          });
        } catch {
          if (variantOffers.length > 0)
            plans.push({ id: plan.id, name: plan.name, code: plan.code, variants: variantOffers });
        }
      }
      let basePrice: unknown = null;
      try {
        basePrice = await this.pricing.resolveInternal(user.organizationId, {
          productId: product.id,
          customerSegment: query.customerSegment,
          countryCode,
          currency,
          at: resolvedAt,
          includeCosts: Boolean(query.includeCosts),
        });
      } catch {
        /* A plan-level price may still make this product offerable. */
      }
      if (plans.length > 0 || basePrice !== null) {
        data.push({
          id: product.id,
          name: product.name,
          slug: product.slug,
          sku: product.sku,
          description: product.description,
          type: product.type,
          fulfillmentMode: product.fulfillmentMode,
          requiresSubscription: product.requiresSubscription,
          allowsDemo: product.allowsDemo,
          demoDurationHours: product.demoDurationHours,
          category: product.productCategory,
          price: basePrice,
          plans,
        });
      }
    }
    return {
      data,
      selection: {
        customerSegment: query.customerSegment,
        countryCode,
        currency,
        resolvedAt,
      },
    };
  }
}
