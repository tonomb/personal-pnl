import { format, isValid, parse } from "date-fns";

// Formats tried in order — most unambiguous first.
// DD/MM is listed before MM/DD so ambiguous dates (both parts ≤ 12) default
// to the European/Mexican convention used by most real bank statements.
// yearFirst=true formats are skipped when the input doesn't start with 4 digits,
// preventing e.g. "1/3/26" from being misread as yyyy/MM/dd (year=1).
const DATE_FORMATS: Array<{ fmt: string; yearFirst: boolean }> = [
  { fmt: "yyyy-MM-dd", yearFirst: true },
  { fmt: "dd MMM yyyy", yearFirst: false },
  { fmt: "dd MMMM yyyy", yearFirst: false },
  { fmt: "yyyy/MM/dd", yearFirst: true },
  { fmt: "dd/MM/yyyy", yearFirst: false },
  { fmt: "MM/dd/yyyy", yearFirst: false },
  { fmt: "d/M/yy", yearFirst: false }
];

const REFERENCE_DATE = new Date(2000, 0, 1);

export function normalizeDate(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;

  const startsWithFourDigits = /^\d{4}/.test(s);

  for (const { fmt, yearFirst } of DATE_FORMATS) {
    if (yearFirst && !startsWithFourDigits) continue;
    const parsed = parse(s, fmt, REFERENCE_DATE);
    if (isValid(parsed)) {
      // date-fns does not expand 2-digit years; apply the standard rule manually
      const yr = parsed.getFullYear();
      if (yr < 100) parsed.setFullYear(yr >= 50 ? 1900 + yr : 2000 + yr);
      return format(parsed, "yyyy-MM-dd");
    }
  }

  return null;
}

function hashString(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36);
}

export function generateFingerprint(headers: string[]): string {
  return hashString([...headers].sort().join(","));
}

export function generateTransactionId(date: string, description: string, amount: number): string {
  return hashString(`${date}|${description}|${amount}`);
}

export function parseAmount(raw: string): { amount: number; type: "DEBIT" | "CREDIT" } {
  const cleaned = raw.replace(/[$,\s]/g, "");
  const isNegative = cleaned.startsWith("(") || cleaned.startsWith("-");
  const numeric = parseFloat(cleaned.replace(/[()]/g, ""));
  return {
    amount: Math.abs(numeric),
    type: isNegative ? "DEBIT" : "CREDIT"
  };
}
