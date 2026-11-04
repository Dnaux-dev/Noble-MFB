import { DateStr, addDays, daysInMonth, isoWeekday, makeDate, splitDate } from './dates';

export type Frequency = 'daily' | 'weekly' | 'monthly';
export type Cycle = 'monthly' | 'quarterly' | 'bi_annual' | 'annual';

export const CYCLE_MONTHS: Record<Cycle, number> = {
  monthly: 1,
  quarterly: 3,
  bi_annual: 6,
  annual: 12,
};

export interface Plan {
  frequency: Frequency;
  cycle: Cycle;
  weekday?: number | null;
  monthDay?: number | null;
  monthLastDay?: boolean;
}

function monthPlus(year: number, month: number, extra: number): [number, number] {
  const total = year * 12 + (month - 1) + extra;
  return [Math.floor(total / 12), (total % 12) + 1];
}

export function computeCycle(joinedOn: DateStr, cycle: Cycle): { cycleStart: DateStr; cycleEnd: DateStr } {
  const [year, month, day] = splitDate(joinedOn);

  const [startYear, startMonth] = day === 1 ? [year, month] : monthPlus(year, month, 1);
  const cycleStart = makeDate(startYear, startMonth, 1);

  const [endYear, endMonth] = monthPlus(startYear, startMonth, CYCLE_MONTHS[cycle] - 1);
  const cycleEnd = makeDate(endYear, endMonth, daysInMonth(endYear, endMonth));

  return { cycleStart, cycleEnd };
}

export function dueDates(plan: Plan, cycleStart: DateStr, cycleEnd: DateStr): DateStr[] {
  const result: DateStr[] = [];

  if (plan.frequency === 'daily') {
    for (let d = cycleStart; d <= cycleEnd; d = addDays(d, 1)) {
      result.push(d);
    }
    return result;
  }

  if (plan.frequency === 'weekly') {
    const weekday = plan.weekday;
    if (weekday == null || !Number.isInteger(weekday) || weekday < 1 || weekday > 7) {
      throw new Error('A weekly plan needs a weekday from 1 (Monday) to 7 (Sunday)');
    }
    for (let d = cycleStart; d <= cycleEnd; d = addDays(d, 1)) {
      if (isoWeekday(d) === weekday) {
        result.push(d);
      }
    }
    return result;
  }

  const hasDay = plan.monthDay != null;
  const lastDay = plan.monthLastDay === true;
  if (hasDay === lastDay) {
    throw new Error('A monthly plan needs exactly one of month_day or month_last_day');
  }
  if (hasDay && (!Number.isInteger(plan.monthDay) || plan.monthDay! < 1 || plan.monthDay! > 28)) {
    throw new Error('month_day must be a whole number from 1 to 28');
  }

  const [startYear, startMonth] = splitDate(cycleStart);
  const monthsInCycle = CYCLE_MONTHS[plan.cycle];
  for (let i = 0; i < monthsInCycle; i++) {
    const [y, m] = monthPlus(startYear, startMonth, i);
    result.push(makeDate(y, m, lastDay ? daysInMonth(y, m) : plan.monthDay!));
  }
  return result;
}
