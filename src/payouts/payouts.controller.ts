import {
  Controller,
  Headers,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PayoutsService } from './payouts.service';

@Controller('memberships')
@UseGuards(JwtAuthGuard)
export class PayoutsController {
  constructor(
    private readonly payoutsService: PayoutsService,
  ) {}

  @Post(':id/payout')
  createPayout(
    @Param('id') membershipId: string,
    @Headers('idempotency-key') idempotencyKey: string,
    @Req() request: { user: { sub: string } },
  ) {
    return this.payoutsService.createPayout(
      membershipId,
      idempotencyKey,
      request.user.sub,
    );
  }
}