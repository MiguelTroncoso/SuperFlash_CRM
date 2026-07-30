import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { configureApplication } from '../src/app-setup';
import { AppModule } from '../src/app.module';
import { AppConfiguration } from '../src/config/configuration';

describe('Smart Inbox HTTP boundary', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    const configuration = moduleRef.get(ConfigService).getOrThrow<AppConfiguration>('app');
    configureApplication(app, configuration);
    await app.init();
  });

  afterAll(async () => {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await app.close();
  });

  it('protege el listado y no permite leer el tenant sin JWT', async () => {
    await request(app.getHttpServer()).get('/api/v1/smart-inbox/conversations').expect(401);
  });

  it('protege también el stream SSE', async () => {
    await request(app.getHttpServer()).get('/api/v1/smart-inbox/events').expect(401);
  });
});
