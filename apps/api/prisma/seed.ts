import argon2 from 'argon2';

import { PipelineStageCategory, PrismaClient } from '@prisma/client';

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
  { key: 'sales.read', name: 'Leer ventas' },
  { key: 'sales.create', name: 'Crear ventas' },
  { key: 'sales.update', name: 'Actualizar ventas' },
  { key: 'sales.delete', name: 'Eliminar ventas' },
  { key: 'payments.read', name: 'Leer pagos' },
  { key: 'payments.create', name: 'Crear pagos' },
  { key: 'payments.update', name: 'Actualizar pagos' },
  { key: 'payments.delete', name: 'Eliminar pagos' },
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
] as const;

const pipelineStages = [
  { name: 'Nuevo Lead', color: '#64748B', category: PipelineStageCategory.OPEN },
  { name: 'Dejó en visto', color: '#94A3B8', category: PipelineStageCategory.OPEN },
  { name: 'Demo entregada', color: '#3B82F6', category: PipelineStageCategory.OPEN },
  { name: 'Debe gastar créditos', color: '#8B5CF6', category: PipelineStageCategory.OPEN },
  { name: 'Debe juntar dinero', color: '#F59E0B', category: PipelineStageCategory.OPEN },
  { name: 'Posible comprador', color: '#F97316', category: PipelineStageCategory.OPEN },
  { name: 'Compró', color: '#22C55E', category: PipelineStageCategory.WON },
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
  'sales.read',
  'sales.create',
  'sales.update',
  'sales.delete',
  'payments.read',
  'payments.create',
  'payments.update',
  'payments.delete',
  'products.read',
  'campaigns.read',
] as const;

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
    .filter((permission) => permission.key.endsWith('.read'))
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
            color: stage.color,
            active: true,
            category: stage.category,
            deletedAt: null,
          },
          create: {
            organizationId: organization.id,
            name: stage.name,
            order: index + 1,
            color: stage.color,
            category: stage.category,
          },
        });
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
