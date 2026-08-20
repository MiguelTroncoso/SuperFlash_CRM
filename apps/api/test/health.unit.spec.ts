import { HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import { HealthController } from '../src/modules/health/health.controller';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';

describe('HealthController', () => {
  let controller: HealthController;
  let prisma: Partial<PrismaService>;

  beforeEach(() => {
    prisma = {
      $queryRaw: jest.fn().mockResolvedValue([{ 1: 1 }]),
    };
    controller = new HealthController(prisma as PrismaService);
  });

  it('returns HTTP 200 with status ok when database is responsive', async () => {
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const response = { status } as unknown as Response;

    await controller.check(response);

    expect(prisma.$queryRaw).toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(HttpStatus.OK);
    expect(json).toHaveBeenCalledWith({ status: 'ok' });
  });

  it('returns HTTP 503 with status error when database fails', async () => {
    (prisma.$queryRaw as jest.Mock).mockRejectedValueOnce(new Error('DB unreachable'));
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const response = { status } as unknown as Response;

    await controller.check(response);

    expect(status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
    expect(json).toHaveBeenCalledWith({ status: 'error' });
  });
});
