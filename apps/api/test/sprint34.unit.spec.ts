import {
  followUpDaysForState,
  operationalStateLabel,
  stateRequiresManualFollowUp,
  suggestedFollowUpAt,
} from '../src/modules/opportunities/operational-states';

describe('Sprint 34 commercial states', () => {
  const now = new Date('2026-08-13T15:00:00.000Z');

  it('suggests Demo enviada for the next day at 10:00 in the configured timezone', () => {
    expect(followUpDaysForState('DEMO_SENT')).toBe(1);
    expect(suggestedFollowUpAt('DEMO_SENT', 'America/Santiago', now)).toEqual(
      new Date('2026-08-14T14:00:00.000Z'),
    );
  });

  it('suggests No responde three days ahead', () => {
    expect(followUpDaysForState('NO_RESPONSE')).toBe(3);
    expect(suggestedFollowUpAt('NO_RESPONSE', 'America/Santiago', now)).toEqual(
      new Date('2026-08-16T14:00:00.000Z'),
    );
  });

  it('requires manual dates for deferred and purchase-intent states', () => {
    expect(stateRequiresManualFollowUp('TALK_LATER')).toBe(true);
    expect(stateRequiresManualFollowUp('WANTS_TO_BUY')).toBe(true);
    expect(suggestedFollowUpAt('TALK_LATER', 'America/Santiago', now)).toBeNull();
  });

  it('does not schedule commercial follow-up after purchase', () => {
    expect(stateRequiresManualFollowUp('PURCHASED')).toBe(false);
    expect(suggestedFollowUpAt('PURCHASED', 'America/Santiago', now)).toBeNull();
    expect(operationalStateLabel('PURCHASED')).toBe('Compró');
  });

  it('keeps legacy state labels compatible without exposing extra visible states', () => {
    expect(operationalStateLabel('WAITING_CUSTOMER')).toBe('No responde');
    expect(followUpDaysForState('WAITING_CUSTOMER')).toBe(4);
  });
});
