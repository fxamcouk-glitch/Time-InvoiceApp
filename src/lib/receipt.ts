/** Pulls the useful bits (total, shop name, date, line items) out of OCR text from a receipt. */
export interface ReceiptItem {
  quantity: number;
  name: string;
  /** Line total, if it could be read. */
  price?: number;
}

export interface ParsedReceipt {
  amount?: number;
  merchant?: string;
  /** ISO yyyy-mm-dd */
  date?: string;
  items: ReceiptItem[];
  /** True when the item prices add up to the total, i.e. the item list is probably complete. */
  itemsMatchTotal: boolean;
}

const MONEY = /(?:£|GBP\s?)?-?(\d{1,5})[.,](\d{2})\b/g;
const TOTAL_LINE = /\b(total|amount\s*due|to\s*pay|balance\s*due|grand\s*total|card|visa|mastercard|debit|credit)\b/i;
const NOT_TOTAL_LINE = /\b(sub\s*-?\s*total|vat|tax|change|cash\s*back|savings?|discount|points|balance\s*(before|remaining))\b/i;
const NOISE_LINE = /\b(receipt|invoice|vat\s*(no|reg|number)|tel|phone|www\.|http|@|thank|welcome|order|till|cashier|served|store\s*(no|number)|customer|copy)\b|^[\d\s\W]*$/i;
/** Where the list of purchases ends. */
const ITEMS_END = /\b(sub\s*-?\s*total|total|amount\s*due|to\s*pay|balance\s*due|\d+\s*items?\b|items?\s*\(s\)|items?\s*:)/i;
/** Lines inside the purchases region that are never items. */
const ITEM_NOISE = /\b(tel|phone|email|e-mail|www\.|http|@|vat|returns?|policy|overleaf|thank|welcome|cashier|served|till|store|branch|opening|hours|receipt|invoice|date|time|order|ref|reference|auth|card|change|cash|tendered|qty|price|description)\b|\d{2}[/.-]\d{2}[/.-]\d{2,4}|\d{1,2}:\d{2}/i;
/** "2x NAME"; OCR often turns the x into c, « or *, and a 1 into I or l. */
const QTY_LINE = /(?:^|\s)(\d{1,3}|[Il])\s?[xX×cC«»*]\s+(.+)$/;

function parseQuantity(raw: string): number {
  return /^[Il]$/.test(raw) ? 1 : Number(raw);
}

/** Shops a tradesperson is likely to use; matched anywhere in the text (with common OCR slips for B&Q). */
const KNOWN_MERCHANTS: [RegExp, string][] = [
  [/\bB\s*[&a8e]\s*Q\b/i, 'B&Q'],
  [/\bscrewfix\b/i, 'Screwfix'],
  [/\btoolstation\b/i, 'Toolstation'],
  [/\bwickes\b/i, 'Wickes'],
  [/\btravis\s*perkins\b/i, 'Travis Perkins'],
  [/\bjewson\b/i, 'Jewson'],
  [/\bhomebase\b/i, 'Homebase'],
  [/\bselco\b/i, 'Selco'],
  [/\bhowdens\b/i, 'Howdens'],
  [/\bbuildbase\b/i, 'Buildbase'],
  [/\bhuws\s*gray\b/i, 'Huws Gray'],
  [/\bdobbies\b/i, 'Dobbies'],
  [/\bhalfords\b/i, 'Halfords'],
  [/\bamazon\b/i, 'Amazon'],
  [/\btesco\b/i, 'Tesco'],
  [/\bsainsbury'?s\b/i, "Sainsbury's"],
  [/\basda\b/i, 'Asda'],
  [/\bmorrisons\b/i, 'Morrisons'],
  [/\baldi\b/i, 'Aldi'],
  [/\blidl\b/i, 'Lidl'],
  [/\bshell\b/i, 'Shell'],
  [/\besso\b/i, 'Esso'],
  [/\btexaco\b/i, 'Texaco'],
  [/\bbp\b/, 'BP'],
];

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

function letterCount(text: string): number {
  return (text.match(/[A-Za-z]/g) ?? []).length;
}

/** A product name has at least one real word in it and isn't mostly digits or noise ("a ot Rp 108999" is not). */
function looksLikeName(name: string): boolean {
  const compact = name.replace(/\s/g, '');
  return letterCount(name) >= 4 && letterCount(name) >= compact.length * 0.5 && name.split(' ').some((word) => letterCount(word) >= 4);
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
  const text = lines.join('\n');
  for (const [pattern, name] of KNOWN_MERCHANTS) {
    if (pattern.test(text)) return name;
  }
  for (const raw of lines.slice(0, 8)) {
    const line = raw.replace(/[^A-Za-z0-9&'’.\- ]+/g, ' ').replace(/\s+/g, ' ').trim();
    const letters = letterCount(line);
    if (letters < 4 || letters < line.length * 0.7) continue;
    // Photo noise tends to OCR as short fragments ("Ay PT"); a real name has a proper word in it.
    const words = line.split(' ');
    if (!words.some((word) => letterCount(word) >= 4)) continue;
    if (words.filter((word) => letterCount(word) >= 3).length < words.length / 2) continue;
    if (NOISE_LINE.test(line)) continue;
    return line.length > 40 ? line.slice(0, 40).trim() : line;
  }
  return undefined;
}

function cleanItemName(raw: string): string {
  let name = cleanNumbers(raw)
    .replace(/(?:£|GBP\s?)?-?\d{1,5}[.,]\d{2}\b/g, ' ') // prices
    .replace(/\b\d{6,}\b/g, ' ') // barcodes (often with digits lost)
    .replace(/[^A-Za-z0-9&'’/%.,\- ]+/g, ' ')
    .replace(/(?<![A-Za-z])['’]|['’](?![A-Za-z])/g, ' ') // stray quotes; keep the one in "O'Neill"
    .replace(/-\s+(?=[A-Za-z])/g, '-') // "MULTI- PURPOSE" (noise split a hyphenated word)
    .replace(/\s+/g, ' ')
    .replace(/^[\W_]+|[\W_]+$/g, '')
    .trim();
  // Stray short tokens at the end are usually photo noise ("GRIT 20KG 3", "SAND 20KG LT"); keep sizes like "5L".
  name = name.replace(/(\s+(?:[A-Za-z0-9]|[A-Za-z]{2})){1,2}$/, '').trim();
  return name;
}

/** Product lines between the header and the total. Handles "2x NAME / barcode £unit £total" and "NAME 12.98" layouts. */
export function findItems(lines: string[]): ReceiptItem[] {
  let end = lines.findIndex((l) => ITEMS_END.test(l));
  if (end === -1) end = lines.length;
  const items: ReceiptItem[] = [];

  for (let i = 0; i < end; i++) {
    const line = lines[i];
    if (ITEM_NOISE.test(line)) continue;
    const prices = moneyValues(line);
    const qty = line.match(QTY_LINE);

    if (qty) {
      const name = cleanItemName(qty[2]);
      if (!looksLikeName(name)) continue;
      let price = prices.length > 0 ? prices[prices.length - 1] : undefined;
      if (price === undefined && i + 1 < end) {
        // "2x NAME" with the barcode and prices on the next line.
        const next = moneyValues(lines[i + 1]);
        if (next.length > 0) {
          price = next[next.length - 1];
          i++;
        }
      }
      items.push({ quantity: parseQuantity(qty[1]), name, price });
      continue;
    }

    if (prices.length > 0) {
      // "NAME 12.98" on one line; ignore barcode/price-only lines and obvious noise.
      const name = cleanItemName(line);
      if (!looksLikeName(name) || /\d{6,}/.test(line)) continue;
      items.push({ quantity: 1, name, price: prices[prices.length - 1] });
      continue;
    }

    if (i + 1 < end) {
      // "NAME" or "1 NAME" (the "x" often gets lost) followed by a barcode/price line.
      // Allow a couple of short noise tokens before the quantity ("ee PEE 2 MULTI-PURPOSE ...").
      const bare = line.match(/^(?:\S{1,4}\s+){0,2}(\d{1,2})\s+(.+)$/);
      const name = cleanItemName(bare ? bare[2] : line);
      const next = lines[i + 1];
      const nextPrices = moneyValues(next);
      const nextIsPriceLine = nextPrices.length > 0 && (/\d{6,}/.test(next) || letterCount(next) <= 2) && !ITEM_NOISE.test(next);
      if (looksLikeName(name) && nextIsPriceLine) {
        items.push({ quantity: bare ? Number(bare[1]) : 1, name, price: nextPrices[nextPrices.length - 1] });
        i++;
      }
    }
  }
  return items;
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

function formatItem(item: ReceiptItem): string {
  const qty = item.quantity > 1 ? `${item.quantity}x ` : '';
  const price = item.price !== undefined ? ` £${item.price.toFixed(2)}` : '';
  return `${qty}${item.name}${price}`;
}

/** Multi-line description for the material entry: shop on the first line, then one line per item. */
export function describeReceipt(parsed: ParsedReceipt): string | undefined {
  const lines: string[] = [];
  if (parsed.merchant) lines.push(parsed.merchant);
  for (const item of parsed.items) lines.push(formatItem(item));
  return lines.length > 0 ? lines.join('\n') : undefined;
}

export function parseReceipt(text: string): ParsedReceipt {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  const amount = findAmount(lines);
  const items = findItems(lines);
  const itemsTotal = items.reduce((sum, item) => sum + (item.price ?? 0), 0);
  // Items should add up to the total, or to a subtotal on trade receipts that add VAT afterwards.
  const targets = [amount, ...lines.filter((l) => /\bsub\s*-?\s*total\b/i.test(l)).flatMap(moneyValues)];
  return {
    amount,
    merchant: findMerchant(lines),
    date: findDate(text),
    items,
    itemsMatchTotal: items.length > 0 && targets.some((t) => t !== undefined && Math.abs(itemsTotal - t) < 0.011),
  };
}
