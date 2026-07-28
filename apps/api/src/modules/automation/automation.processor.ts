import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';

import {
  ApplicationEventBus,
  CommercialEvent,
  CommercialEventName,
} from '../../infrastructure/events/application-event-bus';
import { AUTOMATION_EVENT_NAMES } from './automation.types';
import { AutomationService } from './automation.service';

@Injectable()
export class AutomationProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AutomationProcessor.name);
  private executionInterval: NodeJS.Timeout | undefined;
  private scheduleInterval: NodeJS.Timeout | undefined;
  private processing = false;
  private readonly handlers = new Map<
    CommercialEventName,
    (event: CommercialEvent) => Promise<void>
  >();

  constructor(
    private readonly events: ApplicationEventBus,
    private readonly service: AutomationService,
  ) {}

  onModuleInit(): void {
    for (const eventName of AUTOMATION_EVENT_NAMES) {
      const handler = (event: CommercialEvent): Promise<void> => this.handleEvent(eventName, event);
      this.handlers.set(eventName, handler);
      this.events.on(eventName, handler);
    }
    void this.service.processAvailable();
    void this.service.enqueueScheduledTriggers();
    this.executionInterval = setInterval(() => void this.process(), 1_000);
    this.scheduleInterval = setInterval(() => void this.schedule(), 60_000);
    this.executionInterval.unref();
    this.scheduleInterval.unref();
  }

  onModuleDestroy(): void {
    if (this.executionInterval) clearInterval(this.executionInterval);
    if (this.scheduleInterval) clearInterval(this.scheduleInterval);
    for (const [eventName, handler] of this.handlers) this.events.off(eventName, handler);
    this.handlers.clear();
  }

  private async handleEvent(eventName: CommercialEventName, event: CommercialEvent): Promise<void> {
    await this.service.enqueueFromEvent(eventName, event);
  }

  private async process(): Promise<void> {
    if (this.processing) return;
    this.processing = true;
    try {
      await this.service.processAvailable();
    } catch (error: unknown) {
      this.logger.error(error instanceof Error ? error.message : 'Automation processor failed');
    } finally {
      this.processing = false;
    }
  }

  private async schedule(): Promise<void> {
    try {
      await this.service.enqueueScheduledTriggers();
    } catch (error: unknown) {
      this.logger.error(error instanceof Error ? error.message : 'Automation scheduler failed');
    }
  }
}
