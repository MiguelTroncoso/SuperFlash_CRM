import 'reflect-metadata';

import { validateSync } from 'class-validator';

import {
  AddInboxNoteDto,
  CreateInboxSaleDto,
  ListSmartInboxQueryDto,
  SmartInboxView,
} from '../src/modules/smart-inbox/dto/smart-inbox.dto';
import { SmartInboxEventsService } from '../src/modules/smart-inbox/smart-inbox.events';
import { SmartInboxService } from '../src/modules/smart-inbox/smart-inbox.service';

describe('Smart Inbox primitives', () => {
  it('emite eventos únicamente al canal de la organización', () => {
    const service = new SmartInboxEventsService();
    const received: string[] = [];
    const subscription = service.stream('org-a').subscribe((event) => {
      const data = event.data as { type: string };
      received.push(data.type);
    });

    service.publish({
      type: 'MessageCreated',
      organizationId: 'org-a',
      conversationId: 'conversation-a',
      requestId: 'request-a',
      occurredAt: new Date().toISOString(),
    });
    service.publish({
      type: 'MessageCreated',
      organizationId: 'org-b',
      conversationId: 'conversation-b',
      occurredAt: new Date().toISOString(),
    });

    expect(received).toEqual(['MessageCreated']);
    subscription.unsubscribe();
  });

  it('valida filtros y payloads del workspace con whitelist de DTO', () => {
    const query = Object.assign(new ListSmartInboxQueryDto(), {
      view: SmartInboxView.RENEWALS,
      limit: 100,
      unexpected: 'rejected-by-global-pipe',
    });
    const note = Object.assign(new AddInboxNoteDto(), { note: 'Llamar mañana' });
    const sale = Object.assign(new CreateInboxSaleDto(), {
      currency: 'USD',
      items: [{ productId: 'not-a-uuid', quantity: '1' }],
    });

    expect(validateSync(query)).toHaveLength(0);
    expect(validateSync(note)).toHaveLength(0);
    expect(validateSync(sale).length).toBeGreaterThan(0);
  });

  it('construye el listado con el tenant autenticado y no con un tenant del cliente', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const prisma = { whatsAppConversation: { findMany, count } };
    const service = new SmartInboxService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await service.list(new ListSmartInboxQueryDto(), {
      userId: 'user-a',
      organizationId: 'org-a',
      sessionId: 'session-a',
      roleId: 'role-a',
      roleName: 'Owner',
      permissions: ['whatsapp.read'],
    });

    expect(findMany.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ where: expect.objectContaining({ organizationId: 'org-a' }) }),
    );
  });
});
