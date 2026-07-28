import { buildHistoricalTrendForecast } from '../src/modules/revenue-intelligence/forecast';

describe('Revenue Intelligence calculations', () => {
  it('projects a positive historical trend without negative revenue', () => {
    const forecast = buildHistoricalTrendForecast(
      [
        { month: '2026-01', amount: '100.00' },
        { month: '2026-02', amount: '120.00' },
        { month: '2026-03', amount: '140.00' },
      ],
      2,
    );
    expect(forecast).toEqual([
      { month: '2026-04', amount: '160.00' },
      { month: '2026-05', amount: '180.00' },
    ]);
  });

  it('uses a flat forecast when history has one point', () => {
    expect(buildHistoricalTrendForecast([{ month: '2026-03', amount: '50.00' }], 2)).toEqual([
      { month: '2026-04', amount: '50.00' },
      { month: '2026-05', amount: '50.00' },
    ]);
  });

  it('clamps a declining forecast at zero', () => {
    expect(
      buildHistoricalTrendForecast(
        [
          { month: '2026-01', amount: '20.00' },
          { month: '2026-02', amount: '0.00' },
        ],
        2,
      ),
    ).toEqual([
      { month: '2026-03', amount: '0.00' },
      { month: '2026-04', amount: '0.00' },
    ]);
  });
});
