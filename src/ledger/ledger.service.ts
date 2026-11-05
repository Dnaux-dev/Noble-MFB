
import { Injectable, Inject } from '@nestjs/common';
import { Pool } from 'pg';

@Injectable()
export class LedgerService {
  constructor(
    @Inject('PG_POOL') private readonly pool: Pool,
  ) {}

  async getTrialBalance() {
    const result = await this.pool.query(`
      SELECT
        a.id AS account_id,
        a.type AS account_type,
        a.membership_id,
        COALESCE(SUM(e.amount_kobo), 0)::text AS balance_kobo
      FROM ledger_accounts a
      LEFT JOIN journal_entries e
        ON e.account_id = a.id
      GROUP BY a.id, a.type, a.membership_id
      ORDER BY a.type, a.membership_id NULLS FIRST
    `);

    const accounts = result.rows.map((row) => {
      const balance = Number(row.balance_kobo);

      if (!Number.isSafeInteger(balance)) {
        throw new Error(
          `Account ${row.account_id} balance exceeds JavaScript's safe integer range`,
        );
      }

      return {
        account_id: row.account_id,
        account_type: row.account_type,
        membership_id: row.membership_id,
        balance_kobo: balance,
      };
    });

    const totalDebits = accounts
      .filter((account) => account.balance_kobo > 0)
      .reduce((sum, account) => sum + account.balance_kobo, 0);

    const totalCredits = accounts
      .filter((account) => account.balance_kobo < 0)
      .reduce((sum, account) => sum + Math.abs(account.balance_kobo), 0);

    return {
      accounts,
      total_debits_kobo: totalDebits,
      total_credits_kobo: totalCredits,
      difference_kobo: totalDebits - totalCredits,
      is_balanced: totalDebits === totalCredits,
    };
  }
}
