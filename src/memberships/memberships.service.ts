
import {
    BadRequestException,
    Injectable,
    NotFoundException,
    Inject,
} from '@nestjs/common';
import { Pool } from 'pg';

import { CreateMembershipDto } from './dto/create-membership.dto';
import {
    computeCycle,
    dueDates,
    Plan,
} from '../domain/schedule';
import { DateStr, toWatDate } from '../domain/dates';
import { allocatePayments } from '../domain/allocation';

@Injectable()
export class MembershipsService {
    constructor(
        @Inject('PG_POOL')
        private readonly pool: Pool,
    ) { }

    async create(dto: CreateMembershipDto) {
        const client = await this.pool.connect();

        try {
            await client.query('BEGIN');

            // 1. Find the savings group.
            const groupResult = await client.query(
                `SELECT group_id, min_contribution_kobo
         FROM groups
         WHERE group_id = $1`,
                [dto.group_id],
            );

            if (groupResult.rowCount === 0) {
                throw new NotFoundException('Savings group not found');
            }

            const group = groupResult.rows[0];

            // 2. Validate the user's existence.
            const userResult = await client.query(
                'SELECT id FROM users WHERE id = $1',
                [dto.user_id],
            );

            if (userResult.rowCount === 0) {
                throw new NotFoundException('User not found');
            }

            // 3. Enforce the group's minimum contribution.
            if (
                dto.contribution_kobo < Number(group.min_contribution_kobo)
            ) {
                throw new BadRequestException(
                    `Minimum contribution is ${group.min_contribution_kobo} kobo`,
                );
            }

            // 4. Enforce group-specific frequency and cycle rules.
            const allowed =
                dto.group_id === 'g-ajo'
                    ? (
                        dto.frequency === 'daily' &&
                        dto.cycle === 'monthly'
                    ) ||
                    (
                        dto.frequency === 'weekly' &&
                        ['monthly', 'quarterly', 'bi_annual', 'annual'].includes(dto.cycle)
                    )
                    : (
                        dto.frequency === 'monthly' &&
                        ['quarterly', 'bi_annual', 'annual'].includes(dto.cycle)
                    );

            if (!allowed) {
                throw new BadRequestException(
                    'This frequency and cycle combination is not allowed for this group',
                );
            }

            // 5. Validate the schedule preferences.
            if (dto.frequency === 'daily') {
                if (
                    dto.weekday !== undefined ||
                    dto.month_day !== undefined ||
                    dto.month_last_day !== undefined
                ) {
                    throw new BadRequestException(
                        'Daily memberships must not include weekday or monthly scheduling fields',
                    );
                }
            }

            if (dto.frequency === 'weekly') {
                if (
                    dto.weekday === undefined ||
                    dto.month_day !== undefined ||
                    dto.month_last_day !== undefined
                ) {
                    throw new BadRequestException(
                        'Weekly memberships require a weekday and must not include monthly scheduling fields',
                    );
                }
            }

            if (dto.frequency === 'monthly') {
                const hasMonthDay = dto.month_day !== undefined;
                const usesLastDay = dto.month_last_day === true;

                if (
                    hasMonthDay === usesLastDay ||
                    dto.weekday !== undefined
                ) {
                    throw new BadRequestException(
                        'Monthly memberships require exactly one of month_day or month_last_day',
                    );
                }
            }

            // 6. Calculate the membership cycle.
            const joinedOn = dto.joined_on as DateStr;

            const { cycleStart, cycleEnd } = computeCycle(
                joinedOn,
                dto.cycle,
            );

            // Validate the generated schedule using existing domain logic.
            const plan: Plan = {
                frequency: dto.frequency,
                cycle: dto.cycle,
                weekday: dto.weekday,
                monthDay: dto.month_day,
                monthLastDay: dto.month_last_day ?? false,
            };

            dueDates(plan, cycleStart, cycleEnd);

            // 7. Create the membership.
            const membershipResult = await client.query(
                `INSERT INTO memberships (
          user_id,
          group_id,
          frequency,
          cycle,
          contribution_kobo,
          weekday,
          month_day,
          month_last_day,
          joined_on,
          cycle_start,
          cycle_end
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *`,
                [
                    dto.user_id,
                    dto.group_id,
                    dto.frequency,
                    dto.cycle,
                    dto.contribution_kobo,
                    dto.weekday ?? null,
                    dto.month_day ?? null,
                    dto.month_last_day ?? false,
                    joinedOn,
                    cycleStart,
                    cycleEnd,
                ],
            );

            const membership = membershipResult.rows[0];

            // 8. Create the membership's two ledger accounts.
            await client.query(
                `INSERT INTO ledger_accounts (type, membership_id)
   VALUES
     ('savings_pool', $1),
     ('credit', $1),
     ('customer_payout', $1)`,
                [membership.id],
            );

            // 9. Commit all changes together.
            await client.query('COMMIT');

            return {
                message: 'Membership created successfully',
                membership,
            };
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    async findOne(id: string) {
        const result = await this.pool.query(
            `SELECT
      m.*,
      g.name AS group_name,
      u.email AS user_email
    FROM memberships m
    JOIN groups g ON g.group_id = m.group_id
    JOIN users u ON u.id = m.user_id
    WHERE m.id = $1`,
            [id],
        );

        if (result.rowCount === 0) {
            throw new NotFoundException('Membership not found');
        }

        return {
            message: 'Membership retrieved successfully',
            membership: result.rows[0],
        };
    }


    async findSchedule(id: string, asOf?: string) {
        // 1. Retrieve the membership.
        const membershipResult = await this.pool.query(
            `SELECT * FROM memberships WHERE id = $1`,
            [id],
        );

        if (membershipResult.rowCount === 0) {
            throw new NotFoundException('Membership not found');
        }

        const membership = membershipResult.rows[0];

        // 2. Determine the date used to calculate payment statuses.
        const asOfDate = asOf ?? toWatDate(new Date());

        // 3. Generate the expected contribution dates.
        const plan: Plan = {
            frequency: membership.frequency,
            cycle: membership.cycle,
            weekday: membership.weekday,
            monthDay: membership.month_day,
            monthLastDay: membership.month_last_day,
        };

        const dates = dueDates(
            plan,
            membership.cycle_start,
            membership.cycle_end,
        );

        // 4. Retrieve successfully posted inflows.
        const inflowResult = await this.pool.query(
            `SELECT amount_kobo, received_at
     FROM inflows
     WHERE membership_id = $1
       AND outcome = 'posted'
     ORDER BY received_at ASC`,
            [id],
        );

        // 5. Convert database records into allocation payments.
        const payments = inflowResult.rows.map((row) => ({
            amountKobo: Number(row.amount_kobo),
            receivedAt: new Date(row.received_at).toISOString(),
        }));

        // 6. Allocate payments across the due dates.
        const allocation = allocatePayments(
            dates,
            Number(membership.contribution_kobo),
            payments,
            asOfDate as DateStr,
        );

        return {
            membership_id: membership.id,
            cycle: {
                start: membership.cycle_start,
                end: membership.cycle_end,
            },
            as_of: asOfDate,
            ...allocation,
        };
    }
}
