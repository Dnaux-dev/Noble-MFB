
import {
  ConflictException,
  Injectable,
  NotFoundException,
  Inject,
} from '@nestjs/common';

import { Pool } from 'pg';
import { CreateInflowDto } from './dto/create-inflow.dto';
import { dueDates, Plan } from '../domain/schedule';

@Injectable()
export class WebhooksService {
  constructor(
    @Inject('PG_POOL')
    private readonly pool: Pool,
  ) {}

  async createInflow(dto: CreateInflowDto) {
    const client = await this.pool.connect();
    let transactionFinished = false;

    try {
      await client.query('BEGIN');

      // 1. Serialize requests with the same provider reference.
      await client.query(
        `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`,
        [dto.provider_ref],
      );

      // 2. Check for an existing provider reference.
      const existingResult = await client.query(
        `SELECT *
         FROM inflows
         WHERE provider_ref = $1`,
        [dto.provider_ref],
      );

      if (existingResult.rowCount && existingResult.rowCount > 0) {
        const existing = existingResult.rows[0];

        const samePayload =
          existing.membership_id === dto.membership_id &&
          Number(existing.amount_kobo) === dto.amount_kobo;

        if (samePayload) {
          await client.query('COMMIT');
          transactionFinished = true;

          return {
            message: 'Inflow already processed',
            inflow: existing,
          };
        }

        await client.query(
          `INSERT INTO data_conflicts (
            provider_ref,
            existing_inflow_id,
            payload
          )
          VALUES ($1, $2, $3::jsonb)`,
          [
            dto.provider_ref,
            existing.id,
            JSON.stringify(dto),
          ],
        );

        await client.query('COMMIT');
        transactionFinished = true;

        throw new ConflictException(
          'Provider reference already exists with a different payload',
        );
      }

      // 3. Find and lock the membership.
      const membershipResult = await client.query(
        `SELECT *
         FROM memberships
         WHERE id = $1
         FOR UPDATE`,
        [dto.membership_id],
      );

      if (membershipResult.rowCount === 0) {
        throw new NotFoundException('Membership not found');
      }

      const membership = membershipResult.rows[0];

      // 4. Calculate the total amount expected in this cycle.
      const plan: Plan = {
        frequency: membership.frequency,
        cycle: membership.cycle,
        weekday: membership.weekday ?? undefined,
        monthDay: membership.month_day ?? undefined,
        monthLastDay: membership.month_last_day,
      };

      const scheduledDates = dueDates(
        plan,
        membership.cycle_start,
        membership.cycle_end,
      );

      const contributionKobo = Number(membership.contribution_kobo);

      const totalExpectedKobo =
        scheduledDates.length * contributionKobo;

      // 5. Check whether this membership has already been paid out.
      const payoutResult = await client.query(
        `SELECT id
         FROM payouts
         WHERE membership_id = $1`,
        [membership.id],
      );

      const alreadyPaidOut =
        payoutResult.rowCount !== null && payoutResult.rowCount > 0;

      // 6. Get the amount already received through previously posted inflows.
      const previousInflowsResult = await client.query(
        `SELECT COALESCE(SUM(amount_kobo), 0)::text AS total
         FROM inflows
         WHERE membership_id = $1
           AND outcome = 'posted'`,
        [membership.id],
      );

      const previousPaidKobo = Number(
        previousInflowsResult.rows[0].total,
      );

      if (
        !Number.isSafeInteger(previousPaidKobo) ||
        !Number.isSafeInteger(totalExpectedKobo)
      ) {
        throw new Error('Payment totals exceed safe integer limits');
      }

      // 7. Split this payment between savings and credit.
      let savingsKobo = 0;

      if (!alreadyPaidOut) {
        const remainingExpectedKobo = Math.max(
          0,
          totalExpectedKobo - previousPaidKobo,
        );

        savingsKobo = Math.min(
          dto.amount_kobo,
          remainingExpectedKobo,
        );
      }

      const creditKobo = dto.amount_kobo - savingsKobo;

      const outcome =
        savingsKobo > 0 ? 'posted' : 'held_as_credit';

      // 8. Find the required ledger accounts.
      const accountsResult = await client.query(
        `SELECT id, type
         FROM ledger_accounts
         WHERE membership_id = $1
            OR (
              type = 'provider_clearing'
              AND membership_id IS NULL
            )`,
        [membership.id],
      );

      const accounts = new Map<string, string>();

      for (const account of accountsResult.rows) {
        accounts.set(account.type, account.id);
      }

      const providerClearingId = accounts.get('provider_clearing');
      const savingsPoolId = accounts.get('savings_pool');
      const creditAccountId = accounts.get('credit');

      if (!providerClearingId || !savingsPoolId || !creditAccountId) {
        throw new Error('Required ledger accounts were not found');
      }

      // 9. Create the journal transaction.
      const journalResult = await client.query(
        `INSERT INTO journal_transactions (kind)
         VALUES ('inflow')
         RETURNING id`,
      );

      const journalTxnId = journalResult.rows[0].id;

      // 10. Record the provider clearing entry.
      await client.query(
        `INSERT INTO journal_entries (
          txn_id,
          account_id,
          amount_kobo
        )
        VALUES ($1, $2, $3)`,
        [journalTxnId, providerClearingId, dto.amount_kobo],
      );

      // 11. Record the savings allocation, if any.
      if (savingsKobo > 0) {
        await client.query(
          `INSERT INTO journal_entries (
            txn_id,
            account_id,
            amount_kobo
          )
          VALUES ($1, $2, $3)`,
          [journalTxnId, savingsPoolId, -savingsKobo],
        );
      }

      // 12. Record the excess as credit, if any.
      if (creditKobo > 0) {
        await client.query(
          `INSERT INTO journal_entries (
            txn_id,
            account_id,
            amount_kobo
          )
          VALUES ($1, $2, $3)`,
          [journalTxnId, creditAccountId, -creditKobo],
        );
      }

      // 13. Save the inflow record.
      const inflowResult = await client.query(
        `INSERT INTO inflows (
          provider_ref,
          membership_id,
          amount_kobo,
          received_at,
          source,
          outcome,
          journal_txn_id
        )
        VALUES ($1, $2, $3, $4, 'webhook', $5, $6)
        RETURNING *`,
        [
          dto.provider_ref,
          membership.id,
          dto.amount_kobo,
          dto.received_at,
          outcome,
          journalTxnId,
        ],
      );

      const inflow = inflowResult.rows[0];

      // 14. Commit everything together.
      await client.query('COMMIT');
      transactionFinished = true;

      return {
        message: 'Inflow processed successfully',
        inflow,
        allocation: {
          received_kobo: dto.amount_kobo,
          savings_kobo: savingsKobo,
          credit_kobo: creditKobo,
          outcome,
        },
      };
    } catch (error) {
      if (!transactionFinished) {
        await client.query('ROLLBACK');
      }

      throw error;
    } finally {
      client.release();
    }
  }
}
