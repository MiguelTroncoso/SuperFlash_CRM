import { HttpStatus, Injectable } from '@nestjs/common';
import { CustomerSegment, PriceBookStatus, Prisma, ProductStatus } from '@prisma/client';

import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { AuthenticatedUser } from '../../auth/auth.types';
import { CatalogAccessPolicy } from '../access/catalog-access.policy';
import { CATALOG_ERROR_CODES, catalogException } from '../catalog.errors';
import {
  decimalString,
  normalizeCurrency,
  normalizeIsoCountry,
  parseOptionalDate,
} from '../catalog.types';
import { PricingResolveQueryDto } from '../dto/catalog.dto';

export interface PricingResolution {
  productId: string;
  planId: string | null;
  variantId: string | null;
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
      product: {
        organizationId,
        id: input.productId,
        active: true,
        status: ProductStatus.ACTIVE,
        deletedAt: null,
      },
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
    const selected = candidates.sort(
      (left, right) => this.rank(right, input, countryCode) - this.rank(left, input, countryCode),
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

  private rank(
    entry: {
      priceBook: {
        customerSegment: CustomerSegment;
        countryCode: string | null;
        isDefault: boolean;
        priority: number;
      };
      createdAt: Date;
    },
    input: ResolutionInput,
    countryCode: string | null,
  ): number {
    const segment = entry.priceBook.customerSegment === input.customerSegment ? 100000 : 1000;
    const country =
      countryCode !== null && entry.priceBook.countryCode === countryCode ? 10000 : 100;
    const defaultBook = entry.priceBook.isDefault ? 10 : 0;
    return (
      segment + country + defaultBook + entry.priceBook.priority + entry.createdAt.getTime() / 1e15
    );
  }

  private async assertCombination(
    organizationId: string,
    productId: string,
    planId: string | null,
    variantId: string | null,
  ): Promise<void> {
    const product = await this.prisma.product.findFirst({
      where: { organizationId, id: productId, deletedAt: null },
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
        where: { organizationId, productId, id: planId, deletedAt: null },
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
        where: { organizationId, productId, id: variantId, deletedAt: null },
        select: { id: true, planId: true },
      });
      if (!variant)
        throw catalogException(
          HttpStatus.NOT_FOUND,
          CATALOG_ERROR_CODES.PRICE_RELATION_NOT_FOUND,
          'La variante no pertenece al producto.',
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
