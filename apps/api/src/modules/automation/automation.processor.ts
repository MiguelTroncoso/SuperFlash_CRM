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
  private shuttingDown = false;
  private activeProcess: Promise<void> | undefined;
  private activeSchedule: Promise<void> | undefined;
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
    void this.process();
    void this.schedule();
    this.executionInterval = setInterval(() => void this.process(), 1_000);
    this.scheduleInterval = setInterval(() => void this.schedule(), 60_000);
    this.executionInterval.unref();
    this.scheduleInterval.unref();
  }

  async onModuleDestroy(): Promise<void> {
    this.shuttingDown = true;
    if (this.executionInterval) clearInterval(this.executionInterval);
    if (this.scheduleInterval) clearInterval(this.scheduleInterval);
    for (const [eventName, handler] of this.handlers) this.events.off(eventName, handler);
    this.handlers.clear();
    await Promise.all([this.activeProcess, this.activeSchedule]);
  }

  private async handleEvent(eventName: CommercialEventName, event: CommercialEvent): Promise<void> {
    await this.service.enqueueFromEvent(eventName, event);
  }

  private async process(): Promise<void> {
    if (this.processing || this.shuttingDown) return;
    this.processing = true;
    const run = this.processAvailable();
    this.activeProcess = run;
    try {
      await run;
    } catch (error: unknown) {
      this.logger.error(error instanceof Error ? error.message : 'Automation processor failed');
    } finally {
      if (this.activeProcess === run) this.activeProcess = undefined;
      this.processing = false;
    }
  }

  private async schedule(): Promise<void> {
    if (this.shuttingDown) return;
    const run = this.enqueueScheduledTriggers();
    this.activeSchedule = run;
    try {
      await run;
    } catch (error: unknown) {
      this.logger.error(error instanceof Error ? error.message : 'Automation scheduler failed');
    } finally {
      if (this.activeSchedule === run) this.activeSchedule = undefined;
    }
  }

  private async processAvailable(): Promise<void> {
    await this.service.processAvailable();
  }

  private async enqueueScheduledTriggers(): Promise<void> {
    await this.service.enqueueScheduledTriggers();
  }
}
