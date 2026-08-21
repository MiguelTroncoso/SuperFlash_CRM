import { addCalendarMonths, toApiIsoDate, toDisplayDate } from '@superflash/utils';

describe('Date Utilities Unit Tests', () => {
  it('toApiIsoDate parses visual dates or ISO strings to YYYY-MM-DD', () => {
    expect(toApiIsoDate('2026-08-20')).toBe('2026-08-20');
    expect(toApiIsoDate('2026-08-20T15:30:00.000Z')).toBe('2026-08-20');
    expect(toApiIsoDate('')).toBeNull();
    expect(toApiIsoDate(undefined)).toBeNull();
  });

  it('toDisplayDate formats properly in Spanish locale', () => {
    const formatted = toDisplayDate('2026-08-20');
    expect(formatted).toMatch(/20-08-2026|20\/08\/2026/);
  });

  it('addCalendarMonths preserves day of month without 30-day drift', () => {
    const aug12 = new Date('2026-08-12T12:00:00Z');
    const sep12 = addCalendarMonths(aug12, 1);
    expect(sep12.getUTCDate()).toBe(12);
    expect(sep12.getUTCMonth()).toBe(8); // 0-indexed: 8 is Sept

    const jan31 = new Date('2026-01-31T12:00:00Z');
    const feb28 = addCalendarMonths(jan31, 1);
    expect(feb28.getUTCMonth()).toBe(1); // Feb
    expect(feb28.getUTCDate()).toBe(28); // 2026 is non-leap
  });
});
