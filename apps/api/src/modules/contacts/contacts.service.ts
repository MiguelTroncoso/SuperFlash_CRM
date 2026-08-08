import { HttpStatus, Injectable } from '@nestjs/common';
import {
  ActivityType,
  FollowUpHistoryAction,
  FollowUpPriority,
  FollowUpStatus,
  PipelineStageCategory,
  Prisma,
  ProspectConversationStateType,
} from '@prisma/client';

import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { OutboxService } from '../../infrastructure/outbox/outbox.service';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser, RequestMetadata } from '../auth/auth.types';
import { ContactAccessPolicy } from './access/contact-access.policy';
import { CONTACT_ERROR_CODES, contactException } from './contacts.errors';
import {
  ContactDetail,
  ContactMutation,
  ContactSummary,
  ContactsRepository,
} from './contacts.repository';
import {
  buildInitialOpportunityTitle,
  ContactWarning,
  displayName,
  hasMinimumIdentity,
  normalizeEmailValue,
  normalizeWhitespace,
} from './contacts.types';
import { ArchiveContactDto } from './dto/archive-contact.dto';
import { AssignContactDto } from './dto/assign-contact.dto';
import { CreateContactDto } from './dto/create-contact.dto';
import { CreateLeadDto } from './dto/create-lead.dto';
import { ContactSortBy, ListContactsQueryDto } from './dto/list-contacts-query.dto';
import { UpdateContactDto } from './dto/update-contact.dto';
import { PhoneNormalizerService } from './phone/phone-normalizer.service';

interface PublicTag {
  id: string;
  name: string;
  color: string | null;
}

interface PublicOpportunity {
  id: string;
  title: string;
  pipelineStage: { id: string; name: string; color: string; category: string };
  campaign: { id: string; name: string } | null;
  category: { id: string; name: string } | null;
  product: { id: string; name: string } | null;
}

interface PublicContact {
  id: string;
  firstName: string | null;
  lastName: string | null;
  displayName: string | null;
  email: string | null;
  phone: string | null;
  phoneNormalized: string | null;
  country: string | null;
  source: string | null;
  notes: string | null;
  isCustomer: boolean;
  archivedAt: Date | null;
  lastActivityAt: Date | null;
  assignedTo: { id: string; firstName: string; lastName: string | null } | null;
  tags: PublicTag[];
  activeOpportunity: PublicOpportunity | null;
  createdAt: Date;
  updatedAt: Date;
}

interface NormalizedContactValues {
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  phoneNormalized: string | null;
  country: string | null;
  source: string | null;
  notes: string | null;
}

interface ContactRequestContext {
  user: AuthenticatedUser;
  metadata: RequestMetadata;
}

@Injectable()
export class ContactsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: ContactsRepository,
    private readonly phoneNormalizer: PhoneNormalizerService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly accessPolicy: ContactAccessPolicy,
  ) {}

  async listAssignees(
    user: AuthenticatedUser,
  ): Promise<Array<{ id: string; firstName: string; lastName: string | null }>> {
    return this.repository.findAssignees(user.organizationId);
  }

  async create(
    dto: CreateContactDto,
    context: ContactRequestContext,
  ): Promise<PublicContact & { warnings: ContactWarning[] }> {
    const values = this.normalizeCreateValues(dto);
    this.assertIdentity(values);

    const phoneConflict = values.phoneNormalized
      ? await this.repository.findPhoneAcrossOrganization(
          context.user.organizationId,
          values.phoneNormalized,
        )
      : null;
    this.assertPhoneAvailable(phoneConflict);

    const emailDuplicate = values.email
      ? await this.repository.findActiveEmail(context.user.organizationId, values.email)
      : null;
    const warnings: ContactWarning[] = emailDuplicate
      ? [{ code: 'CONTACT_EMAIL_POSSIBLE_DUPLICATE', existingContactId: emailDuplicate.id }]
      : [];

    const tagIds = [...new Set(dto.tagIds ?? [])];
    const createOpportunity = dto.createOpportunity !== false;
    const now = new Date();

    try {
      const contactId = await this.prisma.$transaction(async (transaction) => {
        const assignedUserId = dto.assignedUserId ?? null;
        if (assignedUserId) {
          const assignee = await transaction.user.findFirst({
            where: {
              id: assignedUserId,
              organizationId: context.user.organizationId,
              status: 'ACTIVE',
              deletedAt: null,
              role: { deletedAt: null },
            },
            select: { id: true },
          });
          if (!assignee) {
            throw contactException(
              HttpStatus.NOT_FOUND,
              CONTACT_ERROR_CODES.ASSIGNEE_NOT_FOUND,
              'El responsable no existe o no está activo.',
            );
          }
        }

        const tags = tagIds.length
          ? await transaction.tag.findMany({
              where: {
                organizationId: context.user.organizationId,
                id: { in: tagIds },
                deletedAt: null,
              },
              select: { id: true },
            })
          : [];
        if (tags.length !== tagIds.length) {
          throw contactException(
            HttpStatus.NOT_FOUND,
            CONTACT_ERROR_CODES.TAG_NOT_FOUND,
            'Una o más etiquetas no existen o no están activas.',
          );
        }

        let campaignId: string | null = null;
        if (dto.campaignId) {
          const campaign = await transaction.campaign.findFirst({
            where: {
              id: dto.campaignId,
              organizationId: context.user.organizationId,
              deletedAt: null,
            },
            select: { id: true },
          });
          if (!campaign) {
            throw contactException(
              HttpStatus.NOT_FOUND,
              CONTACT_ERROR_CODES.CAMPAIGN_NOT_FOUND,
              'La campaña no existe en la organización actual.',
            );
          }
          campaignId = campaign.id;
        }

        let productId: string | null = null;
        if (dto.productId) {
          const product = await transaction.product.findFirst({
            where: {
              id: dto.productId,
              organizationId: context.user.organizationId,
              deletedAt: null,
            },
            select: { id: true },
          });
          if (!product) {
            throw contactException(
              HttpStatus.NOT_FOUND,
              CONTACT_ERROR_CODES.PRODUCT_NOT_FOUND,
              'El producto no existe en la organización actual.',
            );
          }
          productId = product.id;
        }

        const stage = createOpportunity
          ? await transaction.pipelineStage.findFirst({
              where: {
                organizationId: context.user.organizationId,
                active: true,
                deletedAt: null,
                category: PipelineStageCategory.OPEN,
              },
              orderBy: { order: 'asc' },
              select: { id: true },
            })
          : null;
        if (createOpportunity && !stage) {
          throw contactException(
            HttpStatus.NOT_FOUND,
            CONTACT_ERROR_CODES.INITIAL_STAGE_NOT_FOUND,
            'No existe una etapa inicial activa para crear la oportunidad.',
          );
        }

        const contact = await transaction.contact.create({
          data: {
            organizationId: context.user.organizationId,
            userId: assignedUserId,
            firstName: values.firstName,
            lastName: values.lastName,
            email: values.email,
            phone: values.phone,
            phoneNormalized: values.phoneNormalized,
            country: values.country,
            source: values.source,
            notes: values.notes,
            lastActivityAt: now,
            isCustomer: false,
          },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phoneNormalized: true,
          },
        });

        let opportunityId: string | null = null;
        if (createOpportunity && stage) {
          const opportunity = await transaction.opportunity.create({
            data: {
              organizationId: context.user.organizationId,
              contactId: contact.id,
              pipelineStageId: stage.id,
              ...(campaignId ? { campaignId } : {}),
              ...(productId ? { productId } : {}),
              userId: assignedUserId,
              lastStageChangedAt: now,
              title: buildInitialOpportunityTitle(
                contact.firstName,
                contact.lastName,
                contact.phoneNormalized,
              ),
            },
            select: { id: true },
          });
          opportunityId = opportunity.id;
          await transaction.opportunityStageHistory.create({
            data: {
              organizationId: context.user.organizationId,
              opportunityId: opportunity.id,
              toStageId: stage.id,
              changedByUserId: context.user.userId,
              reason: 'Oportunidad creada',
              changedAt: now,
            },
          });
        }

        if (tags.length > 0) {
          await transaction.contactTag.createMany({
            data: tags.map((tag) => ({
              organizationId: context.user.organizationId,
              contactId: contact.id,
              tagId: tag.id,
            })),
          });
        }

        const activityMetadata: Record<string, Prisma.InputJsonValue> = { createdBy: 'MANUAL' };
        if (values.source) activityMetadata.source = values.source;
        if (campaignId) activityMetadata.campaignId = campaignId;
        if (productId) activityMetadata.productId = productId;

        await transaction.activity.create({
          data: {
            organizationId: context.user.organizationId,
            userId: context.user.userId,
            contactId: contact.id,
            ...(opportunityId ? { opportunityId } : {}),
            type: ActivityType.SYSTEM,
            title: 'Contacto creado',
            occurredAt: now,
            metadata: activityMetadata,
            requestId: context.metadata.requestId ?? null,
          },
        });

        await this.audit.recordWithClient(transaction, {
          organizationId: context.user.organizationId,
          userId: context.user.userId,
          action: 'CONTACT_CREATED',
          tableName: 'Contact',
          recordId: contact.id,
          newValue: this.contactAuditValue(values),
          ip: context.metadata.ipAddress,
          requestId: context.metadata.requestId,
        });

        await this.outbox.enqueueWithClient(transaction, {
          eventType: 'ContactCreated',
          organizationId: context.user.organizationId,
          aggregateType: 'Contact',
          aggregateId: contact.id,
          actorId: context.user.userId,
          requestId: context.metadata.requestId ?? contact.id,
          payload: {
            contact: {
              id: contact.id,
              name: displayName(contact.firstName, contact.lastName),
              email: values.email,
              phone: values.phone,
            },
            opportunityId,
            source: values.source,
          },
        });

        return contact.id;
      });

      const summary = await this.repository.findSummaryById(context.user.organizationId, contactId);
      if (!summary) {
        throw new Error('El contacto creado no pudo ser recuperado.');
      }
      return { ...this.mapSummary(summary), warnings };
    } catch (error: unknown) {
      throw await this.mapDatabaseError(error, context.user.organizationId, values.phoneNormalized);
    }
  }

  async createLead(
    dto: CreateLeadDto,
    context: ContactRequestContext,
  ): Promise<Record<string, unknown>> {
    this.assertLeadPermission(context.user, 'opportunities.create');
    const values = this.normalizeCreateValues({
      ...(dto.firstName !== undefined ? { firstName: dto.firstName } : {}),
      ...(dto.lastName !== undefined ? { lastName: dto.lastName } : {}),
      ...(dto.email !== undefined ? { email: dto.email } : {}),
      ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
      ...(dto.country !== undefined ? { country: dto.country } : {}),
      source: dto.source ?? 'MANUAL',
      ...(dto.note !== undefined ? { notes: dto.note } : {}),
    });
    this.assertIdentity(values);
    const organizationId = context.user.organizationId;
    const now = new Date();
    const followUpAt = dto.nextFollowUpAt ? new Date(dto.nextFollowUpAt) : null;
    if (followUpAt && (Number.isNaN(followUpAt.getTime()) || followUpAt <= now)) {
      throw contactException(
        HttpStatus.BAD_REQUEST,
        CONTACT_ERROR_CODES.FOLLOW_UP_DATE_INVALID,
        'El próximo seguimiento debe estar en el futuro.',
      );
    }
    if (followUpAt) this.assertLeadPermission(context.user, 'followups.create');
    this.assertLeadPermission(context.user, 'marketing.attribution.manage');

    try {
      const result = await this.prisma.$transaction(async (transaction) => {
        const assignedUserId =
          dto.assignedUserId ?? (context.user.roleName === 'Sales' ? context.user.userId : null);
        if (assignedUserId) {
          const assignee = await transaction.user.findFirst({
            where: {
              organizationId,
              id: assignedUserId,
              status: 'ACTIVE',
              deletedAt: null,
              role: { deletedAt: null },
            },
            select: { id: true },
          });
          if (!assignee)
            throw contactException(
              HttpStatus.NOT_FOUND,
              CONTACT_ERROR_CODES.ASSIGNEE_NOT_FOUND,
              'El responsable no existe o no está activo.',
            );
        }
        if (context.user.roleName === 'Sales' && assignedUserId !== context.user.userId) {
          throw contactException(
            HttpStatus.FORBIDDEN,
            CONTACT_ERROR_CODES.LEAD_PERMISSION_REQUIRED,
            'Sales solo puede asignar leads a sí mismo.',
          );
        }

        const campaign = dto.campaignId
          ? await transaction.campaign.findFirst({
              where: { organizationId, id: dto.campaignId, active: true, deletedAt: null },
              select: { id: true },
            })
          : null;
        if (dto.campaignId && !campaign)
          throw contactException(
            HttpStatus.NOT_FOUND,
            CONTACT_ERROR_CODES.CAMPAIGN_NOT_FOUND,
            'La campaña no existe o no está activa.',
          );

        if (dto.adSetId) {
          if (!dto.campaignId)
            throw contactException(
              HttpStatus.BAD_REQUEST,
              CONTACT_ERROR_CODES.AD_SET_NOT_FOUND,
              'El conjunto de anuncios requiere una campaña.',
            );
          const adSet = await transaction.marketingAdSet.findFirst({
            where: { organizationId, id: dto.adSetId, campaignId: dto.campaignId, deletedAt: null },
            select: { id: true },
          });
          if (!adSet)
            throw contactException(
              HttpStatus.NOT_FOUND,
              CONTACT_ERROR_CODES.AD_SET_NOT_FOUND,
              'El conjunto de anuncios no existe.',
            );
        }
        if (dto.adId) {
          if (!dto.campaignId)
            throw contactException(
              HttpStatus.BAD_REQUEST,
              CONTACT_ERROR_CODES.AD_NOT_FOUND,
              'El anuncio requiere una campaña.',
            );
          const ad = await transaction.marketingAd.findFirst({
            where: { organizationId, id: dto.adId, campaignId: dto.campaignId, deletedAt: null },
            select: { id: true },
          });
          if (!ad)
            throw contactException(
              HttpStatus.NOT_FOUND,
              CONTACT_ERROR_CODES.AD_NOT_FOUND,
              'El anuncio no existe.',
            );
        }
        if (dto.creativeId) {
          if (!dto.campaignId)
            throw contactException(
              HttpStatus.BAD_REQUEST,
              CONTACT_ERROR_CODES.CREATIVE_NOT_FOUND,
              'La creatividad requiere una campaña.',
            );
          const creative = await transaction.marketingCreative.findFirst({
            where: {
              organizationId,
              id: dto.creativeId,
              campaignId: dto.campaignId,
              deletedAt: null,
            },
            select: { id: true },
          });
          if (!creative)
            throw contactException(
              HttpStatus.NOT_FOUND,
              CONTACT_ERROR_CODES.CREATIVE_NOT_FOUND,
              'La creatividad no existe.',
            );
        }

        const category = dto.categoryId
          ? await transaction.productCategory.findFirst({
              where: { organizationId, id: dto.categoryId, active: true, deletedAt: null },
              select: { id: true },
            })
          : null;
        if (dto.categoryId && !category)
          throw contactException(
            HttpStatus.NOT_FOUND,
            CONTACT_ERROR_CODES.CATEGORY_NOT_FOUND,
            'La categoría no existe o no está activa.',
          );

        const product = dto.productId
          ? await transaction.product.findFirst({
              where: {
                organizationId,
                id: dto.productId,
                active: true,
                status: 'ACTIVE',
                deletedAt: null,
              },
              select: { id: true, categoryId: true },
            })
          : null;
        if (dto.productId && !product)
          throw contactException(
            HttpStatus.NOT_FOUND,
            CONTACT_ERROR_CODES.PRODUCT_NOT_FOUND,
            'El producto no existe o no está activo.',
          );
        if (category?.id && product?.categoryId && category.id !== product.categoryId)
          throw contactException(
            HttpStatus.BAD_REQUEST,
            CONTACT_ERROR_CODES.INTEREST_INVALID,
            'El producto no pertenece a la categoría seleccionada.',
          );
        const categoryId = category?.id ?? product?.categoryId ?? null;

        const existing = values.phoneNormalized
          ? await transaction.contact.findFirst({
              where: { organizationId, phoneNormalized: values.phoneNormalized },
              orderBy: [{ deletedAt: 'asc' }, { archivedAt: 'asc' }, { createdAt: 'asc' }],
              select: {
                id: true,
                firstName: true,
                lastName: true,
                phoneNormalized: true,
                deletedAt: true,
                archivedAt: true,
                userId: true,
              },
            })
          : values.email
            ? await transaction.contact.findFirst({
                where: { organizationId, email: values.email, deletedAt: null },
                orderBy: { createdAt: 'asc' },
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  phoneNormalized: true,
                  deletedAt: true,
                  archivedAt: true,
                  userId: true,
                },
              })
            : null;
        if (existing?.deletedAt || existing?.archivedAt)
          throw contactException(
            HttpStatus.CONFLICT,
            CONTACT_ERROR_CODES.PHONE_ARCHIVED,
            'Ya existe un contacto archivado con este teléfono.',
            { existingContactId: existing.id },
          );

        const contact = existing
          ? existing
          : await transaction.contact.create({
              data: {
                organizationId,
                userId: assignedUserId,
                firstName: values.firstName,
                lastName: values.lastName,
                email: values.email,
                phone: values.phone,
                phoneNormalized: values.phoneNormalized,
                country: values.country,
                source: values.source,
                notes: values.notes,
                lastActivityAt: now,
                isCustomer: false,
              },
              select: {
                id: true,
                firstName: true,
                lastName: true,
                phoneNormalized: true,
                deletedAt: true,
                archivedAt: true,
                userId: true,
              },
            });
        const stage = await transaction.pipelineStage.findFirst({
          where: {
            organizationId,
            active: true,
            deletedAt: null,
            category: PipelineStageCategory.OPEN,
          },
          orderBy: { order: 'asc' },
          select: { id: true, name: true },
        });
        if (!stage)
          throw contactException(
            HttpStatus.NOT_FOUND,
            CONTACT_ERROR_CODES.INITIAL_STAGE_NOT_FOUND,
            'No existe una etapa inicial activa.',
          );
        const title = buildInitialOpportunityTitle(
          contact.firstName,
          contact.lastName,
          contact.phoneNormalized,
        );
        const opportunity = await transaction.opportunity.create({
          data: {
            organizationId,
            contactId: contact.id,
            pipelineStageId: stage.id,
            campaignId: campaign?.id ?? null,
            categoryId,
            productId: product?.id ?? null,
            userId: assignedUserId ?? existing?.userId ?? null,
            title,
            notes: values.notes,
            priority: dto.priority ?? 'NORMAL',
            probability: dto.probability ?? 50,
            lastStageChangedAt: now,
          },
          select: { id: true, title: true, userId: true },
        });
        await transaction.opportunityStageHistory.create({
          data: {
            organizationId,
            opportunityId: opportunity.id,
            toStageId: stage.id,
            changedByUserId: context.user.userId,
            reason: 'Lead creado',
            changedAt: now,
          },
        });
        if (categoryId || product?.id) {
          await transaction.opportunityInterestHistory.create({
            data: {
              organizationId,
              opportunityId: opportunity.id,
              categoryId,
              productId: product?.id ?? null,
              changedByUserId: context.user.userId,
              reason: 'Lead creado',
            },
          });
        }
        const originalAttribution = await transaction.attribution.findFirst({
          where: { organizationId, contactId: contact.id, kind: 'ORIGINAL', deletedAt: null },
          select: { id: true },
        });
        if (!originalAttribution) {
          await transaction.attribution.create({
            data: {
              organizationId,
              kind: 'ORIGINAL',
              contactId: contact.id,
              opportunityId: opportunity.id,
              campaignId: campaign?.id ?? null,
              adSetId: dto.adSetId ?? null,
              adId: dto.adId ?? null,
              creativeId: dto.creativeId ?? null,
              platform: dto.platform?.trim() || 'DIRECT',
              source: dto.source?.trim() || 'MANUAL',
              targetedCountry: values.country,
              actualCountry: values.country,
              acquiredAt: now,
              createdByUserId: context.user.userId,
              requestId: context.metadata.requestId ?? null,
            },
          });
        }
        const prospectState = await transaction.prospectConversationState.findUnique({
          where: { organizationId_contactId: { organizationId, contactId: contact.id } },
          select: { id: true, state: true },
        });
        if (!prospectState) {
          await transaction.prospectConversationState.create({
            data: {
              organizationId,
              contactId: contact.id,
              state: ProspectConversationStateType.NEW_UNANSWERED,
              changedByUserId: context.user.userId,
              changeReason: 'Lead creado',
              requestId: context.metadata.requestId ?? null,
            },
          });
          await transaction.prospectConversationStateHistory.create({
            data: {
              organizationId,
              contactId: contact.id,
              state: ProspectConversationStateType.NEW_UNANSWERED,
              source: 'LEAD_INTAKE',
              changedByUserId: context.user.userId,
              requestId: context.metadata.requestId ?? null,
            },
          });
        }
        let followUpId: string | null = null;
        if (followUpAt) {
          const followUp = await transaction.followUp.create({
            data: {
              organizationId,
              userId: opportunity.userId ?? context.user.userId,
              opportunityId: opportunity.id,
              title: `Contactar lead: ${title}`,
              dueAt: followUpAt,
              priority: FollowUpPriority.NORMAL,
              status: FollowUpStatus.PENDING,
              note: values.notes,
              createdByUserId: context.user.userId,
            },
            select: { id: true },
          });
          followUpId = followUp.id;
          await transaction.followUpHistory.create({
            data: {
              organizationId,
              followUpId: followUp.id,
              action: FollowUpHistoryAction.CREATED,
              changedByUserId: context.user.userId,
              newDueAt: followUpAt,
              newStatus: FollowUpStatus.PENDING,
              note: values.notes,
            },
          });
        }
        await transaction.activity.create({
          data: {
            organizationId,
            userId: context.user.userId,
            contactId: contact.id,
            opportunityId: opportunity.id,
            ...(followUpId ? { followUpId } : {}),
            type: ActivityType.SYSTEM,
            title: 'Lead creado',
            description: values.notes,
            occurredAt: now,
            metadata: {
              source: values.source ?? 'MANUAL',
              platform: dto.platform?.trim() || 'DIRECT',
              categoryId,
              productId: product?.id ?? null,
              createdBy: 'LEAD_INTAKE',
            },
            requestId: context.metadata.requestId ?? null,
          },
        });
        await transaction.contact.update({
          where: { organizationId_id: { organizationId, id: contact.id } },
          data: { lastActivityAt: now },
        });
        await this.audit.recordWithClient(transaction, {
          organizationId,
          userId: context.user.userId,
          action: 'LEAD_CREATED',
          tableName: 'Opportunity',
          recordId: opportunity.id,
          newValue: {
            contactId: contact.id,
            categoryId,
            productId: product?.id ?? null,
            campaignId: campaign?.id ?? null,
            followUpId,
          },
          ip: context.metadata.ipAddress,
          requestId: context.metadata.requestId,
        });
        await this.outbox.enqueueWithClient(transaction, {
          eventType: 'LeadCreated',
          organizationId,
          aggregateType: 'Opportunity',
          aggregateId: opportunity.id,
          actorId: context.user.userId,
          requestId: context.metadata.requestId ?? opportunity.id,
          payload: {
            contactId: contact.id,
            opportunityId: opportunity.id,
            categoryId,
            productId: product?.id ?? null,
            followUpId,
          },
        });
        return {
          contactId: contact.id,
          opportunityId: opportunity.id,
          title: opportunity.title,
          reusedContact: Boolean(existing),
          followUpId,
        };
      });
      return result;
    } catch (error: unknown) {
      throw await this.mapDatabaseError(error, organizationId, values.phoneNormalized);
    }
  }

  async list(
    query: ListContactsQueryDto,
    user: AuthenticatedUser,
  ): Promise<{
    data: PublicContact[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }> {
    this.accessPolicy.assertCanRead(user);
    const where = this.buildListWhere(query);
    const orderBy: Prisma.ContactOrderByWithRelationInput = {
      [this.sortField(query.sortBy)]: query.sortOrder,
    };
    const skip = (query.page - 1) * query.limit;
    const [contacts, total] = await Promise.all([
      this.repository.findForList(user.organizationId, where, orderBy, skip, query.limit),
      this.repository.count(user.organizationId, where),
    ]);
    return {
      data: contacts.map((contact) => this.mapSummary(contact)),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async findOne(id: string, user: AuthenticatedUser): Promise<Record<string, unknown>> {
    this.accessPolicy.assertCanRead(user);
    const contact = await this.repository.findDetailById(user.organizationId, id);
    if (!contact) {
      throw contactException(
        HttpStatus.NOT_FOUND,
        CONTACT_ERROR_CODES.NOT_FOUND,
        'Contacto no encontrado.',
      );
    }

    const salesSummary = await this.prisma.sale.aggregate({
      where: {
        organizationId: user.organizationId,
        deletedAt: null,
        opportunity: { contactId: contact.id, deletedAt: null },
      },
      _count: { id: true },
      _sum: { total: true },
    });

    return {
      ...this.mapSummary(contact),
      opportunities: contact.opportunities.map((opportunity) => this.mapOpportunity(opportunity)),
      recentActivities: contact.activities,
      upcomingFollowUps: await this.repository.findUpcomingFollowUps(
        user.organizationId,
        contact.id,
      ),
      salesSummary: {
        count: salesSummary._count.id,
        total: salesSummary._sum.total?.toString() ?? '0',
      },
    };
  }

  async update(
    id: string,
    dto: UpdateContactDto,
    context: ContactRequestContext,
  ): Promise<PublicContact & { warnings: ContactWarning[] }> {
    const contact = await this.requireMutationContact(context.user.organizationId, id);
    this.accessPolicy.assertCanMutate(context.user, contact);
    const values = await this.mergeUpdatedValues(contact, dto);
    this.assertIdentity(values);

    const phoneConflict = values.phoneNormalized
      ? await this.repository.findPhoneAcrossOrganization(
          context.user.organizationId,
          values.phoneNormalized,
          id,
        )
      : null;
    this.assertPhoneAvailable(phoneConflict);

    const emailDuplicate = values.email
      ? await this.repository.findActiveEmail(context.user.organizationId, values.email, id)
      : null;
    const warnings: ContactWarning[] = emailDuplicate
      ? [{ code: 'CONTACT_EMAIL_POSSIBLE_DUPLICATE', existingContactId: emailDuplicate.id }]
      : [];

    try {
      await this.prisma.$transaction(async (transaction) => {
        await transaction.contact.update({
          where: { organizationId_id: { organizationId: context.user.organizationId, id } },
          data: {
            firstName: values.firstName,
            lastName: values.lastName,
            email: values.email,
            phone: values.phone,
            phoneNormalized: values.phoneNormalized,
            country: values.country,
            source: values.source,
            notes: values.notes,
          },
        });
        await this.audit.recordWithClient(transaction, {
          organizationId: context.user.organizationId,
          userId: context.user.userId,
          action: 'CONTACT_UPDATED',
          tableName: 'Contact',
          recordId: id,
          previousValue: this.contactAuditValue(contact),
          newValue: this.contactAuditValue(values),
          ip: context.metadata.ipAddress,
        });
      });
    } catch (error: unknown) {
      throw await this.mapDatabaseError(error, context.user.organizationId, values.phoneNormalized);
    }

    const updated = await this.repository.findSummaryById(context.user.organizationId, id);
    if (!updated) {
      throw contactException(
        HttpStatus.NOT_FOUND,
        CONTACT_ERROR_CODES.NOT_FOUND,
        'Contacto no encontrado.',
      );
    }
    return { ...this.mapSummary(updated), warnings };
  }

  async assign(
    id: string,
    dto: AssignContactDto,
    context: ContactRequestContext,
  ): Promise<PublicContact> {
    if (!('assignedUserId' in dto)) {
      throw contactException(
        HttpStatus.BAD_REQUEST,
        CONTACT_ERROR_CODES.ASSIGNEE_NOT_FOUND,
        'Debes indicar el responsable o null.',
      );
    }
    const contact = await this.requireMutationContact(context.user.organizationId, id);
    this.accessPolicy.assertCanMutate(context.user, contact);
    const assignedUserId = dto.assignedUserId ?? null;
    if (assignedUserId) {
      const assignee = await this.repository.findAssignee(
        context.user.organizationId,
        assignedUserId,
      );
      if (!assignee) {
        throw contactException(
          HttpStatus.NOT_FOUND,
          CONTACT_ERROR_CODES.ASSIGNEE_NOT_FOUND,
          'El responsable no existe o no está activo.',
        );
      }
    }
    if (contact.userId === assignedUserId) {
      const summary = await this.repository.findSummaryById(context.user.organizationId, id);
      if (!summary)
        throw contactException(
          HttpStatus.NOT_FOUND,
          CONTACT_ERROR_CODES.NOT_FOUND,
          'Contacto no encontrado.',
        );
      return this.mapSummary(summary);
    }
    const now = new Date();
    await this.prisma.$transaction(async (transaction) => {
      await transaction.contact.update({
        where: { organizationId_id: { organizationId: context.user.organizationId, id } },
        data: { userId: assignedUserId, lastActivityAt: now },
      });
      await transaction.opportunity.updateMany({
        where: {
          organizationId: context.user.organizationId,
          contactId: id,
          deletedAt: null,
          pipelineStage: { deletedAt: null, active: true, category: PipelineStageCategory.OPEN },
          ...(assignedUserId ? { userId: null } : { userId: contact.userId }),
        },
        data: { userId: assignedUserId },
      });
      const metadata: Record<string, Prisma.InputJsonValue> = { event: 'assignee_changed' };
      if (contact.userId) metadata.previousAssigneeId = contact.userId;
      if (assignedUserId) metadata.newAssigneeId = assignedUserId;
      await transaction.activity.create({
        data: {
          organizationId: context.user.organizationId,
          userId: context.user.userId,
          contactId: id,
          type: ActivityType.STATUS_CHANGE,
          title: 'Responsable actualizado',
          occurredAt: now,
          metadata,
        },
      });
      await this.audit.recordWithClient(transaction, {
        organizationId: context.user.organizationId,
        userId: context.user.userId,
        action: 'CONTACT_ASSIGNEE_CHANGED',
        tableName: 'Contact',
        recordId: id,
        previousValue: contact.userId ? { assignedUserId: contact.userId } : {},
        newValue: assignedUserId ? { assignedUserId } : {},
        ip: context.metadata.ipAddress,
      });
    });
    const summary = await this.repository.findSummaryById(context.user.organizationId, id);
    if (!summary)
      throw contactException(
        HttpStatus.NOT_FOUND,
        CONTACT_ERROR_CODES.NOT_FOUND,
        'Contacto no encontrado.',
      );
    return this.mapSummary(summary);
  }

  async archive(
    id: string,
    dto: ArchiveContactDto,
    context: ContactRequestContext,
  ): Promise<PublicContact> {
    const contact = await this.requireMutationContact(context.user.organizationId, id);
    this.accessPolicy.assertCanMutate(context.user, contact);
    if (contact.archivedAt) {
      const summary = await this.repository.findSummaryById(context.user.organizationId, id);
      if (!summary)
        throw contactException(
          HttpStatus.NOT_FOUND,
          CONTACT_ERROR_CODES.NOT_FOUND,
          'Contacto no encontrado.',
        );
      return this.mapSummary(summary);
    }
    const now = new Date();
    await this.prisma.$transaction(async (transaction) => {
      await transaction.contact.update({
        where: { organizationId_id: { organizationId: context.user.organizationId, id } },
        data: { archivedAt: now, lastActivityAt: now },
      });
      await transaction.activity.create({
        data: {
          organizationId: context.user.organizationId,
          userId: context.user.userId,
          contactId: id,
          type: ActivityType.SYSTEM,
          title: 'Contacto archivado',
          description: dto.reason ?? null,
          occurredAt: now,
          metadata: { event: 'contact_archived' },
        },
      });
      await this.audit.recordWithClient(transaction, {
        organizationId: context.user.organizationId,
        userId: context.user.userId,
        action: 'CONTACT_ARCHIVED',
        tableName: 'Contact',
        recordId: id,
        previousValue: { archivedAt: null },
        newValue: dto.reason
          ? { archivedAt: now.toISOString(), reason: dto.reason }
          : { archivedAt: now.toISOString() },
        ip: context.metadata.ipAddress,
      });
    });
    const summary = await this.repository.findSummaryById(context.user.organizationId, id);
    if (!summary)
      throw contactException(
        HttpStatus.NOT_FOUND,
        CONTACT_ERROR_CODES.NOT_FOUND,
        'Contacto no encontrado.',
      );
    return this.mapSummary(summary);
  }

  async restore(id: string, context: ContactRequestContext): Promise<PublicContact> {
    const contact = await this.requireMutationContact(context.user.organizationId, id);
    this.accessPolicy.assertCanMutate(context.user, contact);
    if (contact.archivedAt === null) {
      const summary = await this.repository.findSummaryById(context.user.organizationId, id);
      if (!summary)
        throw contactException(
          HttpStatus.NOT_FOUND,
          CONTACT_ERROR_CODES.NOT_FOUND,
          'Contacto no encontrado.',
        );
      return this.mapSummary(summary);
    }
    if (contact.phoneNormalized) {
      const conflict = await this.repository.findPhoneAcrossOrganization(
        context.user.organizationId,
        contact.phoneNormalized,
        id,
      );
      if (conflict) {
        throw contactException(
          HttpStatus.CONFLICT,
          CONTACT_ERROR_CODES.RESTORE_CONFLICT,
          'No se puede restaurar porque el teléfono ya está asociado a otro contacto.',
          { existingContactId: conflict.id },
        );
      }
    }
    const now = new Date();
    try {
      await this.prisma.$transaction(async (transaction) => {
        await transaction.contact.update({
          where: { organizationId_id: { organizationId: context.user.organizationId, id } },
          data: { archivedAt: null, lastActivityAt: now },
        });
        await transaction.activity.create({
          data: {
            organizationId: context.user.organizationId,
            userId: context.user.userId,
            contactId: id,
            type: ActivityType.SYSTEM,
            title: 'Contacto restaurado',
            occurredAt: now,
            metadata: { event: 'contact_restored' },
          },
        });
        await this.audit.recordWithClient(transaction, {
          organizationId: context.user.organizationId,
          userId: context.user.userId,
          action: 'CONTACT_RESTORED',
          tableName: 'Contact',
          recordId: id,
          previousValue: contact.archivedAt ? { archivedAt: contact.archivedAt.toISOString() } : {},
          newValue: { archivedAt: null },
          ip: context.metadata.ipAddress,
        });
      });
    } catch (error: unknown) {
      throw await this.mapDatabaseError(
        error,
        context.user.organizationId,
        contact.phoneNormalized,
      );
    }
    const summary = await this.repository.findSummaryById(context.user.organizationId, id);
    if (!summary)
      throw contactException(
        HttpStatus.NOT_FOUND,
        CONTACT_ERROR_CODES.NOT_FOUND,
        'Contacto no encontrado.',
      );
    return this.mapSummary(summary);
  }

  async addTag(id: string, tagId: string, context: ContactRequestContext): Promise<PublicContact> {
    const contact = await this.requireMutationContact(context.user.organizationId, id);
    this.accessPolicy.assertCanMutate(context.user, contact);
    const tag = await this.repository.findTag(context.user.organizationId, tagId);
    if (!tag || tag.deletedAt) {
      throw contactException(
        HttpStatus.NOT_FOUND,
        CONTACT_ERROR_CODES.TAG_NOT_FOUND,
        'Etiqueta no encontrada.',
      );
    }
    await this.prisma.$transaction(async (transaction) => {
      const existing = await transaction.contactTag.findFirst({
        where: { organizationId: context.user.organizationId, contactId: id, tagId },
        select: { id: true, deletedAt: true },
      });
      if (existing?.deletedAt) {
        await transaction.contactTag.update({
          where: { id: existing.id },
          data: { deletedAt: null },
        });
      } else if (!existing) {
        await transaction.contactTag.create({
          data: { organizationId: context.user.organizationId, contactId: id, tagId },
        });
      } else {
        return;
      }
      await this.audit.recordWithClient(transaction, {
        organizationId: context.user.organizationId,
        userId: context.user.userId,
        action: 'CONTACT_TAG_ADDED',
        tableName: 'ContactTag',
        recordId: existing?.id ?? `${id}:${tagId}`,
        newValue: { tagId },
        ip: context.metadata.ipAddress,
      });
    });
    const summary = await this.repository.findSummaryById(context.user.organizationId, id);
    if (!summary)
      throw contactException(
        HttpStatus.NOT_FOUND,
        CONTACT_ERROR_CODES.NOT_FOUND,
        'Contacto no encontrado.',
      );
    return this.mapSummary(summary);
  }

  async removeTag(
    id: string,
    tagId: string,
    context: ContactRequestContext,
  ): Promise<PublicContact> {
    const contact = await this.requireMutationContact(context.user.organizationId, id);
    this.accessPolicy.assertCanMutate(context.user, contact);
    await this.prisma.$transaction(async (transaction) => {
      const existing = await transaction.contactTag.findFirst({
        where: {
          organizationId: context.user.organizationId,
          contactId: id,
          tagId,
          deletedAt: null,
        },
        select: { id: true },
      });
      if (!existing) return;
      await transaction.contactTag.update({
        where: { id: existing.id },
        data: { deletedAt: new Date() },
      });
      await this.audit.recordWithClient(transaction, {
        organizationId: context.user.organizationId,
        userId: context.user.userId,
        action: 'CONTACT_TAG_REMOVED',
        tableName: 'ContactTag',
        recordId: existing.id,
        previousValue: { tagId },
        newValue: { deletedAt: new Date().toISOString() },
        ip: context.metadata.ipAddress,
      });
    });
    const summary = await this.repository.findSummaryById(context.user.organizationId, id);
    if (!summary)
      throw contactException(
        HttpStatus.NOT_FOUND,
        CONTACT_ERROR_CODES.NOT_FOUND,
        'Contacto no encontrado.',
      );
    return this.mapSummary(summary);
  }

  private normalizeCreateValues(dto: CreateContactDto): NormalizedContactValues {
    const country = dto.country ? this.phoneNormalizer.normalizeCountry(dto.country) : null;
    const normalizedPhone = this.phoneNormalizer.normalize(dto.phone, country);
    return {
      firstName: normalizeWhitespace(dto.firstName),
      lastName: normalizeWhitespace(dto.lastName),
      email: normalizeEmailValue(dto.email),
      phone: normalizedPhone?.phone ?? null,
      phoneNormalized: normalizedPhone?.phoneNormalized ?? null,
      country: country,
      source: normalizeWhitespace(dto.source),
      notes: normalizeWhitespace(dto.notes),
    };
  }

  private assertLeadPermission(user: AuthenticatedUser, permission: string): void {
    if (!user.permissions.includes(permission)) {
      throw contactException(
        HttpStatus.FORBIDDEN,
        CONTACT_ERROR_CODES.LEAD_PERMISSION_REQUIRED,
        `No tienes permisos para completar el flujo de lead (${permission}).`,
      );
    }
  }

  private async mergeUpdatedValues(
    contact: ContactMutation,
    dto: UpdateContactDto,
  ): Promise<NormalizedContactValues> {
    const country =
      'country' in dto
        ? dto.country
          ? this.phoneNormalizer.normalizeCountry(dto.country)
          : null
        : contact.country
          ? this.phoneNormalizer.normalizeCountry(contact.country)
          : null;
    let phone = contact.phone;
    let phoneNormalized = contact.phoneNormalized;
    if ('phone' in dto) {
      const normalizedPhone = this.phoneNormalizer.normalize(dto.phone, country);
      phone = normalizedPhone?.phone ?? null;
      phoneNormalized = normalizedPhone?.phoneNormalized ?? null;
    } else if ('country' in dto && contact.phone && !contact.phone.startsWith('+')) {
      const normalizedPhone = this.phoneNormalizer.normalize(contact.phone, country);
      phone = normalizedPhone?.phone ?? null;
      phoneNormalized = normalizedPhone?.phoneNormalized ?? null;
    }
    return {
      firstName: 'firstName' in dto ? normalizeWhitespace(dto.firstName) : contact.firstName,
      lastName: 'lastName' in dto ? normalizeWhitespace(dto.lastName) : contact.lastName,
      email: 'email' in dto ? normalizeEmailValue(dto.email) : contact.email,
      phone,
      phoneNormalized,
      country,
      source: 'source' in dto ? normalizeWhitespace(dto.source) : contact.source,
      notes: 'notes' in dto ? normalizeWhitespace(dto.notes) : contact.notes,
    };
  }

  private assertIdentity(values: NormalizedContactValues): void {
    if (!hasMinimumIdentity(values)) {
      throw contactException(
        HttpStatus.BAD_REQUEST,
        CONTACT_ERROR_CODES.MINIMUM_IDENTITY_REQUIRED,
        'Debes indicar al menos un nombre, correo o teléfono.',
      );
    }
  }

  private assertPhoneAvailable(contact: ContactMutation | null): void {
    if (!contact) return;
    if (contact.deletedAt || contact.archivedAt) {
      throw contactException(
        HttpStatus.CONFLICT,
        CONTACT_ERROR_CODES.PHONE_ARCHIVED,
        'Ya existe un contacto archivado con este número.',
        { existingContactId: contact.id },
      );
    }
    throw contactException(
      HttpStatus.CONFLICT,
      CONTACT_ERROR_CODES.PHONE_ALREADY_EXISTS,
      'Ya existe un contacto con este número.',
      { existingContactId: contact.id },
    );
  }

  private async requireMutationContact(
    organizationId: string,
    id: string,
  ): Promise<ContactMutation> {
    const contact = await this.repository.findForMutation(organizationId, id);
    if (!contact || contact.deletedAt) {
      throw contactException(
        HttpStatus.NOT_FOUND,
        CONTACT_ERROR_CODES.NOT_FOUND,
        'Contacto no encontrado.',
      );
    }
    return contact;
  }

  private buildListWhere(query: ListContactsQueryDto): Prisma.ContactWhereInput {
    const search = query.search?.trim();
    const escapedSearch = search?.replace(/[\\%_]/g, '\\$&');
    return {
      deletedAt: null,
      archivedAt: query.archived ? { not: null } : null,
      ...(query.country ? { country: query.country } : {}),
      ...(query.source ? { source: query.source } : {}),
      ...(query.assignedUserId ? { userId: query.assignedUserId } : {}),
      ...(query.isCustomer === undefined ? {} : { isCustomer: query.isCustomer }),
      ...(query.createdFrom || query.createdTo
        ? {
            createdAt: {
              ...(query.createdFrom ? { gte: new Date(query.createdFrom) } : {}),
              ...(query.createdTo ? { lte: new Date(query.createdTo) } : {}),
            },
          }
        : {}),
      ...(query.tagId
        ? { tags: { some: { tagId: query.tagId, deletedAt: null, tag: { deletedAt: null } } } }
        : {}),
      ...(query.campaignId
        ? { opportunities: { some: { campaignId: query.campaignId, deletedAt: null } } }
        : {}),
      ...(query.productId
        ? { opportunities: { some: { productId: query.productId, deletedAt: null } } }
        : {}),
      ...(escapedSearch
        ? {
            OR: [
              { firstName: { contains: escapedSearch, mode: 'insensitive' } },
              { lastName: { contains: escapedSearch, mode: 'insensitive' } },
              { email: { contains: escapedSearch, mode: 'insensitive' } },
              { phone: { contains: escapedSearch, mode: 'insensitive' } },
              { phoneNormalized: { contains: escapedSearch, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
  }

  private sortField(sortBy: ContactSortBy): ContactSortBy {
    return sortBy;
  }

  private contactAuditValue(
    values: NormalizedContactValues | ContactMutation,
  ): Prisma.InputJsonObject {
    return {
      firstName: values.firstName,
      lastName: values.lastName,
      email: values.email,
      phone: values.phone,
      phoneNormalized: values.phoneNormalized,
      country: values.country,
      source: values.source,
      notes: values.notes,
    };
  }

  private async mapDatabaseError(
    error: unknown,
    organizationId: string,
    phoneNormalized: string | null,
  ): Promise<Error> {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const target = Array.isArray(error.meta?.target)
        ? error.meta.target.join(',')
        : String(error.meta?.target ?? '');
      if (
        target.includes('phoneNormalized') ||
        target.includes('Contact_organizationId_phoneNormalized')
      ) {
        const conflict = phoneNormalized
          ? await this.repository.findPhoneAcrossOrganization(organizationId, phoneNormalized)
          : null;
        if (conflict) {
          return contactException(
            HttpStatus.CONFLICT,
            conflict.archivedAt || conflict.deletedAt
              ? CONTACT_ERROR_CODES.PHONE_ARCHIVED
              : CONTACT_ERROR_CODES.PHONE_ALREADY_EXISTS,
            conflict.archivedAt || conflict.deletedAt
              ? 'Ya existe un contacto archivado con este número.'
              : 'Ya existe un contacto con este número.',
            { existingContactId: conflict.id },
          );
        }
        return contactException(
          HttpStatus.CONFLICT,
          CONTACT_ERROR_CODES.PHONE_ALREADY_EXISTS,
          'Ya existe un contacto con este número.',
        );
      }
      return contactException(
        HttpStatus.CONFLICT,
        CONTACT_ERROR_CODES.OPERATION_FAILED,
        'La operación no pudo completarse por un conflicto de integridad.',
      );
    }
    return error instanceof Error
      ? error
      : new Error('La operación de contactos no pudo completarse.');
  }

  private mapSummary(contact: ContactSummary): PublicContact {
    return {
      id: contact.id,
      firstName: contact.firstName,
      lastName: contact.lastName,
      displayName: displayName(contact.firstName, contact.lastName),
      email: contact.email,
      phone: contact.phone,
      phoneNormalized: contact.phoneNormalized,
      country: contact.country,
      source: contact.source,
      notes: contact.notes,
      isCustomer: contact.isCustomer,
      archivedAt: contact.archivedAt,
      lastActivityAt: contact.lastActivityAt,
      assignedTo: contact.assignedTo,
      tags: contact.tags.map((contactTag) => contactTag.tag),
      activeOpportunity: contact.opportunities[0]
        ? this.mapOpportunity(contact.opportunities[0])
        : null,
      createdAt: contact.createdAt,
      updatedAt: contact.updatedAt,
    };
  }

  private mapOpportunity(
    opportunity: ContactSummary['opportunities'][number] | ContactDetail['opportunities'][number],
  ): PublicOpportunity {
    return {
      id: opportunity.id,
      title: opportunity.title,
      pipelineStage: opportunity.pipelineStage,
      campaign: opportunity.campaign,
      category: opportunity.category,
      product: opportunity.product,
    };
  }
}
