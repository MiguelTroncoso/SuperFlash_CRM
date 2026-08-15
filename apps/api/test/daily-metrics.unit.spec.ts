import { parseDailyMetricsCsv } from '../src/modules/dashboard/daily-metrics.parser';
import {
  followUpDaysForState,
  operationalStateKey,
  operationalStateLabel,
  suggestedFollowUpAt,
} from '../src/modules/opportunities/operational-states';

describe('Sprint 35 operating metrics', () => {
  it('parses Spanish CSV headers and keeps money normalized', () => {
    const result = parseDailyMetricsCsv(
      'fecha,campaña,pais,conversaciones,demos,ventas,gasto,facturación,moneda\n2026-08-15,Meta CL,CL,12,4,1,"35,50","120,00",USD',
    );
    expect(result.errors).toEqual([]);
    expect(result.rows).toEqual([
      expect.objectContaining({
        metricDate: '2026-08-15',
        campaignName: 'Meta CL',
        country: 'CL',
        conversations: 12,
        demos: 4,
        salesCount: 1,
        adSpend: '35.50',
        grossRevenue: '120.00',
      }),
    ]);
  });

  it('rejects incomplete CSV rows without throwing away the preview', () => {
    const result = parseDailyMetricsCsv(
      'fecha,pais,conversaciones,demos,gasto\n2026-08-15,CL,not-a-number,1,10',
    );
    expect(result.rows).toHaveLength(0);
    expect(result.errors[0]?.row).toBe(2);
  });

  it('supports one visible state per operational rule', () => {
    expect(operationalStateKey('MENSAJE_ENVIADO')).toBe('MESSAGE_SENT');
    expect(operationalStateLabel('NUEVO')).toBe('Nuevo');
    expect(followUpDaysForState('MESSAGE_SENT')).toBe(2);
    expect(followUpDaysForState('LOST')).toBeNull();
    expect(
      suggestedFollowUpAt('MESSAGE_SENT', 'America/Santiago', new Date('2026-08-15T15:00:00Z')),
    ).not.toBeNull();
  });
});
