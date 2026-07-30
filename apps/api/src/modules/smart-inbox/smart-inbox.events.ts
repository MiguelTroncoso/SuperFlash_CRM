import { Injectable, MessageEvent } from '@nestjs/common';
import { interval, merge, Observable, Subject } from 'rxjs';
import { filter, map } from 'rxjs/operators';

export interface SmartInboxEvent {
  type: string;
  organizationId: string;
  conversationId?: string;
  requestId?: string;
  occurredAt: string;
  payload?: Record<string, unknown>;
}

@Injectable()
export class SmartInboxEventsService {
  private readonly channels = new Map<string, Subject<SmartInboxEvent>>();

  publish(event: SmartInboxEvent): void {
    this.channel(event.organizationId).next(event);
  }

  stream(organizationId: string): Observable<MessageEvent> {
    const updates = this.channel(organizationId)
      .asObservable()
      .pipe(map((event) => ({ data: event })));
    const heartbeat = interval(25_000).pipe(
      map(() => ({ data: { type: 'heartbeat', occurredAt: new Date().toISOString() } })),
    );
    return merge(updates, heartbeat).pipe(filter(Boolean));
  }

  private channel(organizationId: string): Subject<SmartInboxEvent> {
    const current = this.channels.get(organizationId);
    if (current) return current;
    const subject = new Subject<SmartInboxEvent>();
    this.channels.set(organizationId, subject);
    return subject;
  }
}
