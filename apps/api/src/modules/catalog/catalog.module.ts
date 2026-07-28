import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { CatalogAccessPolicy } from './access/catalog-access.policy';
import { CategoriesController } from './categories/categories.controller';
import { CategoriesService } from './categories/categories.service';
import { OffersController } from './offers/offers.controller';
import { OffersService } from './offers/offers.service';
import { PriceBooksController } from './price-books/price-books.controller';
import { PriceBooksService } from './price-books/price-books.service';
import { PricesController } from './prices/prices.controller';
import { PricesService } from './prices/prices.service';
import { PricingController } from './pricing/pricing.controller';
import { PricingService } from './pricing/pricing.service';
import { PlansController } from './plans/plans.controller';
import { PlansService } from './plans/plans.service';
import { ProductsController } from './products/products.controller';
import { ProductsService } from './products/products.service';
import { VariantsController } from './variants/variants.controller';
import { VariantsService } from './variants/variants.service';

@Module({
  imports: [AuditModule, AuthModule],
  controllers: [
    CategoriesController,
    ProductsController,
    PlansController,
    VariantsController,
    PriceBooksController,
    PricesController,
    PricingController,
    OffersController,
  ],
  providers: [
    CatalogAccessPolicy,
    CategoriesService,
    ProductsService,
    PlansService,
    VariantsService,
    PriceBooksService,
    PricesService,
    PricingService,
    OffersService,
  ],
})
export class CatalogModule {}
