import { validateSync } from 'class-validator';

import { ApplicationEventBus } from '../src/infrastructure/events/application-event-bus';
import { CreateAutomationDto } from '../src/modules/automation/dto/create-automation.dto';
import { AutomationActionDto } from '../src/modules/automation/dto/automation-action.dto';
import { CreateTemplateDto } from '../src/modules/automation/dto/create-template.dto';
import {
  AUTOMATION_TRIGGER_EVENTS,
  INTERNAL_OUTBOX_EVENT_NAMES,
} from '../src/modules/automation/automation.types';
import { TemplateRendererService } from '../src/modules/automation/templates/template-renderer.service';

describe('communications and automation primitives', () => {
  const renderer = new TemplateRendererService();

  it('extracts unique template variables in stable order', () => {
    expect(renderer.extractVariables('{{sale.total}} {{contact.name}} {{sale.total}}')).toEqual([
      'contact.name',
      'sale.total',
    ]);
  });

  it('renders nested values without evaluating arbitrary paths', () => {
    const result = renderer.render('Hola {{contact.name}} — {{sale.total}} {{missing.value}}', {
      contact: { name: 'Ana' },
      sale: { total: '99.00' },
    });
    expect(result.value).toBe('Hola Ana — 99.00 ');
    expect(result.missingVariables).toEqual(['missing.value']);
  });

  it('renders dates and interpolates action configuration recursively', () => {
    const result = renderer.interpolate(
      {
        title: 'Pago {{payment.id}}',
        payload: { nextBilling: '{{subscription.nextBilling}}' },
      },
      { payment: { id: 'payment-1' }, subscription: { nextBilling: '2026-08-30' } },
    );
    expect(result).toEqual({ title: 'Pago payment-1', payload: { nextBilling: '2026-08-30' } });
    expect(
      renderer.render('{{trial.endsAt}}', {
        trial: { endsAt: new Date('2026-08-30T00:00:00.000Z') },
      }).value,
    ).toBe('2026-08-30T00:00:00.000Z');
  });

  it('maps every initial trigger to a durable event name', () => {
    expect(Object.keys(AUTOMATION_TRIGGER_EVENTS)).toHaveLength(9);
    expect(AUTOMATION_TRIGGER_EVENTS.ContactCreated).toBe('CONTACT_CREATED');
    expect(AUTOMATION_TRIGGER_EVENTS.ActivationCreated).toBe('ACTIVATION_CREATED');
  });

  it('allows only known internal commercial events in the outbox contract', () => {
    expect(INTERNAL_OUTBOX_EVENT_NAMES).toContain('PaymentConfirmed');
    expect(INTERNAL_OUTBOX_EVENT_NAMES).toContain('ActivationCreated');
    expect(INTERNAL_OUTBOX_EVENT_NAMES).not.toContain('ExternalWebhook');
  });

  it('publishes async listeners in order and awaits them', async () => {
    const bus = new ApplicationEventBus();
    const received: string[] = [];
    bus.on('ContactCreated', async () => {
      await Promise.resolve();
      received.push('first');
    });
    bus.on('ContactCreated', () => received.push('second'));
    await bus.publishAsync('ContactCreated', {
      eventId: 'event-1',
      occurredAt: new Date(),
      organizationId: 'org-1',
      aggregateType: 'Contact',
      aggregateId: 'contact-1',
      actorUserId: 'user-1',
      requestId: 'request-1',
      payload: {},
    });
    expect(received).toEqual(['first', 'second']);
  });

  it('rejects a template with invalid slug', () => {
    const dto = Object.assign(new CreateTemplateDto(), {
      name: 'Aviso',
      slug: 'Aviso con espacios',
      channel: 'INTERNAL',
      body: 'Hola',
    });
    expect(validateSync(dto)).not.toHaveLength(0);
  });

  it('accepts a template with supported variables', () => {
    const dto = Object.assign(new CreateTemplateDto(), {
      name: 'Aviso',
      slug: 'aviso-lead',
      channel: 'INTERNAL',
      body: 'Hola {{contact.name}}',
    });
    expect(validateSync(dto)).toHaveLength(0);
  });

  it('rejects actions without a positive order', () => {
    const dto = Object.assign(new AutomationActionDto(), {
      actionOrder: 0,
      type: 'ADD_ACTIVITY',
      config: {},
    });
    expect(validateSync(dto)).not.toHaveLength(0);
  });

  it('rejects automation definitions without actions', () => {
    const dto = Object.assign(new CreateAutomationDto(), {
      name: 'Sin acciones',
      trigger: 'CONTACT_CREATED',
      actions: [],
    });
    expect(validateSync(dto)).toHaveLength(0);
  });
});
