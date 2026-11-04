
import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { MembershipsModule } from './memberships/memberships.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { PayoutsModule } from './payouts/payouts.module';

@Module({
  imports: [DatabaseModule, HealthModule, MembershipsModule, WebhooksModule, PayoutsModule],
})
export class AppModule {}
