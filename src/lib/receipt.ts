/** Pulls the useful bits (total, shop name, date) out of OCR text from a receipt. */
export interface ParsedReceipt {
  amount?: number;
  merchant?: string;
  /** ISO yyyy-mm-dd */
  date?: string;
}

const MONEY = /(?:£|GBP\s?)?(\d{1,5})[.,](\d{2})\b/g;
const TOTAL_LINE = /\b(total|amount\s*due|to\s*pay|balance\s*due|grand\s*total|card|visa|mastercard|debit|credit)\b/i;
const NOT_TOTAL_LINE = /\b(sub\s*-?\s*total|vat|tax|change|cash\s*back|savings?|discount|points|balance\s*(before|remaining))\b/i;
const NOISE_LINE = /\b(receipt|invoice|vat\s*(no|reg|number)|tel|phone|www\.|http|@|thank|welcome|order|till|cashier|served|store\s*(no|number)|customer|copy)\b|^[\d\s\W]*$/i;

function cleanNumbers(line: string): string {
  // Common OCR confusions inside numbers: O→0, l/I→1, S→5, B→8.
  return line.replace(/(?<=[\d£.,])[OoIlSB](?=[\d.,])|(?<=[\d.,])[OoIlSB](?=[\d£.,]|$)/g, (ch) =>
    ({ O: '0', o: '0', I: '1', l: '1', S: '5', B: '8' })[ch] ?? ch,
  );
}

function moneyValues(line: string): number[] {
  const values: number[] = [];
  for (const match of cleanNumbers(line).matchAll(MONEY)) {
    values.push(Number(`${match[1]}.${match[2]}`));
  }
  return values;
}

export function findAmount(lines: string[]): number | undefined {
  // Prefer a "TOTAL"-style line; the last such line on a receipt is usually the grand total.
  const totalLines = lines.filter((l) => TOTAL_LINE.test(l) && !NOT_TOTAL_LINE.test(l));
  for (let i = totalLines.length - 1; i >= 0; i--) {
    const values = moneyValues(totalLines[i]);
    if (values.length > 0) return values[values.length - 1];
  }
  // Sometimes the amount ends up on the line after "TOTAL".
  for (let i = lines.length - 1; i >= 0; i--) {
    if (TOTAL_LINE.test(lines[i]) && !NOT_TOTAL_LINE.test(lines[i])) {
      const next = lines[i + 1] ? moneyValues(lines[i + 1]) : [];
      if (next.length > 0) return next[next.length - 1];
    }
  }
  // Fall back to the largest amount that isn't obviously a VAT/subtotal line.
  let best: number | undefined;
  for (const line of lines) {
    if (NOT_TOTAL_LINE.test(line)) continue;
    for (const value of moneyValues(line)) {
      if (best === undefined || value > best) best = value;
    }
  }
  return best;
}

export function findMerchant(lines: string[]): string | undefined {
  for (const raw of lines.slice(0, 8)) {
    const line = raw.replace(/[^A-Za-z0-9&'’.\- ]+/g, ' ').replace(/\s+/g, ' ').trim();
    const letters = (line.match(/[A-Za-z]/g) ?? []).length;
    if (letters < 3 || letters < line.length / 2) continue;
    if (NOISE_LINE.test(line)) continue;
    return line.length > 40 ? line.slice(0, 40).trim() : line;
  }
  return undefined;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function toIso(year: number, month: number, day: number): string | undefined {
  if (year < 100) year += 2000;
  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined;
  const date = new Date(year, month - 1, day);
  if (date.getMonth() !== month - 1) return undefined;
  const now = new Date();
  if (date.getTime() > now.getTime() + 86_400_000 || year < now.getFullYear() - 2) return undefined;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function findDate(text: string): string | undefined {
  // UK numeric: 14/09/26, 14-09-2026, 14.09.2026
  const numeric = text.match(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})\b/);
  if (numeric) {
    const iso = toIso(Number(numeric[3]), Number(numeric[2]), Number(numeric[1]));
    if (iso) return iso;
  }
  // Written month: 14 Sep 2026, 14 September 26
  const written = text.match(/\b(\d{1,2})\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*(\d{2}|\d{4})\b/i);
  if (written) {
    const iso = toIso(Number(written[3]), MONTHS.indexOf(written[2].toLowerCase()) + 1, Number(written[1]));
    if (iso) return iso;
  }
  // ISO: 2026-09-14
  const isoMatch = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (isoMatch) return toIso(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]));
  return undefined;
}

export function parseReceipt(text: string): ParsedReceipt {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  return {
    amount: findAmount(lines),
    merchant: findMerchant(lines),
    date: findDate(text),
  };
}
