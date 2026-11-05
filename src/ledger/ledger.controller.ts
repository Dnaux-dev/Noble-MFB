
import { Controller, Get } from '@nestjs/common';
import { LedgerService } from './ledger.service';

@Controller('ledger')
export class LedgerController {
  constructor(
    private readonly ledgerService: LedgerService,
  ) {}

  @Get('trial-balance')
  getTrialBalance() {
    return this.ledgerService.getTrialBalance();
  }
}
