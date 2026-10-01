import type { Invoice } from '../types';

/**
 * INV-YYYYMM-NNN: year and month of issue, then a running number within that month. Takes the
 * highest number already used that month plus one, so deleting an invoice never reuses a number.
 */
export function nextInvoiceNumber(invoices: Invoice[], issueDate: string): string {
  const prefix = `INV-${issueDate.slice(0, 4)}${issueDate.slice(5, 7)}-`;
  const used = new Set(invoices.map((i) => i.number));
  let highest = 0;
  for (const number of used) {
    if (!number.startsWith(prefix)) continue;
    const seq = Number(number.slice(prefix.length));
    if (Number.isInteger(seq) && seq > highest) highest = seq;
  }
  let candidate = `${prefix}${String(highest + 1).padStart(3, '0')}`;
  while (used.has(candidate)) candidate = `${prefix}${String(++highest + 1).padStart(3, '0')}`;
  return candidate;
}
