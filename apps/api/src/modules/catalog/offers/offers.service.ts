import { Injectable } from '@nestjs/common';
import { ProductStatus } from '@prisma/client';

import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { AuthenticatedUser } from '../../auth/auth.types';
import { CatalogAccessPolicy } from '../access/catalog-access.policy';
import { normalizeCurrency, normalizeIsoCountry } from '../catalog.types';
import { OffersQueryDto } from '../dto/catalog.dto';
import { PricingResolution, PricingService } from '../pricing/pricing.service';

interface PricingOption {
  priceBookEntryId: string | null;
  priceBookId: string | null;
  currency: string;
  amount: string;
  salePrice: string;
  minimumPrice?: string | null;
  taxIncluded: boolean;
  pricingSource: 'PRICE_BOOK' | 'PRODUCT_LEGACY';
  validFrom?: Date | null;
  validUntil?: Date | null;
}

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
    const requestedCurrency = query.currency ? normalizeCurrency(query.currency) : null;
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
                { sku: { contains: query.search.toUpperCase(), mode: 'insensitive' } },
                {
                  productCategory: {
                    is: { name: { contains: query.search, mode: 'insensitive' } },
                  },
                },
              ],
            }
          : {}),
      },
      orderBy: { name: 'asc' },
      take: query.limit,
      include: {
        productCategory: { select: { id: true, name: true, slug: true } },
        plans: { where: { active: true, deletedAt: null }, orderBy: { order: 'asc' } },
        variants: { where: { active: true, deletedAt: null }, orderBy: { order: 'asc' } },
      },
    });
    const data: Record<string, unknown>[] = [];
    const manualPriceAllowed = user.permissions.includes('catalog.prices.override');

    for (const product of products) {
      const plans: Record<string, unknown>[] = [];
      for (const plan of product.plans) {
        const variants = product.variants.filter(
          (variant) => variant.planId === plan.id || variant.planId === null,
        );
        const variantOffers: Record<string, unknown>[] = [];
        for (const variant of variants) {
          const resolutions = await this.resolveAvailable(
            user.organizationId,
            product.id,
            plan.id,
            variant.id,
            query,
            countryCode,
            resolvedAt,
          );
          const pricingOptions = resolutions.map((resolution) => this.toPricingOption(resolution));
          const preferred = this.preferred(resolutions, requestedCurrency);
          variantOffers.push({
            id: variant.id,
            name: variant.name,
            code: variant.code,
            attributes: variant.attributes,
            price: preferred,
            pricingOptions,
          });
        }
        const resolutions = await this.resolveAvailable(
          user.organizationId,
          product.id,
          plan.id,
          null,
          query,
          countryCode,
          resolvedAt,
        );
        const pricingOptions = resolutions.map((resolution) => this.toPricingOption(resolution));
        const preferred = this.preferred(resolutions, requestedCurrency);
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
          price: preferred,
          pricingOptions,
          variants: variantOffers,
        });
      }

      const baseResolutions = await this.resolveAvailable(
        user.organizationId,
        product.id,
        null,
        null,
        query,
        countryCode,
        resolvedAt,
      );
      const pricingOptions = baseResolutions.map((resolution) => this.toPricingOption(resolution));
      if (
        !pricingOptions.length &&
        product.price &&
        product.price.greaterThan(0) &&
        product.currency
      ) {
        pricingOptions.push({
          priceBookEntryId: null,
          priceBookId: null,
          currency: product.currency,
          amount: product.price.toFixed(2),
          salePrice: product.price.toFixed(2),
          taxIncluded: false,
          pricingSource: 'PRODUCT_LEGACY',
        });
      }
      const preferred = this.preferred(baseResolutions, requestedCurrency);
      const hasPricing =
        pricingOptions.length > 0 ||
        plans.some((plan) => Array.isArray(plan.pricingOptions) && plan.pricingOptions.length > 0);
      const available =
        !product.stockTrackingEnabled || product.stockQuantity > product.stockReserved;
      const availabilityStatus = !available ? 'NO_STOCK' : !hasPricing ? 'NO_PRICE' : 'AVAILABLE';

      data.push({
        id: product.id,
        name: product.name,
        slug: product.slug,
        sku: product.sku,
        description: product.description,
        category: product.productCategory,
        type: product.type,
        fulfillmentMode: product.fulfillmentMode,
        requiresSubscription: product.requiresSubscription,
        allowsDemo: product.allowsDemo,
        demoDurationHours: product.demoDurationHours,
        currency: product.currency,
        price: preferred,
        pricingOptions,
        availabilityStatus,
        selectable: available && (hasPricing || manualPriceAllowed),
        manualPriceAllowed,
        stock: {
          trackingEnabled: product.stockTrackingEnabled,
          quantity: product.stockQuantity,
          reserved: product.stockReserved,
          available: product.stockQuantity - product.stockReserved,
          minimum: product.stockMinimum,
        },
        plans,
      });
    }
    return {
      data,
      selection: {
        customerSegment: query.customerSegment,
        countryCode,
        currency: requestedCurrency,
        resolvedAt,
      },
    };
  }

  private async resolveAvailable(
    organizationId: string,
    productId: string,
    planId: string | null,
    variantId: string | null,
    query: OffersQueryDto,
    countryCode: string | null,
    at: Date,
  ): Promise<PricingResolution[]> {
    try {
      return await this.pricing.resolveAvailable(organizationId, {
        productId,
        planId,
        variantId,
        customerSegment: query.customerSegment,
        countryCode,
        at,
        includeCosts: Boolean(query.includeCosts),
      });
    } catch {
      return [];
    }
  }

  private preferred(
    resolutions: PricingResolution[],
    requestedCurrency: string | null,
  ): PricingResolution | null {
    return (
      resolutions.find((resolution) => resolution.priceBook.currency === requestedCurrency) ??
      resolutions[0] ??
      null
    );
  }

  private toPricingOption(resolution: PricingResolution): PricingOption {
    return {
      priceBookEntryId: resolution.priceBookEntryId,
      priceBookId: resolution.priceBook.id,
      currency: resolution.priceBook.currency,
      amount: resolution.price.salePrice,
      salePrice: resolution.price.salePrice,
      ...(resolution.price.minimumPrice !== undefined
        ? { minimumPrice: resolution.price.minimumPrice }
        : {}),
      taxIncluded: resolution.price.taxIncluded,
      pricingSource: 'PRICE_BOOK',
      validFrom: resolution.validFrom,
      validUntil: resolution.validUntil,
    };
  }
}
