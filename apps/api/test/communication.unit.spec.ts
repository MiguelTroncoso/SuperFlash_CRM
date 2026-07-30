import { ConfigService } from '@nestjs/config';

import {
  ApplicationEventBus,
  CommercialEvent,
} from '../src/infrastructure/events/application-event-bus';
import { buildConfiguration } from '../src/config/configuration';
import { CommunicationEventTranslator } from '../src/modules/communication/services/communication-event-translator.service';
import { CommunicationMetricsService } from '../src/modules/communication/services/communication-metrics.service';

describe('Communication foundation', () => {
  it('deshabilita WhatsApp sin impedir construir la configuración del CRM', () => {
    const configuration = buildConfiguration({
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://localhost/superflash',
    });

    expect(configuration.whatsappProvider.enabled).toBe(false);
    expect(configuration.whatsappProvider.missing).toEqual(
      expect.arrayContaining([
        'WHATSAPP_PHONE_NUMBER_ID',
        'WHATSAPP_BUSINESS_ACCOUNT_ID',
        'WHATSAPP_ACCESS_TOKEN',
        'WHATSAPP_APP_SECRET',
        'WHATSAPP_VERIFY_TOKEN',
      ]),
    );
  });

  it('habilita el provider únicamente cuando están presentes todas las variables requeridas', () => {
    const configuration = buildConfiguration({
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://localhost/superflash',
      WHATSAPP_PHONE_NUMBER_ID: 'phone-1',
      WHATSAPP_BUSINESS_ACCOUNT_ID: 'business-1',
      WHATSAPP_ACCESS_TOKEN: 'token-not-logged',
      WHATSAPP_APP_SECRET: 'secret-not-logged',
      WHATSAPP_VERIFY_TOKEN: 'verify-not-logged',
      WHATSAPP_GRAPH_VERSION: 'v23.0',
    });

    expect(configuration.whatsappProvider).toMatchObject({
      enabled: true,
      graphVersion: 'v23.0',
      missing: [],
    });
    expect(JSON.stringify(configuration)).not.toContain('token-not-logged');
    expect(JSON.stringify(configuration)).not.toContain('secret-not-logged');
  });

  it('traduce eventos WhatsApp a eventos internos y expone métricas sin secretos', () => {
    const eventBus = new ApplicationEventBus();
    const metrics = new CommunicationMetricsService();
    const translator = new CommunicationEventTranslator(eventBus, metrics);
    const received: string[] = [];
    const event: CommercialEvent = {
      eventId: 'event-1',
      occurredAt: new Date(),
      organizationId: 'org-1',
      aggregateType: 'WhatsAppMessage',
      aggregateId: 'message-1',
      actorUserId: 'system',
      requestId: 'request-1',
      payload: { messageId: 'message-1' },
    };
    eventBus.on('MessageSent', () => received.push('MessageSent'));
    eventBus.on('MessageDelivered', () => received.push('MessageDelivered'));
    translator.onModuleInit();

    eventBus.publish('WhatsAppMessageSent', event);
    eventBus.publish('WhatsAppMessageStatusUpdated', {
      ...event,
      payload: { messageId: 'message-1', status: 'DELIVERED' },
    });

    expect(received).toEqual(['MessageSent', 'MessageDelivered']);
    expect(metrics.snapshot().counters.messages_sent).toBe(1);
    expect(metrics.snapshot().counters.messages_delivered).toBe(1);
    expect(metrics.prometheus()).toContain('superflash_communication_active_sse_clients 0');
    translator.onModuleDestroy();
  });

  it('libera clientes SSE de forma idempotente', () => {
    const metrics = new CommunicationMetricsService();
    const release = metrics.registerSseClient();
    expect(metrics.snapshot().activeSseClients).toBe(1);
    release();
    release();
    expect(metrics.snapshot().activeSseClients).toBe(0);
  });

  it('acepta ConfigService como fuente tipada de la configuración', () => {
    const configuration = buildConfiguration({
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://localhost/superflash',
    });
    const config = new ConfigService({ app: configuration });
    expect(config.getOrThrow<typeof configuration>('app').whatsappProvider.enabled).toBe(false);
  });
});
