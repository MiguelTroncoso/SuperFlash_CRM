export type SubscriptionDurationDays = 30 | 90 | 180 | 365;

function addCalendarMonths(start: Date, months: number): Date {
  const result = new Date(start);
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
  ).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

export function addSubscriptionDuration(start: Date, durationDays: number): Date {
  if (durationDays === 30) return addCalendarMonths(start, 1);
  if (durationDays === 90) return addCalendarMonths(start, 3);
  if (durationDays === 180) return addCalendarMonths(start, 6);
  if (durationDays === 365) return addCalendarMonths(start, 12);
  throw new RangeError('Unsupported subscription duration.');
}

export function addSubscriptionBillingCycle(
  start: Date,
  cycle: string,
  customIntervalDays?: number | null,
): Date | null {
  if (cycle === 'TRIAL') return addDays(start, 14);
  if (cycle === 'WEEKLY') return addDays(start, 7);
  if (cycle === 'MONTHLY') return addCalendarMonths(start, 1);
  if (cycle === 'QUARTERLY') return addCalendarMonths(start, 3);
  if (cycle === 'SEMI_ANNUAL') return addCalendarMonths(start, 6);
  if (cycle === 'ANNUAL') return addCalendarMonths(start, 12);
  if (customIntervalDays && customIntervalDays > 0) return addDays(start, customIntervalDays);
  return null;
}

function addDays(start: Date, days: number): Date {
  const result = new Date(start);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}
