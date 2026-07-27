import { PipelineStageCategory, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const roles = [
  { name: 'Owner', description: 'Propietario de la organización.' },
  { name: 'Admin', description: 'Administrador de la organización.' },
  { name: 'Sales', description: 'Responsable del proceso comercial.' },
  { name: 'Viewer', description: 'Acceso de solo lectura.' },
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

async function seed(): Promise<void> {
  try {
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

      for (const role of roles) {
        await transaction.role.upsert({
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
    });

    console.info('Seed completed successfully.');
  } finally {
    await prisma.$disconnect();
  }
}

void seed();
