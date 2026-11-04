import { computeCycle, dueDates } from './schedule';
import { describe, expect, it } from '@jest/globals';

describe('computeCycle', () => {
  it('starts on the 1st of next month when joining mid-month', () => {
    expect(computeCycle('2026-11-14', 'monthly')).toEqual({ cycleStart: '2026-12-01', cycleEnd: '2026-12-31' });
  });
  it('starts the same day when joining on the 1st (quarterly)', () => {
    expect(computeCycle('2027-01-01', 'quarterly')).toEqual({ cycleStart: '2027-01-01', cycleEnd: '2027-03-31' });
  });
  it('treats the 10th as mid-month', () => {
    expect(computeCycle('2027-02-10', 'monthly')).toEqual({ cycleStart: '2027-03-01', cycleEnd: '2027-03-31' });
  });
  it('joining on the last day of a month starts next month', () => {
    expect(computeCycle('2026-11-30', 'monthly')).toEqual({ cycleStart: '2026-12-01', cycleEnd: '2026-12-31' });
  });
  it('rolls into the next year', () => {
    expect(computeCycle('2026-12-15', 'annual')).toEqual({ cycleStart: '2027-01-01', cycleEnd: '2027-12-31' });
  });
  it('bi_annual is six months', () => {
    expect(computeCycle('2026-07-01', 'bi_annual')).toEqual({ cycleStart: '2026-07-01', cycleEnd: '2026-12-31' });
  });
  it('ends on 29 February in a leap year', () => {
    expect(computeCycle('2028-01-20', 'monthly')).toEqual({ cycleStart: '2028-02-01', cycleEnd: '2028-02-29' });
  });
  it('a quarterly cycle can end in a different year from where it began', () => {
    expect(computeCycle('2026-10-20', 'quarterly')).toEqual({ cycleStart: '2026-11-01', cycleEnd: '2027-01-31' });
  });
});

describe('dueDates: the three worked examples from the brief', () => {
  it('weekly Friday, monthly cycle: Dec 4, 11, 18, 25', () => {
    expect(dueDates({ frequency: 'weekly', cycle: 'monthly', weekday: 5 }, '2026-12-01', '2026-12-31')).toEqual([
      '2026-12-04', '2026-12-11', '2026-12-18', '2026-12-25',
    ]);
  });
  it('monthly last day, quarterly: Jan 31, Feb 28, Mar 31', () => {
    expect(dueDates({ frequency: 'monthly', cycle: 'quarterly', monthLastDay: true }, '2027-01-01', '2027-03-31')).toEqual([
      '2027-01-31', '2027-02-28', '2027-03-31',
    ]);
  });
  it('weekly Wednesday, monthly cycle: Mar 3, 10, 17, 24, 31', () => {
    expect(dueDates({ frequency: 'weekly', cycle: 'monthly', weekday: 3 }, '2027-03-01', '2027-03-31')).toEqual([
      '2027-03-03', '2027-03-10', '2027-03-17', '2027-03-24', '2027-03-31',
    ]);
  });
});

describe('dueDates: other cases', () => {
  it('daily includes every day, weekends too', () => {
    const days = dueDates({ frequency: 'daily', cycle: 'monthly' }, '2026-12-01', '2026-12-31');
    expect(days).toHaveLength(31);
    expect(days[0]).toBe('2026-12-01');
    expect(days[30]).toBe('2026-12-31');
    expect(days).toContain('2026-12-05');
    expect(days).toContain('2026-12-06');
  });
  it('monthly on the 28th', () => {
    expect(dueDates({ frequency: 'monthly', cycle: 'quarterly', monthDay: 28 }, '2027-01-01', '2027-03-31')).toEqual([
      '2027-01-28', '2027-02-28', '2027-03-28',
    ]);
  });
  it('last day in a leap-year February is the 29th', () => {
    expect(dueDates({ frequency: 'monthly', cycle: 'quarterly', monthLastDay: true }, '2028-01-01', '2028-03-31')).toEqual([
      '2028-01-31', '2028-02-29', '2028-03-31',
    ]);
  });
  it('weekly Monday in December 2026', () => {
    expect(dueDates({ frequency: 'weekly', cycle: 'monthly', weekday: 1 }, '2026-12-01', '2026-12-31')).toEqual([
      '2026-12-07', '2026-12-14', '2026-12-21', '2026-12-28',
    ]);
  });
  it('last day across a year end', () => {
    expect(dueDates({ frequency: 'monthly', cycle: 'quarterly', monthLastDay: true }, '2026-11-01', '2027-01-31')).toEqual([
      '2026-11-30', '2026-12-31', '2027-01-31',
    ]);
  });
});

describe('dueDates: rejects bad plans', () => {
  it('weekly without a weekday', () => {
    expect(() => dueDates({ frequency: 'weekly', cycle: 'monthly' }, '2026-12-01', '2026-12-31')).toThrow();
  });
  it('weekday 8', () => {
    expect(() => dueDates({ frequency: 'weekly', cycle: 'monthly', weekday: 8 }, '2026-12-01', '2026-12-31')).toThrow();
  });
  it('monthly with both month_day and month_last_day', () => {
    expect(() => dueDates({ frequency: 'monthly', cycle: 'quarterly', monthDay: 10, monthLastDay: true }, '2027-01-01', '2027-03-31')).toThrow();
  });
  it('monthly with neither', () => {
    expect(() => dueDates({ frequency: 'monthly', cycle: 'quarterly' }, '2027-01-01', '2027-03-31')).toThrow();
  });
  it('month_day 29', () => {
    expect(() => dueDates({ frequency: 'monthly', cycle: 'quarterly', monthDay: 29 }, '2027-01-01', '2027-03-31')).toThrow();
  });
});
