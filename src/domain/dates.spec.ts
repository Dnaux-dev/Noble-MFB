import { toWatDate, addDays, isoWeekday, daysInMonth } from './dates';
import { describe, expect, it } from '@jest/globals';

describe('toWatDate', () => {
  it('keeps the same day in the daytime', () => {
    expect(toWatDate(new Date('2026-12-04T10:00:00Z'))).toBe('2026-12-04');
  });
  it('keeps the same day at 23:45 Lagos time', () => {
    expect(toWatDate(new Date('2026-12-04T22:45:00Z'))).toBe('2026-12-04');
  });
  it('is still the same day one second before Lagos midnight', () => {
    expect(toWatDate(new Date('2026-12-04T22:59:59Z'))).toBe('2026-12-04');
  });
  it('rolls to the next day exactly at Lagos midnight', () => {
    expect(toWatDate(new Date('2026-12-04T23:00:00Z'))).toBe('2026-12-05');
  });
  it('is already the next day at 23:30 UTC', () => {
    expect(toWatDate(new Date('2026-12-04T23:30:00Z'))).toBe('2026-12-05');
  });
  it('rolls over the year end', () => {
    expect(toWatDate(new Date('2026-12-31T23:30:00Z'))).toBe('2027-01-01');
  });
  it('understands a timestamp that already has a +01:00 offset', () => {
    expect(toWatDate(new Date('2026-12-05T00:30:00+01:00'))).toBe('2026-12-05');
  });
});

describe('addDays', () => {
  it('crosses a year end', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });
  it('crosses a month end in a normal year', () => {
    expect(addDays('2027-02-28', 1)).toBe('2027-03-01');
  });
  it('knows about leap years', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
  });
  it('goes backwards', () => {
    expect(addDays('2026-12-01', -1)).toBe('2026-11-30');
  });
  it('rejects dates that do not exist', () => {
    expect(() => addDays('2026-02-30', 1)).toThrow();
    expect(() => addDays('2026-13-01', 1)).toThrow();
    expect(() => addDays('abc', 1)).toThrow();
  });
});

describe('isoWeekday', () => {
  it('gives 5 for a Friday', () => {
    expect(isoWeekday('2026-12-04')).toBe(5);
  });
  it('gives 7 for a Sunday', () => {
    expect(isoWeekday('2026-12-06')).toBe(7);
  });
  it('gives 1 for a Monday', () => {
    expect(isoWeekday('2026-12-07')).toBe(1);
  });
});

describe('daysInMonth', () => {
  it('handles February in normal and leap years', () => {
    expect(daysInMonth(2027, 2)).toBe(28);
    expect(daysInMonth(2028, 2)).toBe(29);
  });
  it('handles 31 and 30 day months', () => {
    expect(daysInMonth(2026, 12)).toBe(31);
    expect(daysInMonth(2026, 4)).toBe(30);
  });
});
