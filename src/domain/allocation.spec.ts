import { allocatePayments } from './allocation';
import { describe, expect, it } from '@jest/globals';

const WEEKLY_DUES = [
  '2026-12-04',
  '2026-12-11',
  '2026-12-18',
  '2026-12-25',
] as const;

describe('allocatePayments', () => {
  it('allocates money to the oldest uncovered due date first', () => {
    const result = allocatePayments(
      [...WEEKLY_DUES],
      500_000,
      [
        { amountKobo: 800_000, receivedAt: '2026-12-05T10:00:00Z' },
      ],
      '2026-12-10',
    );

    expect(result.dueDates[0]).toMatchObject({
      dueDate: '2026-12-04',
      coveredKobo: 500_000,
      status: 'paid_late',
    });

    expect(result.dueDates[1]).toMatchObject({
      dueDate: '2026-12-11',
      coveredKobo: 300_000,
      outstandingKobo: 200_000,
      status: 'upcoming',
    });
  });

  it('marks a contribution paid when fully covered on time', () => {
    const result = allocatePayments(
      ['2026-12-04'],
      500_000,
      [
        { amountKobo: 500_000, receivedAt: '2026-12-04T12:00:00Z' },
      ],
      '2026-12-05',
    );

    expect(result.dueDates[0].status).toBe('paid');
  });

  it('marks a contribution paid_late when completed after its due date', () => {
    const result = allocatePayments(
      ['2026-12-04'],
      500_000,
      [
        { amountKobo: 200_000, receivedAt: '2026-12-04T12:00:00Z' },
        { amountKobo: 300_000, receivedAt: '2026-12-07T10:00:00Z' },
      ],
      '2026-12-10',
    );

    expect(result.dueDates[0]).toMatchObject({
      coveredKobo: 500_000,
      status: 'paid_late',
    });
  });

  it('marks a partly covered due date as partial after its day ends', () => {
    const result = allocatePayments(
      ['2026-12-04'],
      500_000,
      [
        { amountKobo: 200_000, receivedAt: '2026-12-04T12:00:00Z' },
      ],
      '2026-12-05',
    );

    expect(result.dueDates[0]).toMatchObject({
      coveredKobo: 200_000,
      outstandingKobo: 300_000,
      status: 'partial',
    });
  });

  it('marks an uncovered due date as missed after its day ends', () => {
    const result = allocatePayments(
      ['2026-12-04'],
      500_000,
      [],
      '2026-12-05',
    );

    expect(result.dueDates[0].status).toBe('missed');
  });

  it('marks an uncovered due date as upcoming on its due date', () => {
    const result = allocatePayments(
      ['2026-12-04'],
      500_000,
      [],
      '2026-12-04',
    );

    expect(result.dueDates[0].status).toBe('upcoming');
  });

  it('marks a future due date as upcoming even when partly funded', () => {
    const result = allocatePayments(
      ['2026-12-11'],
      500_000,
      [
        { amountKobo: 200_000, receivedAt: '2026-12-05T10:00:00Z' },
      ],
      '2026-12-10',
    );

    expect(result.dueDates[0].status).toBe('upcoming');
  });

  it('replays payments by receivedAt, not input order', () => {
    const result = allocatePayments(
      ['2026-12-04', '2026-12-11'],
      500_000,
      [
        { amountKobo: 500_000, receivedAt: '2026-12-12T10:00:00Z' },
        { amountKobo: 500_000, receivedAt: '2026-12-03T10:00:00Z' },
      ],
      '2026-12-15',
    );

    expect(result.dueDates[0].status).toBe('paid');
    expect(result.dueDates[1].status).toBe('paid_late');
  });

  it('ignores payments received after asOf in Lagos time', () => {
    const result = allocatePayments(
      ['2026-12-04'],
      500_000,
      [
        { amountKobo: 500_000, receivedAt: '2026-12-05T10:00:00Z' },
      ],
      '2026-12-04',
    );

    expect(result.dueDates[0]).toMatchObject({
      coveredKobo: 0,
      status: 'upcoming',
    });
  });

  it('treats 22:59:59Z as 23:59:59 in Lagos on the same day', () => {
    const result = allocatePayments(
      ['2026-12-04'],
      500_000,
      [
        { amountKobo: 500_000, receivedAt: '2026-12-04T22:59:59Z' },
      ],
      '2026-12-04',
    );

    expect(result.dueDates[0].status).toBe('paid');
  });

  it('treats 23:00:00Z as midnight of the next Lagos day', () => {
    const result = allocatePayments(
      ['2026-12-04'],
      500_000,
      [
        { amountKobo: 500_000, receivedAt: '2026-12-04T23:00:00Z' },
      ],
      '2026-12-05',
    );

    expect(result.dueDates[0].status).toBe('paid_late');
  });

  it('reports excess money as overflow instead of allocating it', () => {
    const result = allocatePayments(
      ['2026-12-04', '2026-12-11'],
      500_000,
      [
        { amountKobo: 1_300_000, receivedAt: '2026-12-04T10:00:00Z' },
      ],
      '2026-12-12',
    );

    expect(result.totalExpectedKobo).toBe(1_000_000);
    expect(result.totalPaidKobo).toBe(1_000_000);
    expect(result.totalOutstandingKobo).toBe(0);
    expect(result.overflowKobo).toBe(300_000);
  });

  it('does not mutate the original payments array', () => {
    const payments = [
      { amountKobo: 500_000, receivedAt: '2026-12-05T10:00:00Z' },
      { amountKobo: 500_000, receivedAt: '2026-12-03T10:00:00Z' },
    ];

    const original = [...payments];

    allocatePayments(
      ['2026-12-04'],
      500_000,
      payments,
      '2026-12-10',
    );

    expect(payments).toEqual(original);
  });

  it('rejects zero or invalid payment amounts', () => {
    expect(() =>
      allocatePayments(
        ['2026-12-04'],
        500_000,
        [{ amountKobo: 0, receivedAt: '2026-12-04T10:00:00Z' }],
        '2026-12-10',
      ),
    ).toThrow();
  });

  it('rejects timestamps without an explicit timezone offset', () => {
    expect(() =>
      allocatePayments(
        ['2026-12-04'],
        500_000,
        [{ amountKobo: 500_000, receivedAt: '2026-12-04T10:00:00' }],
        '2026-12-10',
      ),
    ).toThrow();
  });

  it('rejects duplicate due dates', () => {
    expect(() =>
      allocatePayments(
        ['2026-12-04', '2026-12-04'],
        500_000,
        [],
        '2026-12-10',
      ),
    ).toThrow();
  });
});
