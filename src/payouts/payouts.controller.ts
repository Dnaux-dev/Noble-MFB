
import {
  Controller,
  Headers,
  Param,
  Post,
} from '@nestjs/common';

import { PayoutsService } from './payouts.service';

@Controller('memberships')
export class PayoutsController {
  constructor(
    private readonly payoutsService: PayoutsService,
  ) {}

  @Post(':id/payout')
  createPayout(
    @Param('id') membershipId: string,
    @Headers('idempotency-key') idempotencyKey: string,
  ) {
    return this.payoutsService.createPayout(
      membershipId,
      idempotencyKey,
    );
  }
}
