import { RevenueForecastPoint } from './revenue-intelligence.types';

export function buildHistoricalTrendForecast(
  history: RevenueForecastPoint[],
  horizonMonths: number,
): RevenueForecastPoint[] {
  if (history.length === 0 || horizonMonths <= 0) return [];
  const values = history.map((point) => Number(point.amount));
  const lastValue = values[values.length - 1] ?? 0;
  const firstValue = values[0] ?? lastValue;
  const slope = values.length > 1 ? (lastValue - firstValue) / (values.length - 1) : 0;
  const lastMonth = history[history.length - 1]?.month ?? new Date().toISOString().slice(0, 7);
  const [yearText, monthText] = lastMonth.split('-');
  const baseDate = new Date(Date.UTC(Number(yearText), Number(monthText) - 1, 1));

  return Array.from({ length: horizonMonths }, (_, index) => {
    const date = new Date(
      Date.UTC(baseDate.getUTCFullYear(), baseDate.getUTCMonth() + index + 1, 1),
    );
    const amount = Math.max(0, lastValue + slope * (index + 1));
    return { month: date.toISOString().slice(0, 7), amount: amount.toFixed(2) };
  });
}
