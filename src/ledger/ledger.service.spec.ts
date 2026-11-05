
import { describe, expect, it, jest } from '@jest/globals';
import { Pool } from 'pg';

jest.mock('@nestjs/common', () => ({
  Injectable: () => (target: Function) => target,
  Inject: () => () => undefined,
}));

import { LedgerService } from './ledger.service';

describe('LedgerService', () => {
  const createService = (rows: any[]) => {
    const query = jest.fn(async (_sql: string) => ({ rows }));

    const pool = { query } as unknown as Pool;

    return {
      service: new LedgerService(pool),
      query,
    };
  };

  it('should calculate a balanced trial balance', async () => {
    const { service, query } = createService([
      {
        account_id: 'account-1',
        account_type: 'provider_clearing',
        membership_id: null,
        balance_kobo: '1050000',
      },
      {
        account_id: 'account-2',
        account_type: 'savings_pool',
        membership_id: 'membership-1',
        balance_kobo: '-400000',
      },
      {
        account_id: 'account-3',
        account_type: 'credit',
        membership_id: 'membership-1',
        balance_kobo: '-150000',
      },
      {
        account_id: 'account-4',
        account_type: 'customer_payout',
        membership_id: 'membership-1',
        balance_kobo: '-500000',
      },
    ]);

    const result = await service.getTrialBalance();

    expect(query).toHaveBeenCalledTimes(1);
    expect(result.total_debits_kobo).toBe(1050000);
    expect(result.total_credits_kobo).toBe(1050000);
    expect(result.difference_kobo).toBe(0);
    expect(result.is_balanced).toBe(true);
    expect(result.accounts).toHaveLength(4);
  });

  it('should identify an unbalanced trial balance', async () => {
    const { service } = createService([
      {
        account_id: 'account-1',
        account_type: 'provider_clearing',
        membership_id: null,
        balance_kobo: '100000',
      },
      {
        account_id: 'account-2',
        account_type: 'savings_pool',
        membership_id: 'membership-1',
        balance_kobo: '-80000',
      },
    ]);

    const result = await service.getTrialBalance();

    expect(result.total_debits_kobo).toBe(100000);
    expect(result.total_credits_kobo).toBe(80000);
    expect(result.difference_kobo).toBe(20000);
    expect(result.is_balanced).toBe(false);
  });

  it('should reject balances outside JavaScript safe integer range', async () => {
    const { service } = createService([
      {
        account_id: 'account-1',
        account_type: 'provider_clearing',
        membership_id: null,
        balance_kobo: '9007199254740992',
      },
    ]);

    await expect(service.getTrialBalance()).rejects.toThrow(
      "balance exceeds JavaScript's safe integer range",
    );
  });
});
