import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { BusinessInfo, Client, Invoice, MaterialEntry, TimeEntry } from '../types';
import { formatCurrency } from './format';

// A4 in points
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 48;
const CONTENT_W = PAGE_W - MARGIN * 2;
const RIGHT = PAGE_W - MARGIN;
const INK: [number, number, number] = [30, 41, 59];
const MUTED: [number, number, number] = [100, 116, 139];
const RULE: [number, number, number] = [226, 232, 240];
const HEAD_FILL: [number, number, number] = [30, 41, 59];
const PAID_GREEN: [number, number, number] = [5, 150, 105];

/** "17 Sep 2026" — the UK way round. */
function ukDate(iso: string): string {
  if (!iso) return '';
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * Turns a stored address into display lines. Addresses typed with line breaks keep them; a
 * one-line geocoded address ("Unit 5, Trading Estate, Stroud, Gloucestershire, GL5 3HX") is
 * split at the commas so it stacks like a normal postal address.
 */
export function addressLines(address: string): string[] {
  const trimmed = address.trim();
  if (!trimmed) return [];
  if (trimmed.includes('\n')) return trimmed.split('\n').map((l) => l.trim()).filter(Boolean);
  return trimmed.split(',').map((p) => p.trim()).filter(Boolean);
}

function wrap(doc: jsPDF, lines: string[], width: number): string[] {
  return lines.flatMap((line) => doc.splitTextToSize(line, width) as string[]);
}

function byDate<T extends { date: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export function generateInvoicePdf(
  invoice: Invoice,
  client: Client,
  entries: TimeEntry[],
  materials: MaterialEntry[],
  business: BusinessInfo,
): jsPDF {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  doc.setTextColor(...INK);
  let y = MARGIN + 10;

  // ---- Header: title + number on the left, dates on the right
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(24);
  doc.text('INVOICE', MARGIN, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(...MUTED);
  doc.text(invoice.number, MARGIN, y + 18);

  doc.setFontSize(10);
  const dateLabelX = RIGHT - 130;
  doc.setTextColor(...MUTED);
  doc.text('Invoice date', dateLabelX, y - 6);
  doc.text('Due date', dateLabelX, y + 10);
  doc.setTextColor(...INK);
  doc.text(ukDate(invoice.issueDate), RIGHT, y - 6, { align: 'right' });
  doc.setFont('helvetica', 'bold');
  doc.text(ukDate(invoice.dueDate), RIGHT, y + 10, { align: 'right' });
  doc.setFont('helvetica', 'normal');

  if (invoice.status === 'paid') {
    const label = invoice.paidDate ? `PAID ${ukDate(invoice.paidDate)}` : 'PAID';
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    const w = doc.getTextWidth(label) + 20;
    doc.setDrawColor(...PAID_GREEN);
    doc.setLineWidth(1.2);
    doc.roundedRect(RIGHT - w, y + 20, w, 20, 4, 4, 'S');
    doc.setTextColor(...PAID_GREEN);
    doc.text(label, RIGHT - w / 2, y + 33.5, { align: 'center' });
    doc.setTextColor(...INK);
    doc.setFont('helvetica', 'normal');
  }

  y += 44;
  doc.setDrawColor(...RULE);
  doc.setLineWidth(0.8);
  doc.line(MARGIN, y, RIGHT, y);
  y += 24;

  // ---- From / Bill to
  const colW = (CONTENT_W - 24) / 2;
  const toX = MARGIN + colW + 24;
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text('FROM', MARGIN, y);
  doc.text('BILL TO', toX, y);
  doc.setTextColor(...INK);
  doc.setFontSize(10);

  const fromLines = wrap(doc, [...addressLines(business.address), business.email].filter(Boolean), colW);
  const toLines = wrap(doc, [...addressLines(client.address), client.email].filter(Boolean), colW);
  const nameY = y + 16;
  doc.setFont('helvetica', 'bold');
  doc.text(wrap(doc, [business.name], colW), MARGIN, nameY);
  doc.text(wrap(doc, [client.name], colW), toX, nameY);
  doc.setFont('helvetica', 'normal');
  fromLines.forEach((line, i) => doc.text(line, MARGIN, nameY + 14 + i * 13));
  toLines.forEach((line, i) => doc.text(line, toX, nameY + 14 + i * 13));
  y = nameY + 14 + Math.max(fromLines.length, toLines.length, 1) * 13 + 22;

  // ---- Tables
  const getFinalY = () => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  const tableStyles = {
    margin: { left: MARGIN, right: MARGIN },
    headStyles: { fillColor: HEAD_FILL, textColor: 255, fontStyle: 'bold' as const, fontSize: 9 },
    styles: { fontSize: 9, cellPadding: { top: 6, bottom: 6, left: 6, right: 6 }, textColor: INK, lineColor: RULE, lineWidth: 0 },
    alternateRowStyles: { fillColor: [248, 250, 252] as [number, number, number] },
  };

  const sortedEntries = byDate(entries);
  if (sortedEntries.length > 0) {
    autoTable(doc, {
      ...tableStyles,
      startY: y,
      head: [['Date', 'Description', 'Hours', 'Rate', 'Amount']],
      body: sortedEntries.map((e) => [ukDate(e.date), e.description, e.hours.toFixed(2), formatCurrency(e.rate), formatCurrency(e.hours * e.rate)]),
      columnStyles: {
        0: { cellWidth: 78 },
        2: { halign: 'right', cellWidth: 52 },
        3: { halign: 'right', cellWidth: 64 },
        4: { halign: 'right', cellWidth: 72 },
      },
    });
    y = getFinalY() + 18;
  }

  const sortedMaterials = byDate(materials);
  if (sortedMaterials.length > 0) {
    autoTable(doc, {
      ...tableStyles,
      startY: y,
      head: [['Date', 'Materials', 'Amount']],
      body: sortedMaterials.map((m) => [ukDate(m.date), m.description, formatCurrency(m.amount)]),
      columnStyles: {
        0: { cellWidth: 78 },
        2: { halign: 'right', cellWidth: 72 },
      },
    });
    y = getFinalY() + 18;
  }

  // ---- Totals
  const labour = entries.reduce((sum, e) => sum + e.hours * e.rate, 0);
  const materialsTotal = materials.reduce((sum, m) => sum + m.amount, 0);
  const subtotal = labour + materialsTotal;
  const tax = subtotal * (invoice.taxRate / 100);
  const total = subtotal + tax;

  const totalLines: [string, string, boolean][] = [];
  if (entries.length > 0 && materials.length > 0) {
    totalLines.push(['Labour', formatCurrency(labour), false]);
    totalLines.push(['Materials', formatCurrency(materialsTotal), false]);
  }
  if (invoice.taxRate > 0) {
    totalLines.push(['Subtotal', formatCurrency(subtotal), false]);
    totalLines.push([`VAT (${invoice.taxRate}%)`, formatCurrency(tax), false]);
  }
  totalLines.push([invoice.status === 'paid' ? 'Total paid' : 'Total due', formatCurrency(total), true]);

  const totalsBlockH = totalLines.length * 16 + 24;
  if (y + totalsBlockH > PAGE_H - MARGIN - 40) {
    doc.addPage();
    y = MARGIN;
  }
  const totalsLabelX = RIGHT - 200;
  for (const [label, value, strong] of totalLines) {
    if (strong) {
      doc.setDrawColor(...RULE);
      doc.line(totalsLabelX, y - 4, RIGHT, y - 4);
      y += 10;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
    } else {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(...MUTED);
    }
    doc.text(label, totalsLabelX, y + 8);
    doc.setTextColor(...INK);
    doc.text(value, RIGHT, y + 8, { align: 'right' });
    y += strong ? 22 : 16;
  }
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  y += 14;

  // ---- Payment details and notes
  const sections: [string, string[]][] = [];
  if (invoice.status !== 'paid') {
    const payLines = [`Please pay by ${ukDate(invoice.dueDate)}, quoting ${invoice.number} as the payment reference.`];
    if (business.paymentDetails?.trim()) payLines.push(...business.paymentDetails.trim().split('\n'));
    sections.push(['Payment', payLines]);
  }
  if (invoice.notes.trim()) sections.push(['Notes', invoice.notes.trim().split('\n')]);

  for (const [title, lines] of sections) {
    const wrapped = wrap(doc, lines, CONTENT_W);
    const blockH = 16 + wrapped.length * 13 + 12;
    if (y + blockH > PAGE_H - MARGIN - 30) {
      doc.addPage();
      y = MARGIN;
    }
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    doc.text(title.toUpperCase(), MARGIN, y);
    doc.setTextColor(...INK);
    doc.setFontSize(10);
    wrapped.forEach((line, i) => doc.text(line, MARGIN, y + 15 + i * 13));
    y += blockH;
  }

  // ---- Footer on every page
  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    doc.text('Thank you for your business.', MARGIN, PAGE_H - MARGIN + 10);
    if (pageCount > 1) doc.text(`Page ${p} of ${pageCount}`, RIGHT, PAGE_H - MARGIN + 10, { align: 'right' });
  }
  doc.setTextColor(...INK);

  return doc;
}
