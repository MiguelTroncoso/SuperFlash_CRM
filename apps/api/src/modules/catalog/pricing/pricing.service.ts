import { HttpStatus, Injectable } from '@nestjs/common';
import {
  BillingPeriodUnit,
  CustomerSegment,
  FulfillmentMode,
  PriceBookStatus,
  Prisma,
  ProductStatus,
  ProductType,
} from '@prisma/client';

import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { AuthenticatedUser } from '../../auth/auth.types';
import { isSupportedCurrency, SUPPORTED_CURRENCIES } from '../../commercial/currency';
import { CatalogAccessPolicy } from '../access/catalog-access.policy';
import { CATALOG_ERROR_CODES, catalogException } from '../catalog.errors';
import {
  decimalString,
  normalizeCurrency,
  normalizeIsoCountry,
  parseOptionalDate,
} from '../catalog.types';
import { PricingResolveQueryDto } from '../dto/catalog.dto';

export interface SaleCatalogInput {
  client: Prisma.TransactionClient;
  organizationId: string;
  productId: string;
  planId: string | null;
  variantId: string | null;
  priceBookEntryId: string | null;
  currency: string;
  requestedUnitPrice: Prisma.Decimal | null;
  canOverridePrice: boolean;
  overrideReason: string | null;
}

export interface SaleCatalogResolution {
  product: {
    id: string;
    name: string;
    slug: string;
    sku: string | null;
    type: ProductType;
    fulfillmentMode: FulfillmentMode;
    requiresSubscription: boolean;
    metadata: Prisma.JsonValue | null;
  };
  plan: {
    id: string;
    name: string;
    billingPeriodUnit: BillingPeriodUnit;
    billingPeriodCount: number;
    metadata: Prisma.JsonValue | null;
  } | null;
  variant: { id: string; name: string; code: string | null; attributes: Prisma.JsonValue } | null;
  priceBook: { id: string; name: string; currency: string } | null;
  priceBookEntry: {
    id: string;
    priceBookId: string;
    salePrice: Prisma.Decimal;
    costPrice: Prisma.Decimal | null;
    minimumPrice: Prisma.Decimal | null;
    taxIncluded: boolean;
  } | null;
  unitPrice: Prisma.Decimal;
  pricingSource: 'PRICE_BOOK' | 'PRODUCT_LEGACY' | 'MANUAL_OVERRIDE';
}

export interface PricingResolution {
  productId: string;
  planId: string | null;
  variantId: string | null;
  priceBookEntryId: string;
  priceBook: {
    id: string;
    name: string;
    customerSegment: CustomerSegment;
    countryCode: string | null;
    currency: string;
    isDefault: boolean;
    priority: number;
  };
  price: {
    salePrice: string;
    costPrice?: string | null;
    minimumPrice?: string | null;
    taxIncluded: boolean;
  };
  validFrom: Date | null;
  validUntil: Date | null;
  explanation: {
    segmentMatch: 'EXACT' | 'ANY';
    countryMatch: 'EXACT' | 'DEFAULT';
    usedDefaultPriceBook: boolean;
    priority: number;
    resolvedAt: Date;
  };
}

interface ResolutionInput {
  productId: string;
  planId?: string | null;
  variantId?: string | null;
  customerSegment: CustomerSegment;
  countryCode?: string | null;
  currency: string;
  at?: Date | undefined;
  includeCosts: boolean;
}

export type PricingDiscoveryInput = Omit<ResolutionInput, 'currency'>;

export interface PricingCandidate {
  id: string;
  createdAt: Date;
  priceBook: {
    customerSegment: CustomerSegment;
    countryCode: string | null;
    isDefault: boolean;
    priority: number;
  };
}

/**
 * Candidates are compared lexicographically. A lower return value means the
 * left candidate wins. Priority is intentionally evaluated only after all
 * business-match dimensions, so it can never override segment or country.
 */
export function comparePricingCandidates(
  left: PricingCandidate,
  right: PricingCandidate,
  customerSegment: CustomerSegment,
  countryCode: string | null,
): number {
  const leftExactSegment = left.priceBook.customerSegment === customerSegment;
  const rightExactSegment = right.priceBook.customerSegment === customerSegment;
  if (leftExactSegment !== rightExactSegment) return leftExactSegment ? -1 : 1;

  const leftExactCountry = countryCode !== null && left.priceBook.countryCode === countryCode;
  const rightExactCountry = countryCode !== null && right.priceBook.countryCode === countryCode;
  if (leftExactCountry !== rightExactCountry) return leftExactCountry ? -1 : 1;

  if (left.priceBook.isDefault !== right.priceBook.isDefault)
    return left.priceBook.isDefault ? -1 : 1;

  if (left.priceBook.priority !== right.priceBook.priority)
    return right.priceBook.priority - left.priceBook.priority;

  const createdAtComparison = right.createdAt.getTime() - left.createdAt.getTime();
  if (createdAtComparison !== 0) return createdAtComparison;

  return left.id.localeCompare(right.id);
}

@Injectable()
export class PricingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: CatalogAccessPolicy,
  ) {}

  async resolve(
    query: PricingResolveQueryDto,
    user: AuthenticatedUser,
  ): Promise<PricingResolution> {
    this.access.assertPricesRead(user);
    if (query.includeCosts) this.access.assertCostsRead(user);
    const result = await this.resolveInternal(user.organizationId, {
      productId: query.productId,
      planId: query.planId ?? null,
      variantId: query.variantId ?? null,
      customerSegment: query.customerSegment,
      countryCode: normalizeIsoCountry(query.countryCode),
      currency: normalizeCurrency(query.currency),
      at: parseOptionalDate(query.at) ?? undefined,
      includeCosts: Boolean(query.includeCosts),
    });
    return result;
  }

  async resolveInternal(
    organizationId: string,
    input: ResolutionInput,
  ): Promise<PricingResolution> {
    await this.assertCombination(
      organizationId,
      input.productId,
      input.planId ?? null,
      input.variantId ?? null,
    );
    const at = input.at ?? new Date();
    const countryCode = input.countryCode ?? null;
    const where: Prisma.PriceBookEntryWhereInput = {
      organizationId,
      productId: input.productId,
      planId: input.planId ?? null,
      variantId: input.variantId ?? null,
      active: true,
      deletedAt: null,
      AND: [
        { OR: [{ validFrom: null }, { validFrom: { lte: at } }] },
        { OR: [{ validUntil: null }, { validUntil: { gt: at } }] },
      ],
      product: {
        organizationId,
        id: input.productId,
        active: true,
        status: ProductStatus.ACTIVE,
        deletedAt: null,
      },
      ...(input.planId
        ? {
            plan: {
              is: {
                organizationId,
                id: input.planId,
                productId: input.productId,
                active: true,
                deletedAt: null,
              },
            },
          }
        : {}),
      ...(input.variantId
        ? {
            variant: {
              is: {
                organizationId,
                id: input.variantId,
                productId: input.productId,
                active: true,
                deletedAt: null,
              },
            },
          }
        : {}),
      priceBook: {
        is: {
          organizationId,
          status: PriceBookStatus.ACTIVE,
          archivedAt: null,
          deletedAt: null,
          currency: input.currency,
          customerSegment: { in: [input.customerSegment, CustomerSegment.ANY] },
          ...(countryCode
            ? { OR: [{ countryCode }, { countryCode: null }] }
            : { countryCode: null }),
          AND: [
            { OR: [{ validFrom: null }, { validFrom: { lte: at } }] },
            { OR: [{ validUntil: null }, { validUntil: { gt: at } }] },
          ],
        },
      },
    };
    const candidates = await this.prisma.priceBookEntry.findMany({
      where,
      include: { priceBook: true },
    });
    const selected = candidates.sort((left, right) =>
      comparePricingCandidates(left, right, input.customerSegment, countryCode),
    )[0];
    if (!selected)
      throw catalogException(
        HttpStatus.NOT_FOUND,
        CATALOG_ERROR_CODES.PRICING_NOT_FOUND,
        'No existe un precio vigente para la combinación solicitada.',
      );
    const exactSegment = selected.priceBook.customerSegment === input.customerSegment;
    const exactCountry = countryCode !== null && selected.priceBook.countryCode === countryCode;
    return {
      productId: selected.productId,
      planId: selected.planId,
      variantId: selected.variantId,
      priceBookEntryId: selected.id,
      priceBook: {
        id: selected.priceBook.id,
        name: selected.priceBook.name,
        customerSegment: selected.priceBook.customerSegment,
        countryCode: selected.priceBook.countryCode,
        currency: selected.priceBook.currency,
        isDefault: selected.priceBook.isDefault,
        priority: selected.priceBook.priority,
      },
      price: {
        salePrice: selected.salePrice.toFixed(2),
        ...(input.includeCosts
          ? {
              costPrice: decimalString(selected.costPrice),
              minimumPrice: decimalString(selected.minimumPrice),
            }
          : {}),
        taxIncluded: selected.taxIncluded,
      },
      validFrom: selected.validFrom,
      validUntil: selected.validUntil,
      explanation: {
        segmentMatch: exactSegment ? 'EXACT' : 'ANY',
        countryMatch: exactCountry ? 'EXACT' : 'DEFAULT',
        usedDefaultPriceBook: selected.priceBook.isDefault,
        priority: selected.priceBook.priority,
        resolvedAt: at,
      },
    };
  }

  async resolveAvailable(
    organizationId: string,
    input: PricingDiscoveryInput,
  ): Promise<PricingResolution[]> {
    await this.assertCombination(
      organizationId,
      input.productId,
      input.planId ?? null,
      input.variantId ?? null,
    );
    const at = input.at ?? new Date();
    const countryCode = input.countryCode ?? null;
    const currencies = await this.prisma.priceBookEntry.findMany({
      where: {
        organizationId,
        productId: input.productId,
        planId: input.planId ?? null,
        variantId: input.variantId ?? null,
        active: true,
        deletedAt: null,
        AND: [
          { OR: [{ validFrom: null }, { validFrom: { lte: at } }] },
          { OR: [{ validUntil: null }, { validUntil: { gt: at } }] },
        ],
        product: {
          is: {
            organizationId,
            active: true,
            status: ProductStatus.ACTIVE,
            deletedAt: null,
          },
        },
        ...(input.planId
          ? {
              plan: {
                is: {
                  organizationId,
                  id: input.planId,
                  productId: input.productId,
                  active: true,
                  deletedAt: null,
                },
              },
            }
          : {}),
        ...(input.variantId
          ? {
              variant: {
                is: {
                  organizationId,
                  id: input.variantId,
                  productId: input.productId,
                  active: true,
                  deletedAt: null,
                },
              },
            }
          : {}),
        priceBook: {
          is: {
            organizationId,
            status: PriceBookStatus.ACTIVE,
            archivedAt: null,
            deletedAt: null,
            customerSegment: { in: [input.customerSegment, CustomerSegment.ANY] },
            ...(countryCode
              ? { OR: [{ countryCode }, { countryCode: null }] }
              : { countryCode: null }),
            AND: [
              { OR: [{ validFrom: null }, { validFrom: { lte: at } }] },
              { OR: [{ validUntil: null }, { validUntil: { gt: at } }] },
            ],
          },
        },
      },
      select: { priceBook: { select: { currency: true } } },
      distinct: ['priceBookId'],
    });
    const availableCurrencies = new Set(
      currencies
        .map((entry) => entry.priceBook.currency)
        .filter((currency): currency is (typeof SUPPORTED_CURRENCIES)[number] =>
          isSupportedCurrency(currency),
        ),
    );
    return Promise.all(
      [...availableCurrencies]
        .sort()
        .map((currency) => this.resolveInternal(organizationId, { ...input, currency })),
    );
  }

  async resolveForSale(input: SaleCatalogInput): Promise<SaleCatalogResolution> {
    if (!isSupportedCurrency(input.currency))
      throw catalogException(
        HttpStatus.BAD_REQUEST,
        CATALOG_ERROR_CODES.PRICE_INVALID,
        'La moneda no está admitida por el catálogo comercial.',
      );

    const product = await input.client.product.findFirst({
      where: {
        organizationId: input.organizationId,
        id: input.productId,
        active: true,
        status: ProductStatus.ACTIVE,
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        slug: true,
        sku: true,
        type: true,
        fulfillmentMode: true,
        requiresSubscription: true,
        metadata: true,
      },
    });
    if (!product)
      throw catalogException(
        HttpStatus.NOT_FOUND,
        CATALOG_ERROR_CODES.PRODUCT_NOT_FOUND,
        'El producto no está comercialmente activo.',
      );

    const plan = input.planId
      ? await input.client.productPlan.findFirst({
          where: {
            organizationId: input.organizationId,
            id: input.planId,
            productId: input.productId,
            active: true,
            deletedAt: null,
          },
          select: {
            id: true,
            name: true,
            billingPeriodUnit: true,
            billingPeriodCount: true,
            metadata: true,
          },
        })
      : null;
    if (input.planId && !plan)
      throw catalogException(
        HttpStatus.NOT_FOUND,
        CATALOG_ERROR_CODES.PLAN_NOT_FOUND,
        'El plan no está activo o no pertenece al producto.',
      );

    const variant = input.variantId
      ? await input.client.productVariant.findFirst({
          where: {
            organizationId: input.organizationId,
            id: input.variantId,
            productId: input.productId,
            active: true,
            deletedAt: null,
          },
          select: { id: true, name: true, code: true, attributes: true, planId: true },
        })
      : null;
    if (input.variantId && !variant)
      throw catalogException(
        HttpStatus.NOT_FOUND,
        CATALOG_ERROR_CODES.VARIANT_NOT_FOUND,
        'La variante no está activa o no pertenece al producto.',
      );
    if (variant?.planId && variant.planId !== input.planId)
      throw catalogException(
        HttpStatus.BAD_REQUEST,
        CATALOG_ERROR_CODES.PRICE_RELATION_NOT_FOUND,
        'La variante y el plan no coinciden.',
      );

    const now = new Date();
    const priceBookEntry = input.priceBookEntryId
      ? await input.client.priceBookEntry.findFirst({
          where: {
            organizationId: input.organizationId,
            id: input.priceBookEntryId,
            productId: input.productId,
            planId: input.planId,
            variantId: input.variantId,
            active: true,
            deletedAt: null,
            AND: [
              { OR: [{ validFrom: null }, { validFrom: { lte: now } }] },
              { OR: [{ validUntil: null }, { validUntil: { gt: now } }] },
            ],
            priceBook: {
              is: {
                organizationId: input.organizationId,
                status: PriceBookStatus.ACTIVE,
                archivedAt: null,
                deletedAt: null,
                currency: input.currency,
                AND: [
                  { OR: [{ validFrom: null }, { validFrom: { lte: now } }] },
                  { OR: [{ validUntil: null }, { validUntil: { gt: now } }] },
                ],
              },
            },
          },
          select: {
            id: true,
            priceBookId: true,
            salePrice: true,
            costPrice: true,
            minimumPrice: true,
            taxIncluded: true,
            priceBook: { select: { id: true, name: true, currency: true } },
          },
        })
      : null;
    if (input.priceBookEntryId && !priceBookEntry)
      throw catalogException(
        HttpStatus.NOT_FOUND,
        CATALOG_ERROR_CODES.PRICING_NOT_FOUND,
        'La entrada de precio no está activa, vigente o no coincide con la moneda.',
      );

    const catalogPrice = priceBookEntry?.salePrice ?? null;
    const fallbackPrice = await input.client.product.findFirst({
      where: { organizationId: input.organizationId, id: input.productId },
      select: { price: true, currency: true },
    });
    const legacyPrice = fallbackPrice?.price ?? null;
    const hasLegacyPrice = legacyPrice !== null && legacyPrice.greaterThan(0);
    if (!priceBookEntry && !input.requestedUnitPrice && !hasLegacyPrice)
      throw catalogException(
        HttpStatus.CONFLICT,
        CATALOG_ERROR_CODES.PRICING_NOT_FOUND,
        'El producto no tiene un precio vigente para la venta.',
      );
    if (!priceBookEntry && !hasLegacyPrice && input.requestedUnitPrice && !input.canOverridePrice)
      throw catalogException(
        HttpStatus.FORBIDDEN,
        CATALOG_ERROR_CODES.FORBIDDEN,
        'El precio manual requiere permiso.',
      );
    const unitPrice =
      input.requestedUnitPrice ?? catalogPrice ?? fallbackPrice?.price ?? new Prisma.Decimal(0);
    const source: SaleCatalogResolution['pricingSource'] =
      priceBookEntry && input.requestedUnitPrice
        ? 'MANUAL_OVERRIDE'
        : priceBookEntry
          ? 'PRICE_BOOK'
          : input.requestedUnitPrice
            ? 'MANUAL_OVERRIDE'
            : 'PRODUCT_LEGACY';
    if (
      priceBookEntry &&
      input.requestedUnitPrice &&
      !input.requestedUnitPrice.equals(catalogPrice ?? new Prisma.Decimal(0))
    ) {
      if (!input.canOverridePrice || !input.overrideReason)
        throw catalogException(
          HttpStatus.FORBIDDEN,
          CATALOG_ERROR_CODES.FORBIDDEN,
          'El precio manual requiere permiso y motivo.',
        );
    }
    if (
      priceBookEntry?.minimumPrice &&
      unitPrice.lessThan(priceBookEntry.minimumPrice) &&
      (!input.canOverridePrice || !input.overrideReason)
    )
      throw catalogException(
        HttpStatus.FORBIDDEN,
        CATALOG_ERROR_CODES.FORBIDDEN,
        'El precio está por debajo del mínimo autorizado.',
      );

    return {
      product,
      plan,
      variant: variant
        ? { id: variant.id, name: variant.name, code: variant.code, attributes: variant.attributes }
        : null,
      priceBook: priceBookEntry?.priceBook ?? null,
      priceBookEntry: priceBookEntry
        ? {
            id: priceBookEntry.id,
            priceBookId: priceBookEntry.priceBookId,
            salePrice: priceBookEntry.salePrice,
            costPrice: priceBookEntry.costPrice,
            minimumPrice: priceBookEntry.minimumPrice,
            taxIncluded: priceBookEntry.taxIncluded,
          }
        : null,
      unitPrice,
      pricingSource: source,
    };
  }

  private async assertCombination(
    organizationId: string,
    productId: string,
    planId: string | null,
    variantId: string | null,
  ): Promise<void> {
    const product = await this.prisma.product.findFirst({
      where: {
        organizationId,
        id: productId,
        active: true,
        status: ProductStatus.ACTIVE,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!product)
      throw catalogException(
        HttpStatus.NOT_FOUND,
        CATALOG_ERROR_CODES.PRICE_RELATION_NOT_FOUND,
        'El producto no existe.',
      );
    if (planId) {
      const plan = await this.prisma.productPlan.findFirst({
        where: { organizationId, productId, id: planId, active: true, deletedAt: null },
        select: { id: true },
      });
      if (!plan)
        throw catalogException(
          HttpStatus.NOT_FOUND,
          CATALOG_ERROR_CODES.PRICE_RELATION_NOT_FOUND,
          'El plan no pertenece al producto.',
        );
    }
    if (variantId) {
      const variant = await this.prisma.productVariant.findFirst({
        where: { organizationId, productId, id: variantId, active: true, deletedAt: null },
        select: { id: true, planId: true },
      });
      if (!variant)
        throw catalogException(
          HttpStatus.NOT_FOUND,
          CATALOG_ERROR_CODES.PRICE_RELATION_NOT_FOUND,
          'La variante no pertenece al producto.',
        );
      if (variant.planId && !planId)
        throw catalogException(
          HttpStatus.NOT_FOUND,
          CATALOG_ERROR_CODES.PRICE_RELATION_NOT_FOUND,
          'La variante requiere un plan asociado.',
        );
      if (variant.planId && variant.planId !== planId)
        throw catalogException(
          HttpStatus.BAD_REQUEST,
          CATALOG_ERROR_CODES.PRICE_RELATION_NOT_FOUND,
          'La variante y el plan no coinciden.',
        );
    }
  }
}
