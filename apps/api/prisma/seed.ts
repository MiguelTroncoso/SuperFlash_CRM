import argon2 from 'argon2';

import {
  BillingPeriodUnit,
  CustomerSegment,
  FulfillmentMode,
  PipelineStageCategory,
  PaymentMethod,
  Prisma,
  PrismaClient,
  ProductStatus,
  ProductType,
  ProspectReasonType,
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
  { key: 'renewals.delete', name: 'Archivar renovaciones' },
  { key: 'renewals.export', name: 'Exportar renovaciones' },
  { key: 'products.read', name: 'Leer productos' },
  { key: 'products.create', name: 'Crear productos' },
  { key: 'products.update', name: 'Actualizar productos' },
  { key: 'products.delete', name: 'Eliminar productos' },
  { key: 'campaigns.read', name: 'Leer campañas' },
  { key: 'campaigns.create', name: 'Crear campañas' },
  { key: 'campaigns.update', name: 'Actualizar campañas' },
  { key: 'campaigns.delete', name: 'Eliminar campañas' },
  { key: 'reports.read', name: 'Leer reportes' },
  { key: 'operations.read', name: 'Leer operación diaria' },
  { key: 'operations.manage', name: 'Gestionar operación diaria' },
  { key: 'settings.manage', name: 'Administrar configuración' },
  { key: 'audit.read', name: 'Leer auditoría' },
  { key: 'catalog.read', name: 'Leer catálogo' },
  { key: 'catalog.create', name: 'Crear catálogo' },
  { key: 'catalog.update', name: 'Actualizar catálogo' },
  { key: 'catalog.delete', name: 'Archivar catálogo' },
  { key: 'catalog.prices.read', name: 'Leer precios del catálogo' },
  { key: 'catalog.prices.manage', name: 'Administrar precios del catálogo' },
  { key: 'catalog.costs.read', name: 'Leer costos del catálogo' },
  { key: 'catalog.prices.override', name: 'Autorizar sobreescritura de precios' },
  { key: 'providers.read', name: 'Leer proveedores' },
  { key: 'providers.create', name: 'Crear proveedores' },
  { key: 'providers.update', name: 'Actualizar proveedores' },
  { key: 'providers.delete', name: 'Archivar proveedores' },
  { key: 'provider_mappings.read', name: 'Leer mappings de proveedores' },
  { key: 'provider_mappings.create', name: 'Crear mappings de proveedores' },
  { key: 'provider_mappings.update', name: 'Actualizar mappings de proveedores' },
  { key: 'provider_mappings.delete', name: 'Archivar mappings de proveedores' },
  { key: 'fulfillments.read', name: 'Leer fulfillments' },
  { key: 'fulfillments.create', name: 'Crear fulfillments' },
  { key: 'fulfillments.update', name: 'Actualizar fulfillments' },
  { key: 'fulfillments.delete', name: 'Cancelar fulfillments' },
  { key: 'provisioning.read', name: 'Leer intentos de provisioning' },
  { key: 'provisioning.create', name: 'Crear intentos de provisioning' },
  { key: 'provisioning.update', name: 'Actualizar provisioning' },
  { key: 'credentials.read', name: 'Leer credenciales enmascaradas' },
  { key: 'credentials.reveal', name: 'Revelar credenciales' },
  { key: 'credentials.create', name: 'Crear credenciales' },
  { key: 'credentials.update', name: 'Actualizar credenciales' },
  { key: 'credentials.revoke', name: 'Revocar credenciales' },
  { key: 'trials.read', name: 'Leer trials y demos' },
  { key: 'trials.create', name: 'Crear trials y demos' },
  { key: 'trials.update', name: 'Actualizar trials y demos' },
  { key: 'trials.delete', name: 'Cancelar trials y demos' },
  { key: 'activations.read', name: 'Leer activaciones' },
  { key: 'activations.create', name: 'Crear activaciones' },
  { key: 'activations.update', name: 'Actualizar activaciones' },
  { key: 'activations.delete', name: 'Revocar activaciones' },
  { key: 'automations.read', name: 'Leer automatizaciones' },
  { key: 'automations.create', name: 'Crear automatizaciones' },
  { key: 'automations.update', name: 'Actualizar automatizaciones' },
  { key: 'automations.delete', name: 'Archivar automatizaciones' },
  { key: 'automation_executions.read', name: 'Leer ejecuciones de automatizaciones' },
  { key: 'templates.read', name: 'Leer plantillas' },
  { key: 'templates.create', name: 'Crear plantillas' },
  { key: 'templates.update', name: 'Actualizar plantillas' },
  { key: 'templates.delete', name: 'Archivar plantillas' },
  { key: 'notifications.read', name: 'Leer notificaciones' },
  { key: 'notifications.update', name: 'Gestionar notificaciones' },
  { key: 'whatsapp.read', name: 'Leer WhatsApp' },
  { key: 'whatsapp.send', name: 'Enviar mensajes WhatsApp' },
  { key: 'whatsapp.manage', name: 'Administrar conexión WhatsApp' },
  { key: 'whatsapp.templates.read', name: 'Leer plantillas WhatsApp' },
  { key: 'whatsapp.conversations.assign', name: 'Asignar conversaciones WhatsApp' },
  { key: 'financial.read', name: 'Leer inteligencia financiera' },
  { key: 'financial.manage', name: 'Gestionar inteligencia financiera' },
  { key: 'marketing.campaigns.read', name: 'Leer campañas de marketing' },
  { key: 'marketing.campaigns.manage', name: 'Gestionar campañas de marketing' },
  { key: 'marketing.spend.read', name: 'Leer gasto publicitario' },
  { key: 'marketing.spend.manage', name: 'Gestionar gasto publicitario' },
  { key: 'marketing.analytics.read', name: 'Leer rendimiento de marketing' },
  { key: 'marketing.attribution.read', name: 'Leer atribución comercial' },
  { key: 'marketing.attribution.manage', name: 'Gestionar atribución comercial' },
  { key: 'marketing.loss-reasons.read', name: 'Leer motivos comerciales' },
  { key: 'marketing.loss-reasons.manage', name: 'Gestionar motivos comerciales' },
  { key: 'commercial.net-values.read', name: 'Leer ingresos netos comerciales' },
  { key: 'commercial.costs.read', name: 'Leer costos comerciales' },
  { key: 'commercial.profit.read', name: 'Leer utilidad comercial' },
  { key: 'imports.commercial.execute', name: 'Ejecutar importaciones comerciales' },
  { key: 'imports.commercial.read', name: 'Leer importaciones comerciales' },
  { key: 'imports.commercial.export', name: 'Exportar importaciones comerciales' },
] as const;

const expenseCategories = [
  'Publicidad',
  'Proveedor',
  'Hosting',
  'Hosting/VPS',
  'Software',
  'Dominios',
  'Servicios',
  'Comisiones',
  'Impuestos',
  'Operación',
  'Personal',
  'Transporte',
  'Otros',
] as const;

const paymentCommissionDefaults: ReadonlyArray<{
  method: PaymentMethod;
  percentage: string;
  fixedFee: string;
}> = [
  { method: PaymentMethod.TRANSFER, percentage: '0', fixedFee: '0' },
  { method: PaymentMethod.PAYPAL, percentage: '4.95', fixedFee: '0.49' },
  { method: PaymentMethod.BINANCE, percentage: '0', fixedFee: '0' },
  { method: PaymentMethod.MERCADOPAGO, percentage: '0', fixedFee: '0' },
  { method: PaymentMethod.STRIPE, percentage: '0', fixedFee: '0' },
  { method: PaymentMethod.CASH, percentage: '0', fixedFee: '0' },
  { method: PaymentMethod.MANUAL, percentage: '0', fixedFee: '0' },
  { method: PaymentMethod.OTHER, percentage: '0', fixedFee: '0' },
];

const pipelineStages = [
  {
    name: 'Nuevo',
    systemKey: 'NEW',
    color: '#64748B',
    category: PipelineStageCategory.OPEN,
  },
  {
    name: 'Mensaje enviado',
    systemKey: 'MESSAGE_SENT',
    color: '#0EA5E9',
    category: PipelineStageCategory.OPEN,
  },
  {
    name: 'Demo enviada',
    systemKey: 'DEMO_SENT',
    color: '#3B82F6',
    category: PipelineStageCategory.OPEN,
  },
  {
    name: 'No responde',
    systemKey: 'NO_RESPONSE',
    color: '#94A3B8',
    category: PipelineStageCategory.OPEN,
  },
  {
    name: 'Hablar más adelante',
    systemKey: 'TALK_LATER',
    color: '#8B5CF6',
    category: PipelineStageCategory.OPEN,
  },
  {
    name: 'Quiere comprar',
    systemKey: 'WANTS_TO_BUY',
    color: '#F97316',
    category: PipelineStageCategory.OPEN,
  },
  { name: 'Compró', systemKey: 'PURCHASED', color: '#22C55E', category: PipelineStageCategory.WON },
  {
    name: 'Perdido',
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
  'renewals.export',
  'products.read',
  'campaigns.read',
  'catalog.read',
  'catalog.prices.read',
  'whatsapp.read',
  'whatsapp.send',
  'whatsapp.templates.read',
  'whatsapp.conversations.assign',
  'financial.read',
  'operations.read',
  'operations.manage',
] as const;

const marketingSalesPermissionKeys = [
  'marketing.campaigns.read',
  'marketing.spend.read',
  'marketing.analytics.read',
  'marketing.attribution.read',
  'marketing.attribution.manage',
  'marketing.loss-reasons.read',
  'commercial.net-values.read',
] as const;

const lossReasons = [
  { type: ProspectReasonType.LOSS, systemKey: 'NO_RESPONSE', name: 'Sin respuesta' },
  { type: ProspectReasonType.LOSS, systemKey: 'PRICE', name: 'Precio' },
  { type: ProspectReasonType.LOSS, systemKey: 'NO_MONEY', name: 'Sin dinero' },
  { type: ProspectReasonType.LOSS, systemKey: 'WILL_REVIEW_LATER', name: 'Lo revisará después' },
  { type: ProspectReasonType.LOSS, systemKey: 'DISTRUST', name: 'Desconfianza' },
  {
    type: ProspectReasonType.LOSS,
    systemKey: 'WANTED_PERSONAL_SERVICE',
    name: 'Quería atención personal',
  },
  {
    type: ProspectReasonType.LOSS,
    systemKey: 'PAYMENT_METHOD_ISSUE',
    name: 'Problema con medio de pago',
  },
  {
    type: ProspectReasonType.LOSS,
    systemKey: 'INSTALLATION_ISSUE',
    name: 'Problema de instalación',
  },
  { type: ProspectReasonType.LOSS, systemKey: 'DEMO_ISSUE', name: 'Problema con demo' },
  {
    type: ProspectReasonType.LOSS,
    systemKey: 'CHOSE_OTHER_PROVIDER',
    name: 'Eligió otro proveedor',
  },
  { type: ProspectReasonType.LOSS, systemKey: 'OTHER', name: 'Otro' },
  { type: ProspectReasonType.OBJECTION, systemKey: 'PRICE', name: 'Objeción de precio' },
  { type: ProspectReasonType.OBJECTION, systemKey: 'NO_MONEY', name: 'Objeción de presupuesto' },
  { type: ProspectReasonType.OBJECTION, systemKey: 'DISTRUST', name: 'Objeción de confianza' },
  { type: ProspectReasonType.OBJECTION, systemKey: 'OTHER', name: 'Otra objeción' },
  {
    type: ProspectReasonType.SILENCE,
    systemKey: 'AFTER_FIRST_CONTACT',
    name: 'Después del primer contacto',
  },
  {
    type: ProspectReasonType.SILENCE,
    systemKey: 'AFTER_PRICING',
    name: 'Después de enviar precio',
  },
  { type: ProspectReasonType.SILENCE, systemKey: 'AFTER_DEMO', name: 'Después de la demo' },
  {
    type: ProspectReasonType.SILENCE,
    systemKey: 'AFTER_PAYMENT_REQUEST',
    name: 'Después de solicitar pago',
  },
  { type: ProspectReasonType.SILENCE, systemKey: 'AFTER_PROMOTION', name: 'Después de promoción' },
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

function normalizeStageName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase();
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
    return [...salesPermissionKeys, ...marketingSalesPermissionKeys];
  }

  return permissions
    .filter(
      (permission) =>
        permission.key.endsWith('.read') &&
        !['catalog.costs.read', 'commercial.costs.read', 'commercial.profit.read'].includes(
          permission.key,
        ),
    )
    .map((permission) => permission.key);
}

async function synchronizeSystemRolePermissions(
  transaction: Prisma.TransactionClient,
): Promise<void> {
  const organizations = await transaction.organization.findMany({
    where: { deletedAt: null },
    select: { id: true },
  });

  for (const organization of organizations) {
    for (const roleDefinition of roles) {
      const role = await transaction.role.upsert({
        where: {
          organizationId_name: {
            organizationId: organization.id,
            name: roleDefinition.name,
          },
        },
        update: {
          description: roleDefinition.description,
          deletedAt: null,
        },
        create: {
          organizationId: organization.id,
          name: roleDefinition.name,
          description: roleDefinition.description,
        },
        select: { id: true, name: true },
      });

      await transaction.role.update({
        where: { id: role.id },
        data: {
          // Connect is intentionally additive: existing custom permissions remain intact.
          permissions: {
            connect: permissionsForRole(role.name).map((key) => ({ key })),
          },
        },
      });
    }
  }
}

async function synchronizePipelineStages(transaction: Prisma.TransactionClient): Promise<void> {
  const organizations = await transaction.organization.findMany({
    where: { deletedAt: null },
    select: { id: true },
  });

  for (const organization of organizations) {
    for (const stage of pipelineStages) {
      await reconcilePipelineStage(transaction, organization.id, stage);
    }
  }
}

async function synchronizePaymentCommissionDefaults(
  transaction: Prisma.TransactionClient,
  organizationId: string,
): Promise<void> {
  for (const config of paymentCommissionDefaults) {
    await transaction.paymentFeeConfig.upsert({
      where: { organizationId_method: { organizationId, method: config.method } },
      update: { deletedAt: null },
      create: {
        organizationId,
        method: config.method,
        percentage: new Prisma.Decimal(config.percentage),
        fixedFee: new Prisma.Decimal(config.fixedFee),
      },
    });
  }
}

async function nextPipelineOrder(
  transaction: Prisma.TransactionClient,
  organizationId: string,
): Promise<number> {
  const maxOrder = await transaction.pipelineStage.aggregate({
    where: { organizationId },
    _max: { order: true },
  });
  return (maxOrder._max.order ?? 0) + 1;
}

async function reconcilePipelineStage(
  transaction: Prisma.TransactionClient,
  organizationId: string,
  stage: {
    readonly name: string;
    readonly systemKey: string;
    readonly color: string;
    readonly category: PipelineStageCategory;
  },
): Promise<void> {
  const stages = await transaction.pipelineStage.findMany({
    where: { organizationId },
    orderBy: [{ deletedAt: 'asc' }, { createdAt: 'asc' }],
  });
  const normalizedName = normalizeStageName(stage.name);
  const existing =
    stages.find((candidate) => candidate.systemKey === stage.systemKey) ??
    stages.find((candidate) => normalizeStageName(candidate.name) === normalizedName);

  if (existing) {
    await transaction.pipelineStage.update({
      where: {
        organizationId_id: { organizationId, id: existing.id },
      },
      data: {
        systemKey: stage.systemKey,
        color: stage.color,
        category: stage.category,
        active: true,
        deletedAt: null,
      },
    });
    return;
  }

  await transaction.pipelineStage.create({
    data: {
      organizationId,
      name: stage.name,
      systemKey: stage.systemKey,
      order: await nextPipelineOrder(transaction, organizationId),
      color: stage.color,
      category: stage.category,
    },
  });
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

      for (const name of expenseCategories) {
        await transaction.expenseCategory.upsert({
          where: { organizationId_name: { organizationId: organization.id, name } },
          update: { active: true, deletedAt: null },
          create: { organizationId: organization.id, name },
        });
      }

      for (const [index, reason] of lossReasons.entries()) {
        await transaction.lossReason.upsert({
          where: {
            organizationId_type_systemKey: {
              organizationId: organization.id,
              type: reason.type,
              systemKey: reason.systemKey,
            },
          },
          update: {
            name: reason.name,
            sortOrder: index + 1,
            active: true,
            deletedAt: null,
          },
          create: {
            organizationId: organization.id,
            type: reason.type,
            systemKey: reason.systemKey,
            name: reason.name,
            sortOrder: index + 1,
          },
        });
      }

      await transaction.prospectEngagementConfig.upsert({
        where: { organizationId: organization.id },
        update: {
          slaFirstResponseThresholdMinutes: 15,
          cadenceDays: [2, 4, 7, 14, 30],
          maxUnansweredAttempts: 3,
        },
        create: {
          organizationId: organization.id,
          slaFirstResponseThresholdMinutes: 15,
          cadenceDays: [2, 4, 7, 14, 30],
          maxUnansweredAttempts: 3,
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

      await synchronizeSystemRolePermissions(transaction);
      await synchronizePipelineStages(transaction);
      await synchronizePaymentCommissionDefaults(transaction, organization.id);

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

        const existingOwner = await transaction.user.findUnique({
          where: {
            organizationId_email: {
              organizationId: organization.id,
              email: normalizeEmail(ownerCredentials.email),
            },
          },
          select: { passwordHash: true },
        });
        let passwordHash = existingOwner?.passwordHash ?? null;
        if (passwordHash) {
          try {
            if (!(await argon2.verify(passwordHash, ownerCredentials.password))) {
              passwordHash = null;
            }
          } catch {
            passwordHash = null;
          }
        }
        if (!passwordHash) {
          passwordHash = await argon2.hash(ownerCredentials.password, {
            type: argon2.argon2id,
            memoryCost: 19_456,
            timeCost: 2,
            parallelism: 1,
          });
        }

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

seed().catch((error: unknown) => {
  console.error('Seed failed.', error);
  process.exitCode = 1;
});
