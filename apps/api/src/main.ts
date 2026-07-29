import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';

import { configureApplication } from './app-setup';
import { AppModule } from './app.module';
import { AppConfiguration } from './config/configuration';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  const configService = app.get(ConfigService);
  const configuration = configService.getOrThrow<AppConfiguration>('app');

  app.enableShutdownHooks();
  configureApplication(app, configuration);
  await app.listen(configuration.apiPort);
}

void bootstrap();
