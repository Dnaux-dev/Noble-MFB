
import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
    Inject,
} from '@nestjs/common';

import { Pool } from 'pg';
import { toWatDate } from '../domain/dates';

@Injectable()
export class PayoutsService {
    constructor(
        @Inject('PG_POOL')
        private readonly pool: Pool,
    ) { }

    async createPayout(
        membershipId: string,
        idempotencyKey: string,
        userId: string,
    ) {
        if (!idempotencyKey || !idempotencyKey.trim()) {
            throw new BadRequestException(
                'Idempotency-Key header is required',
            );
        }

        const client = await this.pool.connect();
        let transactionFinished = false;

        try {
            await client.query('BEGIN');

            // 1. Lock the membership.
            // Concurrent payout requests for this membership must wait.
            const membershipResult = await client.query(
                `SELECT *
 FROM memberships
 WHERE id = $1
   AND user_id = $2
 FOR UPDATE`,
                [membershipId, userId],
            );

            if (membershipResult.rowCount === 0) {
                throw new NotFoundException('Membership not found');
            }

            const membership = membershipResult.rows[0];

            // 2. Check whether this idempotency key has been used.
            const existingKeyResult = await client.query(
                `SELECT membership_id, response
         FROM idempotency_keys
         WHERE scope = 'payout'
           AND key = $1`,
                [idempotencyKey],
            );

            if (
                existingKeyResult.rowCount &&
                existingKeyResult.rowCount > 0
            ) {
                const existingKey = existingKeyResult.rows[0];

                if (existingKey.membership_id !== membershipId) {
                    throw new ConflictException(
                        'Idempotency key has already been used for another membership',
                    );
                }

                await client.query('COMMIT');
                transactionFinished = true;

                return existingKey.response;
            }

            // 3. Check whether the cycle has ended in Lagos.
            const today = toWatDate(new Date());

            if (today < membership.cycle_end) {
                throw new BadRequestException(
                    `Payout is only available after the cycle ends on ${membership.cycle_end}`,
                );
            }

            // 4. Check whether this membership has already been paid out.
            const existingPayoutResult = await client.query(
                `SELECT *
         FROM payouts
         WHERE membership_id = $1`,
                [membershipId],
            );

            if (
                existingPayoutResult.rowCount &&
                existingPayoutResult.rowCount > 0
            ) {
                throw new ConflictException(
                    'This membership has already been paid out',
                );
            }

            // 5. Get the savings pool account.
            const savingsAccountResult = await client.query(
                `SELECT id
         FROM ledger_accounts
         WHERE membership_id = $1
           AND type = 'savings_pool'`,
                [membershipId],
            );

            if (savingsAccountResult.rowCount === 0) {
                throw new NotFoundException(
                    'Savings pool account not found',
                );
            }

            const savingsAccountId =
                savingsAccountResult.rows[0].id;

            // 6. Calculate the savings pool balance from the ledger.
            const balanceResult = await client.query(
                `SELECT COALESCE(SUM(amount_kobo), 0)::text AS balance
         FROM journal_entries
         WHERE account_id = $1`,
                [savingsAccountId],
            );

            const ledgerBalance = Number(
                balanceResult.rows[0].balance,
            );

            if (!Number.isSafeInteger(ledgerBalance)) {
                throw new Error(
                    'Savings pool balance exceeds safe integer limits',
                );
            }

            // Savings pool entries use negative amounts.
            const payoutAmountKobo = -ledgerBalance;

            if (payoutAmountKobo <= 0) {
                throw new BadRequestException(
                    'There are no savings available for payout',
                );
            }

            // 7. Find the customer's payout account.
            const payoutAccountResult = await client.query(
                `SELECT id
         FROM ledger_accounts
         WHERE membership_id = $1
           AND type = 'customer_payout'`,
                [membershipId],
            );

            if (payoutAccountResult.rowCount === 0) {
                throw new NotFoundException(
                    'Customer payout account not found',
                );
            }

            const payoutAccountId =
                payoutAccountResult.rows[0].id;

            // 8. Create the payout journal transaction.
            const journalResult = await client.query(
                `INSERT INTO journal_transactions (kind)
         VALUES ('payout')
         RETURNING id`,
            );

            const journalTxnId = journalResult.rows[0].id;

            // 9. Move the full savings amount out of savings_pool.
            await client.query(
                `INSERT INTO journal_entries (
          txn_id,
          account_id,
          amount_kobo
        )
        VALUES ($1, $2, $3)`,
                [
                    journalTxnId,
                    savingsAccountId,
                    payoutAmountKobo,
                ],
            );

            // 10. Record the amount in the customer payout account.
            await client.query(
                `INSERT INTO journal_entries (
          txn_id,
          account_id,
          amount_kobo
        )
        VALUES ($1, $2, $3)`,
                [
                    journalTxnId,
                    payoutAccountId,
                    -payoutAmountKobo,
                ],
            );

            // 11. Create the payout record.
            const payoutResult = await client.query(
                `INSERT INTO payouts (
          membership_id,
          journal_txn_id,
          amount_kobo
        )
        VALUES ($1, $2, $3)
        RETURNING *`,
                [
                    membershipId,
                    journalTxnId,
                    payoutAmountKobo,
                ],
            );

            const payout = payoutResult.rows[0];

            // 12. Prepare the original response.
            const response = {
                message: 'Payout processed successfully',
                payout: {
                    id: payout.id,
                    membership_id: payout.membership_id,
                    amount_kobo: payout.amount_kobo,
                    journal_txn_id: payout.journal_txn_id,
                    created_at: payout.created_at,
                },
            };

            // 13. Save the idempotency key and response.
            await client.query(
                `INSERT INTO idempotency_keys (
          scope,
          key,
          membership_id,
          payout_id,
          response
        )
        VALUES ('payout', $1, $2, $3, $4::jsonb)`,
                [
                    idempotencyKey,
                    membershipId,
                    payout.id,
                    JSON.stringify(response),
                ],
            );

            // 14. Commit the entire payout atomically.
            await client.query('COMMIT');
            transactionFinished = true;

            return response;
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
