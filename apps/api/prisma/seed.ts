import argon2 from 'argon2';

import {
  BillingPeriodUnit,
  CustomerSegment,
  FulfillmentMode,
  PipelineStageCategory,
  PrismaClient,
  ProductStatus,
  ProductType,
} from '@prisma/client';

const prisma = new PrismaClient();

const roles = [
  { name: 'Owner', description: 'Propietario de la organización.' },
  { name: 'Admin', description: 'Administrador de la organización.' },
  { name: 'Sales', description: 'Responsable del proceso comercial.' },
  { name: 'Viewer', description: 'Acceso de solo lectura.' },
] as const;

const permissions = [
  { key: 'users.read', name: 'Leer usuarios' },
  { key: 'users.create', name: 'Crear usuarios' },
  { key: 'users.update', name: 'Actualizar usuarios' },
  { key: 'users.delete', name: 'Eliminar usuarios' },
  { key: 'contacts.read', name: 'Leer contactos' },
  { key: 'contacts.create', name: 'Crear contactos' },
  { key: 'contacts.update', name: 'Actualizar contactos' },
  { key: 'contacts.delete', name: 'Eliminar contactos' },
  { key: 'opportunities.read', name: 'Leer oportunidades' },
  { key: 'opportunities.create', name: 'Crear oportunidades' },
  { key: 'opportunities.update', name: 'Actualizar oportunidades' },
  { key: 'opportunities.delete', name: 'Eliminar oportunidades' },
  { key: 'followups.read', name: 'Leer seguimientos' },
  { key: 'followups.create', name: 'Crear seguimientos' },
  { key: 'followups.update', name: 'Actualizar seguimientos' },
  { key: 'followups.delete', name: 'Archivar seguimientos' },
  { key: 'sales.read', name: 'Leer ventas' },
  { key: 'sales.create', name: 'Crear ventas' },
  { key: 'sales.update', name: 'Actualizar ventas' },
  { key: 'sales.delete', name: 'Eliminar ventas' },
  { key: 'payments.read', name: 'Leer pagos' },
  { key: 'payments.create', name: 'Crear pagos' },
  { key: 'payments.update', name: 'Actualizar pagos' },
  { key: 'payments.delete', name: 'Eliminar pagos' },
  { key: 'subscriptions.read', name: 'Leer suscripciones' },
  { key: 'subscriptions.create', name: 'Crear suscripciones' },
  { key: 'subscriptions.update', name: 'Actualizar suscripciones' },
  { key: 'renewals.read', name: 'Leer renovaciones' },
  { key: 'renewals.create', name: 'Crear renovaciones' },
  { key: 'renewals.update', name: 'Actualizar renovaciones' },
  { key: 'products.read', name: 'Leer productos' },
  { key: 'products.create', name: 'Crear productos' },
  { key: 'products.update', name: 'Actualizar productos' },
  { key: 'products.delete', name: 'Eliminar productos' },
  { key: 'campaigns.read', name: 'Leer campañas' },
  { key: 'campaigns.create', name: 'Crear campañas' },
  { key: 'campaigns.update', name: 'Actualizar campañas' },
  { key: 'campaigns.delete', name: 'Eliminar campañas' },
  { key: 'reports.read', name: 'Leer reportes' },
  { key: 'settings.manage', name: 'Administrar configuración' },
  { key: 'audit.read', name: 'Leer auditoría' },
  { key: 'catalog.read', name: 'Leer catálogo' },
  { key: 'catalog.create', name: 'Crear catálogo' },
  { key: 'catalog.update', name: 'Actualizar catálogo' },
  { key: 'catalog.delete', name: 'Archivar catálogo' },
  { key: 'catalog.prices.read', name: 'Leer precios del catálogo' },
  { key: 'catalog.prices.manage', name: 'Administrar precios del catálogo' },
  { key: 'catalog.costs.read', name: 'Leer costos del catálogo' },
] as const;

const pipelineStages = [
  {
    name: 'Nuevo Lead',
    systemKey: 'NEW_LEAD',
    color: '#64748B',
    category: PipelineStageCategory.OPEN,
  },
  {
    name: 'Dejó en visto',
    systemKey: 'LEFT_ON_READ',
    color: '#94A3B8',
    category: PipelineStageCategory.OPEN,
  },
  {
    name: 'Demo entregada',
    systemKey: 'DEMO_DELIVERED',
    color: '#3B82F6',
    category: PipelineStageCategory.OPEN,
  },
  {
    name: 'Debe gastar créditos',
    systemKey: 'AWAITING_CREDIT_USAGE',
    color: '#8B5CF6',
    category: PipelineStageCategory.OPEN,
  },
  {
    name: 'Debe juntar dinero',
    systemKey: 'AWAITING_MONEY',
    color: '#F59E0B',
    category: PipelineStageCategory.OPEN,
  },
  {
    name: 'Posible comprador',
    systemKey: 'POTENTIAL_BUYER',
    color: '#F97316',
    category: PipelineStageCategory.OPEN,
  },
  {
    name: 'Compró',
    systemKey: 'WON',
    color: '#22C55E',
    category: PipelineStageCategory.WON,
  },
  {
    name: 'No concretado',
    systemKey: 'LOST',
    color: '#EF4444',
    category: PipelineStageCategory.LOST,
  },
] as const;

const salesPermissionKeys = [
  'contacts.read',
  'contacts.create',
  'contacts.update',
  'contacts.delete',
  'opportunities.read',
  'opportunities.create',
  'opportunities.update',
  'opportunities.delete',
  'followups.read',
  'followups.create',
  'followups.update',
  'sales.read',
  'sales.create',
  'sales.update',
  'sales.delete',
  'payments.read',
  'payments.create',
  'payments.update',
  'payments.delete',
  'subscriptions.read',
  'subscriptions.create',
  'subscriptions.update',
  'renewals.read',
  'renewals.create',
  'renewals.update',
  'products.read',
  'campaigns.read',
  'catalog.read',
  'catalog.prices.read',
] as const;

const catalogExamplesEnabled =
  process.env.NODE_ENV !== 'production' && process.env.SEED_CATALOG_EXAMPLES === 'true';

const ownerCredentials = {
  email: process.env.SEED_OWNER_EMAIL?.trim() ?? '',
  password: process.env.SEED_OWNER_PASSWORD ?? '',
  firstName: process.env.SEED_OWNER_FIRST_NAME?.trim() ?? '',
  lastName: process.env.SEED_OWNER_LAST_NAME?.trim() ?? '',
};

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function hasCompleteOwnerCredentials(): boolean {
  return Boolean(
    ownerCredentials.email &&
    ownerCredentials.password &&
    ownerCredentials.firstName &&
    ownerCredentials.lastName,
  );
}

function isStrongPassword(password: string): boolean {
  return /^(?=.{10,128}$)(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[^A-Za-z0-9]).*$/.test(password);
}

function permissionsForRole(roleName: string): readonly string[] {
  if (roleName === 'Owner' || roleName === 'Admin') {
    return permissions.map((permission) => permission.key);
  }

  if (roleName === 'Sales') {
    return salesPermissionKeys;
  }

  return permissions
    .filter(
      (permission) => permission.key.endsWith('.read') && permission.key !== 'catalog.costs.read',
    )
    .map((permission) => permission.key);
}

async function seed(): Promise<void> {
  try {
    if (hasCompleteOwnerCredentials() && !isStrongPassword(ownerCredentials.password)) {
      throw new Error(
        'SEED_OWNER_PASSWORD debe tener entre 10 y 128 caracteres, con mayúscula, minúscula, número y símbolo.',
      );
    }

    await prisma.$transaction(async (transaction) => {
      const organization = await transaction.organization.upsert({
        where: { slug: 'demo' },
        update: {
          name: 'Organización Demo',
          deletedAt: null,
        },
        create: {
          name: 'Organización Demo',
          slug: 'demo',
        },
      });

      const roleRecords = new Map<string, string>();
      for (const role of roles) {
        const record = await transaction.role.upsert({
          where: {
            organizationId_name: {
              organizationId: organization.id,
              name: role.name,
            },
          },
          update: {
            description: role.description,
            deletedAt: null,
          },
          create: {
            organizationId: organization.id,
            name: role.name,
            description: role.description,
          },
        });
        roleRecords.set(role.name, record.id);
      }

      for (const permission of permissions) {
        await transaction.permission.upsert({
          where: { key: permission.key },
          update: {
            name: permission.name,
            deletedAt: null,
          },
          create: {
            key: permission.key,
            name: permission.name,
          },
        });
      }

      for (const role of roles) {
        const roleId = roleRecords.get(role.name);
        if (!roleId) {
          throw new Error(`No se encontró el rol ${role.name} durante el seed.`);
        }
        await transaction.role.update({
          where: { id: roleId },
          data: {
            permissions: {
              set: permissionsForRole(role.name).map((key) => ({ key })),
            },
          },
        });
      }

      for (const [index, stage] of pipelineStages.entries()) {
        await transaction.pipelineStage.upsert({
          where: {
            organizationId_order: {
              organizationId: organization.id,
              order: index + 1,
            },
          },
          update: {
            name: stage.name,
            systemKey: stage.systemKey,
            color: stage.color,
            active: true,
            category: stage.category,
            deletedAt: null,
          },
          create: {
            organizationId: organization.id,
            name: stage.name,
            systemKey: stage.systemKey,
            order: index + 1,
            color: stage.color,
            category: stage.category,
          },
        });
      }

      if (catalogExamplesEnabled) {
        const examples = [
          {
            category: 'TV',
            slug: 'tv',
            product: 'Televisión',
            productSlug: 'television',
            type: ProductType.SERVICE,
          },
          {
            category: 'Diseño',
            slug: 'diseno',
            product: 'Canva',
            productSlug: 'canva',
            type: ProductType.DIGITAL_ACCESS,
          },
          {
            category: 'Edición',
            slug: 'edicion',
            product: 'CapCut',
            productSlug: 'capcut',
            type: ProductType.DIGITAL_ACCESS,
          },
        ] as const;
        for (const example of examples) {
          const category = await transaction.productCategory.upsert({
            where: {
              organizationId_id: {
                organizationId: organization.id,
                id:
                  (
                    await transaction.productCategory.findFirst({
                      where: { organizationId: organization.id, slug: example.slug },
                      select: { id: true },
                    })
                  )?.id ?? '00000000-0000-0000-0000-000000000000',
              },
            },
            update: { name: example.category, active: true, deletedAt: null },
            create: {
              organizationId: organization.id,
              name: example.category,
              slug: example.slug,
              order: examples.indexOf(example) + 1,
            },
          });
          const existingProduct = await transaction.product.findFirst({
            where: { organizationId: organization.id, slug: example.productSlug },
            select: { id: true },
          });
          const product = existingProduct
            ? await transaction.product.update({
                where: {
                  organizationId_id: { organizationId: organization.id, id: existingProduct.id },
                },
                data: {
                  categoryId: category.id,
                  status: ProductStatus.ACTIVE,
                  active: true,
                  deletedAt: null,
                },
              })
            : await transaction.product.create({
                data: {
                  organizationId: organization.id,
                  categoryId: category.id,
                  name: example.product,
                  slug: example.productSlug,
                  type: example.type,
                  fulfillmentMode: FulfillmentMode.MANUAL,
                  status: ProductStatus.ACTIVE,
                  active: true,
                  currency: 'USD',
                  price: 0,
                },
              });
          for (const [index, months] of [1, 3].entries()) {
            const code = `${example.productSlug.toUpperCase()}-${months}M`;
            await transaction.productPlan.upsert({
              where: {
                organizationId_id: {
                  organizationId: organization.id,
                  id:
                    (
                      await transaction.productPlan.findFirst({
                        where: { organizationId: organization.id, productId: product.id, code },
                        select: { id: true },
                      })
                    )?.id ?? '00000000-0000-0000-0000-000000000000',
                },
              },
              update: {
                name: `${months} mes${months > 1 ? 'es' : ''}`,
                active: true,
                deletedAt: null,
              },
              create: {
                organizationId: organization.id,
                productId: product.id,
                name: `${months} mes${months > 1 ? 'es' : ''}`,
                code,
                customerSegment: CustomerSegment.END_CUSTOMER,
                billingPeriodUnit: BillingPeriodUnit.MONTH,
                billingPeriodCount: months,
                order: index + 1,
              },
            });
          }
        }
      }

      if (hasCompleteOwnerCredentials()) {
        const ownerRoleId = roleRecords.get('Owner');
        if (!ownerRoleId) {
          throw new Error('No se encontró el rol Owner durante el seed.');
        }

        const passwordHash = await argon2.hash(ownerCredentials.password, {
          type: argon2.argon2id,
          memoryCost: 19_456,
          timeCost: 2,
          parallelism: 1,
        });

        await transaction.user.upsert({
          where: {
            organizationId_email: {
              organizationId: organization.id,
              email: normalizeEmail(ownerCredentials.email),
            },
          },
          update: {
            roleId: ownerRoleId,
            firstName: ownerCredentials.firstName,
            lastName: ownerCredentials.lastName,
            passwordHash,
            status: 'ACTIVE',
            deletedAt: null,
          },
          create: {
            organizationId: organization.id,
            roleId: ownerRoleId,
            email: normalizeEmail(ownerCredentials.email),
            firstName: ownerCredentials.firstName,
            lastName: ownerCredentials.lastName,
            passwordHash,
            status: 'ACTIVE',
          },
        });
      }
    });

    console.info('Seed completed successfully.');
    if (catalogExamplesEnabled) console.info('Optional development catalog examples ensured.');
    if (hasCompleteOwnerCredentials()) {
      console.info(`Development owner ensured for ${normalizeEmail(ownerCredentials.email)}.`);
    } else {
      console.info(
        'Development owner omitted. Define SEED_OWNER_EMAIL, SEED_OWNER_PASSWORD, SEED_OWNER_FIRST_NAME and SEED_OWNER_LAST_NAME to create it.',
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

void seed();
