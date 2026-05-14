const MONTH_MAP: Record<string, string> = {
  jan: "01",
  feb: "02",
  mar: "03",
  apr: "04",
  may: "05",
  jun: "06",
  jul: "07",
  aug: "08",
  sep: "09",
  oct: "10",
  nov: "11",
  dec: "12"
};

function pad2(n: string | number): string {
  return String(n).padStart(2, "0");
}

/**
 * Tries to parse a date string in several common bank statement formats and
 * returns a canonical YYYY-MM-DD string, or null if no format matched.
 *
 * Detection order (most unambiguous first):
 *   1. YYYY-MM-DD           — already ISO, pass through
 *   2. DD MMM YYYY          — "31 Jan 2026" (Amex Mexico)
 *   3. YYYY/MM/DD
 *   4. DD/MM/YYYY or MM/DD/YYYY or D/M/YY  (slash or dash separated)
 *      • first part > 12  → day first
 *      • second part > 12 → month first
 *      • both ≤ 12        → assume DD/MM (European/Mexican default)
 */
export function normalizeDate(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;

  // 1. Already ISO
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // 2. DD MMM YYYY  e.g. "31 Jan 2026" or "1 January 2026"
  const dMonY = s.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if (dMonY) {
    const month = MONTH_MAP[dMonY[2].toLowerCase().slice(0, 3)];
    if (month) {
      const day = parseInt(dMonY[1], 10);
      if (day >= 1 && day <= 31) return `${dMonY[3]}-${month}-${pad2(day)}`;
    }
  }

  // 3. YYYY/MM/DD
  const ySlash = s.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (ySlash) {
    const m = parseInt(ySlash[2], 10);
    const d = parseInt(ySlash[3], 10);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) return `${ySlash[1]}-${pad2(m)}-${pad2(d)}`;
  }

  // 4. Two-part numeric: D/M/YY, DD/MM/YYYY, MM/DD/YYYY (separator: / or -)
  const parts = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (parts) {
    const a = parseInt(parts[1], 10);
    const b = parseInt(parts[2], 10);
    let yearStr = parts[3];
    if (yearStr.length === 2) {
      yearStr = parseInt(yearStr, 10) >= 50 ? `19${yearStr}` : `20${yearStr}`;
    }
    let day: number, month: number;
    if (a > 12) {
      day = a;
      month = b; // must be DD/MM
    } else if (b > 12) {
      day = b;
      month = a; // must be MM/DD
    } else {
      day = a;
      month = b; // ambiguous — default DD/MM
    }
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) return `${yearStr}-${pad2(month)}-${pad2(day)}`;
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
