import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WhatsAppConnectionStatus, WhatsAppMessageDirection } from '@prisma/client';

import { AppConfiguration } from '../../../../config/configuration';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service';
import { WhatsAppWebhookService } from '../../../whatsapp/whatsapp.webhook.service';
import { CommunicationProvider } from '../../interfaces/communication-provider.interface';
import {
  ChannelHealth,
  CommunicationProviderConfiguration,
  CommunicationMessageInput,
  CommunicationOperationResult,
  CommunicationWebhookInput,
  CommunicationWebhookResult,
} from '../../communication.types';

@Injectable()
export class WhatsAppChannelProvider implements CommunicationProvider, OnModuleInit {
  readonly channel = 'WHATSAPP' as const;

  private readonly logger = new Logger(WhatsAppChannelProvider.name);

  private readonly providerConfiguration: AppConfiguration['whatsappProvider'];

  constructor(
    private readonly prisma: PrismaService,
    private readonly legacyWebhook: WhatsAppWebhookService,
    configService: ConfigService,
  ) {
    this.providerConfiguration = configService.getOrThrow<AppConfiguration>('app').whatsappProvider;
  }

  onModuleInit(): void {
    if (!this.providerConfiguration.enabled) {
      this.logger.warn(
        `WhatsApp provider disabled; missing configuration: ${this.providerConfiguration.missing.join(', ')}`,
      );
    }
  }

  configuration(): CommunicationProviderConfiguration {
    return {
      enabled: this.providerConfiguration.enabled,
      graphVersion: this.providerConfiguration.graphVersion,
      missing: this.providerConfiguration.missing,
    };
  }

  verifyWebhook(
    mode: string | undefined,
    verifyToken: string | undefined,
    challenge: string | undefined,
  ): Promise<string> {
    return this.legacyWebhook.verify(mode, verifyToken, challenge);
  }

  receiveWebhook(input: CommunicationWebhookInput): Promise<CommunicationWebhookResult> {
    return this.legacyWebhook.receive(input);
  }

  async sendMessage(_input: CommunicationMessageInput): Promise<CommunicationOperationResult> {
    return {
      accepted: false,
      externalRequestMade: false,
      reason: this.providerConfiguration.enabled ? 'FOUNDATION_ONLY' : 'PROVIDER_DISABLED',
    };
  }

  async queryMessageStatus(
    _input: CommunicationMessageInput,
  ): Promise<CommunicationOperationResult> {
    return {
      accepted: false,
      externalRequestMade: false,
      reason: this.providerConfiguration.enabled ? 'FOUNDATION_ONLY' : 'PROVIDER_DISABLED',
    };
  }

  async health(organizationId: string): Promise<ChannelHealth> {
    const connection = await this.prisma.whatsAppConnection.findFirst({
      where: { organizationId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
      select: {
        status: true,
        businessPhoneNumber: true,
        graphApiVersion: true,
        lastHealthcheckAt: true,
        lastHealthcheckError: true,
        lastWebhookReceivedAt: true,
      },
    });
    const [lastInbound, lastOutbound] = await Promise.all([
      this.prisma.whatsAppMessage.findFirst({
        where: { organizationId, direction: WhatsAppMessageDirection.INBOUND, deletedAt: null },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: { createdAt: true },
      }),
      this.prisma.whatsAppMessage.findFirst({
        where: { organizationId, direction: WhatsAppMessageDirection.OUTBOUND, deletedAt: null },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: { createdAt: true },
      }),
    ]);

    return {
      channel: this.channel,
      provider: 'META_CLOUD_API',
      status: this.mapStatus(connection?.status),
      configured: this.providerConfiguration.enabled || connection !== null,
      graphVersion: connection?.graphApiVersion ?? this.providerConfiguration.graphVersion,
      webhookPath: '/api/v1/integrations/communication/whatsapp/webhook',
      phoneNumber: connection?.businessPhoneNumber ?? null,
      lastSynchronizedAt: connection?.lastHealthcheckAt ?? null,
      lastMessageReceivedAt: lastInbound?.createdAt ?? null,
      lastMessageSentAt: lastOutbound?.createdAt ?? null,
      lastError: connection?.lastHealthcheckError ?? null,
      missingConfiguration: this.providerConfiguration.missing,
    };
  }

  private mapStatus(status: WhatsAppConnectionStatus | undefined): ChannelHealth['status'] {
    if (!this.providerConfiguration.enabled && !status) return 'PENDING_CONFIGURATION';
    if (!status) return 'PENDING_CONFIGURATION';
    if (status === WhatsAppConnectionStatus.CONNECTED) return 'CONNECTED';
    if (status === WhatsAppConnectionStatus.ERROR) return 'AUTHENTICATION_ERROR';
    return 'DISCONNECTED';
  }
}
