import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';

import {
  ApplicationEventBus,
  CommercialEvent,
} from '../../../infrastructure/events/application-event-bus';
import { CommunicationMetricsService } from './communication-metrics.service';

@Injectable()
export class CommunicationEventTranslator implements OnModuleInit, OnModuleDestroy {
  private readonly subscriptions: Array<{
    eventName: string;
    handler: (event: CommercialEvent) => void;
  }> = [];

  constructor(
    private readonly events: ApplicationEventBus,
    private readonly metrics: CommunicationMetricsService,
  ) {}

  onModuleInit(): void {
    this.listen('WhatsAppMessageSent', (event) => this.publish('MessageSent', event));
    this.listen('WhatsAppMessageFailed', (event) => {
      this.metrics.increment('message_failures');
      this.publish('MessageFailed', event);
    });
    this.listen('WhatsAppMessageStatusUpdated', (event) => {
      const status = String(event.payload.status ?? '').toUpperCase();
      if (status === 'DELIVERED') this.publish('MessageDelivered', event);
      if (status === 'READ') this.publish('MessageRead', event);
    });
    this.listen('MessageReceived', () => this.metrics.increment('messages_received'));
    this.listen('MessageSent', () => this.metrics.increment('messages_sent'));
    this.listen('MessageDelivered', () => this.metrics.increment('messages_delivered'));
    this.listen('MessageRead', () => this.metrics.increment('messages_read'));
    this.listen('ConversationCreated', () => this.metrics.increment('events_received'));
    this.listen('ConversationUpdated', () => this.metrics.increment('events_received'));
  }

  onModuleDestroy(): void {
    for (const subscription of this.subscriptions) {
      this.events.removeListener(subscription.eventName, subscription.handler);
    }
    this.subscriptions.length = 0;
  }

  private listen(eventName: string, handler: (event: CommercialEvent) => void): void {
    this.subscriptions.push({ eventName, handler });
    this.events.on(eventName, handler);
  }

  private publish(
    eventName: Parameters<ApplicationEventBus['publish']>[0],
    event: CommercialEvent,
  ): void {
    this.events.publish(eventName, event);
  }
}
