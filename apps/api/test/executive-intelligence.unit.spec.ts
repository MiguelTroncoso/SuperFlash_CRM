import 'reflect-metadata';
import { validate } from 'class-validator';

import {
  GlobalSearchQueryDto,
  IntelligenceQueryDto,
  PipelineIntelligenceQueryDto,
} from '../src/modules/executive-intelligence/dto/intelligence.dto';

describe('Executive Intelligence DTOs', () => {
  it('accepts bounded date and dimension filters', async () => {
    const dto = Object.assign(new IntelligenceQueryDto(), {
      from: '2026-01-01',
      to: '2026-01-31',
      country: 'CL',
      currency: 'USD',
      limit: 50,
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejects arbitrary global search payloads', async () => {
    const dto = Object.assign(new GlobalSearchQueryDto(), { search: 'a'.repeat(121), limit: 100 });
    expect((await validate(dto)).map((error) => error.property)).toEqual(
      expect.arrayContaining(['search', 'limit']),
    );
  });

  it('validates pipeline filters and pagination bounds', async () => {
    const dto = Object.assign(new PipelineIntelligenceQueryDto(), {
      priority: 'URGENT',
      stalledDays: 14,
      page: 1,
      limit: 100,
    });
    expect(await validate(dto)).toHaveLength(0);
    const invalid = Object.assign(new PipelineIntelligenceQueryDto(), { page: 0, limit: 101 });
    expect(await validate(invalid)).toHaveLength(2);
  });
});
