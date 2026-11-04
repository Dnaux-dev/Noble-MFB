import { DateStr } from './dates';

export type DueDateStatus =
  | 'paid'
  | 'paid_late'
  | 'partial'
  | 'missed'
  | 'upcoming';

export interface AllocationPayment {
  amountKobo: number;
  receivedAt: string;
}

export interface DueDateAllocation {
  dueDate: DateStr;
  expectedKobo: number;
  coveredKobo: number;
  outstandingKobo: number;
  status: DueDateStatus;
}

export interface AllocationResult {
  dueDates: DueDateAllocation[];
  totalExpectedKobo: number;
  totalPaidKobo: number;
  totalOutstandingKobo: number;
  overflowKobo: number;
}

interface MutableDueDate {
  dueDate: DateStr;
  expectedKobo: number;
  coveredKobo: number;
  completedAt: string | null;
}

/**
 * Convert an RFC3339 timestamp into its calendar date in Lagos.
 * WAT is UTC+1 and does not observe daylight saving.
 */
function toWATDate(receivedAt: string): DateStr {
  const hasTimezone =
    /(?:Z|[+-]\d{2}:\d{2})$/i.test(receivedAt);

  const timestamp = Date.parse(receivedAt);

  if (!hasTimezone || !Number.isFinite(timestamp)) {
    throw new Error('receivedAt must be a valid RFC3339 timestamp with an offset');
  }

  return new Date(timestamp + 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10) as DateStr;
}

function validateAmount(amount: number): void {
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new Error('Payment amount must be a positive safe integer in kobo');
  }
}

function validateDate(date: string, field: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`${field} must use YYYY-MM-DD`);
  }

  const parsed = new Date(`${date}T00:00:00.000Z`);

  if (
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== date
  ) {
    throw new Error(`${field} must be a valid calendar date`);
  }
}

/**
 * Allocate payments to the oldest uncovered due date first.
 *
 * Payments are sorted by receivedAt, not webhook processing order.
 * Money beyond the total cycle requirement is returned as overflow.
 */
export function allocatePayments(
  dueDates: DateStr[],
  contributionKobo: number,
  payments: AllocationPayment[],
  asOf: DateStr,
): AllocationResult {
  validateDate(asOf, 'asOf');

  if (!Number.isSafeInteger(contributionKobo) || contributionKobo <= 0) {
    throw new Error('Contribution must be a positive safe integer in kobo');
  }

  const sortedDueDates = [...dueDates].sort();

  for (const date of sortedDueDates) {
    validateDate(date, 'dueDate');
  }

  for (let i = 1; i < sortedDueDates.length; i++) {
    if (sortedDueDates[i] === sortedDueDates[i - 1]) {
      throw new Error('Due dates must not contain duplicates');
    }
  }

  const eligiblePayments = payments
    .map((payment, index) => {
      validateAmount(payment.amountKobo);

      return {
        ...payment,
        originalIndex: index,
        watDate: toWATDate(payment.receivedAt),
        timestamp: Date.parse(payment.receivedAt),
      };
    })
    // Ignore payments received after the as_of Lagos calendar date.
    .filter(payment => payment.watDate <= asOf)
    // Replay in actual chronological order.
    .sort((a, b) =>
      a.timestamp - b.timestamp ||
      a.originalIndex - b.originalIndex
    );

  const allocations: MutableDueDate[] = sortedDueDates.map(dueDate => ({
    dueDate,
    expectedKobo: contributionKobo,
    coveredKobo: 0,
    completedAt: null,
  }));

  let overflowKobo = 0;

  for (const payment of eligiblePayments) {
    let remainingKobo = payment.amountKobo;

    for (const allocation of allocations) {
      if (remainingKobo === 0) break;

      const outstandingKobo =
        allocation.expectedKobo - allocation.coveredKobo;

      if (outstandingKobo <= 0) continue;

      const amountToAllocate = Math.min(
        remainingKobo,
        outstandingKobo,
      );

      allocation.coveredKobo += amountToAllocate;
      remainingKobo -= amountToAllocate;

      if (
        allocation.coveredKobo === allocation.expectedKobo &&
        allocation.completedAt === null
      ) {
        allocation.completedAt = payment.receivedAt;
      }
    }

    // Never carry excess into another cycle.
    overflowKobo += remainingKobo;
  }

  const result: DueDateAllocation[] = allocations.map(allocation => {
    const outstandingKobo =
      allocation.expectedKobo - allocation.coveredKobo;

    let status: DueDateStatus;

    if (outstandingKobo === 0) {
      const completionDate = toWATDate(allocation.completedAt!);

      status =
        completionDate <= allocation.dueDate
          ? 'paid'
          : 'paid_late';
    } else if (asOf <= allocation.dueDate) {
      status = 'upcoming';
    } else if (allocation.coveredKobo > 0) {
      status = 'partial';
    } else {
      status = 'missed';
    }

    return {
      dueDate: allocation.dueDate,
      expectedKobo: allocation.expectedKobo,
      coveredKobo: allocation.coveredKobo,
      outstandingKobo,
      status,
    };
  });

  const totalExpectedKobo = result.reduce(
    (sum, item) => sum + item.expectedKobo,
    0,
  );

  const totalPaidKobo = result.reduce(
    (sum, item) => sum + item.coveredKobo,
    0,
  );

  return {
    dueDates: result,
    totalExpectedKobo,
    totalPaidKobo,
    totalOutstandingKobo: totalExpectedKobo - totalPaidKobo,
    overflowKobo,
  };
}
