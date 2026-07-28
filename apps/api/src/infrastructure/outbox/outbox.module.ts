import { Global, Module } from '@nestjs/common';

import { OutboxProcessor } from './outbox.processor';
import { OutboxService } from './outbox.service';

@Global()
@Module({
  providers: [OutboxService, OutboxProcessor],
  exports: [OutboxService, OutboxProcessor],
})
export class OutboxModule {}
