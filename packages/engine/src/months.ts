export type YearMonth = { year: number; month: number };

export function parseMonth(month: string): YearMonth {
  const [y, m] = month.split("-").map(Number);
  return { year: y!, month: m! };
}

export function formatMonth(ym: YearMonth): string {
  return `${ym.year}-${String(ym.month).padStart(2, "0")}`;
}

export function shiftMonth(from: YearMonth, deltaMonths: number): YearMonth {
  const date = new Date(Date.UTC(from.year, from.month - 1 + deltaMonths, 1));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
}

export function previousMonth(month: string): string {
  return formatMonth(shiftMonth(parseMonth(month), -1));
}

/** The n months ending at (and including) the given month, ascending. */
export function lastNMonths(endMonth: YearMonth, n: number): string[] {
  const months: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    months.push(formatMonth(shiftMonth(endMonth, -i)));
  }
  return months;
}

export function currentMonth(today: Date = new Date()): YearMonth {
  return { year: today.getUTCFullYear(), month: today.getUTCMonth() + 1 };
}
