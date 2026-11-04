export type DateStr = string;

const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_DAY = 24 * MS_PER_HOUR;
const WAT_OFFSET_HOURS = 1;

export function toWatDate(instant: Date): DateStr {
  const shifted = new Date(instant.getTime() + WAT_OFFSET_HOURS * MS_PER_HOUR);
  return shifted.toISOString().slice(0, 10);
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function parseDate(d: DateStr): [number, number, number] {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  if (!m) throw new Error(`Invalid date string: ${d}`);
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    throw new Error(`Not a real calendar date: ${d}`);
  }
  return [year, month, day];
}

function toUtcMs(d: DateStr): number {
  const [year, month, day] = parseDate(d);
  return Date.UTC(year, month - 1, day);
}

function fromUtcMs(ms: number): DateStr {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(d: DateStr, n: number): DateStr {
  return fromUtcMs(toUtcMs(d) + n * MS_PER_DAY);
}

export function isoWeekday(d: DateStr): number {
  const jsDay = new Date(toUtcMs(d)).getUTCDay();
  return jsDay === 0 ? 7 : jsDay;
}
export function splitDate(d: DateStr): [number, number, number] {
  return parseDate(d);
}

export function makeDate(year: number, month: number, day: number): DateStr {
  const y = String(year).padStart(4, '0');
  const m = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}
