import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { configureApplication } from '../src/app-setup';
import { AppModule } from '../src/app.module';
import { AppConfiguration } from '../src/config/configuration';

describe('WhatsApp Web Read Only HTTP boundary', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApplication(app, moduleRef.get(ConfigService).getOrThrow<AppConfiguration>('app'));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('protects reader status with CRM authentication', async () => {
    const response = await request(app.getHttpServer()).get(
      '/api/v1/communication/channels/whatsapp-web-read-only/status',
    );
    expect(response.status).toBe(401);
  });
});
