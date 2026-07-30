import { CommunicationSyncStatus } from '@prisma/client';

import { ConversationImportService } from '../src/modules/communication/services/conversation-import.service';
import { CommunicationMetricsService } from '../src/modules/communication/services/communication-metrics.service';
import { WhatsAppReadOnlyProvider } from '../src/modules/communication/providers/whatsapp-readonly/whatsapp-readonly.provider';
import { WhatsAppService } from '../src/modules/whatsapp/whatsapp.service';

describe('WhatsApp Read Only connector', () => {
  it('no expone métodos de escritura en el provider', () => {
    const provider = new WhatsAppReadOnlyProvider({} as never, new CommunicationMetricsService());

    expect(provider).not.toHaveProperty('sendMessage');
    expect(provider).not.toHaveProperty('updateMessage');
    expect(provider).not.toHaveProperty('archiveConversation');
    expect(provider.channel).toBe('WHATSAPP_READ_ONLY');
  });

  it('lee únicamente mensajes entrantes del read model local', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        id: 'message-1',
        organizationId: 'org-1',
        conversationId: 'conversation-1',
        contactId: 'contact-1',
        externalMessageId: 'wamid-1',
        direction: 'INBOUND',
        type: 'TEXT',
        status: 'DELIVERED',
        text: 'Hola',
        createdAt: new Date('2026-07-30T10:00:00.000Z'),
        conversation: {
          status: 'OPEN',
          lastMessageAt: new Date('2026-07-30T10:00:00.000Z'),
          externalContactPhone: '+56912345678',
          externalContactPhoneNormalized: '+56912345678',
        },
        contact: {
          firstName: 'Juan',
          lastName: 'Pérez',
          phone: '+56912345678',
          phoneNormalized: '+56912345678',
          country: 'CL',
        },
      },
    ]);
    const metrics = new CommunicationMetricsService();
    const provider = new WhatsAppReadOnlyProvider(
      { whatsAppMessage: { findMany } } as never,
      metrics,
    );

    const changes = await provider.readMessagesAfter('org-1', { at: null, id: null });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ direction: 'INBOUND' }) }),
    );
    expect(changes[0]).toMatchObject({
      externalMessageId: 'wamid-1',
      contactName: 'Juan Pérez',
      country: 'CL',
    });
  });

  it('sincroniza incrementalmente con checkpoint y no realiza llamadas externas', async () => {
    const checkpoint = {
      id: 'checkpoint-1',
      status: CommunicationSyncStatus.IDLE,
      cursorAt: null,
      cursorId: null,
      lastSynchronizedAt: null,
      lastSuccessfulAt: null,
      messagesImported: 0,
      conversationsImported: 0,
      contactsImported: 0,
      duplicatesAvoided: 0,
      errorCount: 0,
      attemptCount: 0,
      nextRetryAt: null,
      lastError: null,
    };
    const completed = { ...checkpoint, status: CommunicationSyncStatus.SUCCEEDED };
    const prisma = {
      communicationSyncCheckpoint: {
        upsert: jest.fn().mockResolvedValue(checkpoint),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockResolvedValue(completed),
        findMany: jest.fn().mockResolvedValue([]),
      },
      contact: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    const provider = {
      readMessagesAfter: jest
        .fn()
        .mockResolvedValueOnce([
          {
            id: 'message-1',
            conversationId: 'conversation-1',
            contactId: 'contact-1',
            createdAt: new Date('2026-07-30T10:00:00.000Z'),
          },
        ])
        .mockResolvedValueOnce([]),
    };
    const processor = { processAvailable: jest.fn().mockResolvedValue(undefined) };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const outbox = { enqueue: jest.fn().mockResolvedValue({ id: 'outbox-1' }) };
    const service = new ConversationImportService(
      prisma as never,
      provider as never,
      processor as never,
      audit as never,
      outbox as never,
      new CommunicationMetricsService(),
    );

    const result = await service.synchronize({
      userId: 'user-1',
      organizationId: 'org-1',
      sessionId: 'session-1',
      roleId: 'role-1',
      roleName: 'Owner',
      permissions: ['whatsapp.manage'],
    });

    expect(processor.processAvailable).toHaveBeenCalledTimes(1);
    expect(provider.readMessagesAfter).toHaveBeenCalledTimes(1);
    expect(prisma.communicationSyncCheckpoint.update).toHaveBeenCalled();
    expect(outbox.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'WhatsAppReadOnlySyncCompleted' }),
    );
    expect(result).toMatchObject({
      status: 'SUCCEEDED',
      readOnly: true,
      externalWriteEnabled: false,
    });
  });

  it('bloquea el antiguo servicio de envío antes de tocar base de datos o red', async () => {
    const graphApi = { sendMessage: jest.fn() };
    const service = new WhatsAppService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      graphApi as never,
      { getOrThrow: () => ({ whatsappGraphApiVersion: 'v23.0' }) } as never,
    );

    await expect(
      service.sendMessage('conversation-1', { type: 'TEXT', text: 'No debe salir' } as never, {
        user: {
          userId: 'user-1',
          organizationId: 'org-1',
          sessionId: 'session-1',
          roleId: 'role-1',
          roleName: 'Owner',
          permissions: ['whatsapp.send'],
        },
        metadata: { requestId: 'request-1' },
      }),
    ).rejects.toMatchObject({
      status: 405,
      response: expect.objectContaining({ code: 'WHATSAPP_READ_ONLY' }),
    });
    expect(graphApi.sendMessage).not.toHaveBeenCalled();
  });
});
