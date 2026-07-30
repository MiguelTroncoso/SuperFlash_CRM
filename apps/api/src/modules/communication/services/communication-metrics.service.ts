import { Injectable } from '@nestjs/common';

export type CommunicationMetricName =
  | 'events_received'
  | 'events_failed'
  | 'webhook_verifications'
  | 'webhook_verification_failures'
  | 'messages_received'
  | 'messages_sent'
  | 'messages_delivered'
  | 'messages_read'
  | 'message_failures'
  | 'authentication_errors';

export interface CommunicationMetricsSnapshot {
  counters: Readonly<Record<CommunicationMetricName, number>>;
  activeSseClients: number;
  updatedAt: string;
}

const METRIC_NAMES: readonly CommunicationMetricName[] = [
  'events_received',
  'events_failed',
  'webhook_verifications',
  'webhook_verification_failures',
  'messages_received',
  'messages_sent',
  'messages_delivered',
  'messages_read',
  'message_failures',
  'authentication_errors',
];

@Injectable()
export class CommunicationMetricsService {
  private readonly counters = new Map<CommunicationMetricName, number>(
    METRIC_NAMES.map((name) => [name, 0]),
  );

  private activeSseClients = 0;

  private updatedAt = new Date();

  increment(name: CommunicationMetricName): void {
    this.counters.set(name, (this.counters.get(name) ?? 0) + 1);
    this.updatedAt = new Date();
  }

  registerSseClient(): () => void {
    this.activeSseClients += 1;
    this.updatedAt = new Date();
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.activeSseClients = Math.max(0, this.activeSseClients - 1);
      this.updatedAt = new Date();
    };
  }

  snapshot(): CommunicationMetricsSnapshot {
    const counters = Object.fromEntries(
      METRIC_NAMES.map((name) => [name, this.counters.get(name) ?? 0]),
    ) as Record<CommunicationMetricName, number>;
    return {
      counters,
      activeSseClients: this.activeSseClients,
      updatedAt: this.updatedAt.toISOString(),
    };
  }

  prometheus(): string {
    const snapshot = this.snapshot();
    const lines = METRIC_NAMES.map(
      (name) => `superflash_communication_${name} ${snapshot.counters[name]}`,
    );
    lines.push(`superflash_communication_active_sse_clients ${snapshot.activeSseClients}`);
    return `${lines.join('\n')}\n`;
  }
}
