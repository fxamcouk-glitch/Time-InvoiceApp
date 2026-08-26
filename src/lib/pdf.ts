import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { BusinessInfo, Client, Invoice, MaterialEntry, TimeEntry } from '../types';
import { formatCurrency, formatDate } from './format';

export function generateInvoicePdf(
  invoice: Invoice,
  client: Client,
  entries: TimeEntry[],
  materials: MaterialEntry[],
  business: BusinessInfo,
): jsPDF {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const marginX = 40;
  let y = 50;

  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.text('INVOICE', marginX, y);

  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text(`# ${invoice.number}`, marginX, y + 20);

  doc.setFontSize(10);
  doc.text(`Issued: ${formatDate(invoice.issueDate)}`, 420, y - 5, { align: 'left' });
  doc.text(`Due: ${formatDate(invoice.dueDate)}`, 420, y + 10, { align: 'left' });
  doc.setFont('helvetica', 'bold');
  doc.text(`Status: ${invoice.status.toUpperCase()}`, 420, y + 25);

  y += 55;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('From', marginX, y);
  doc.text('Bill To', 320, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);

  const fromLines = [business.name, business.email, ...business.address.split('\n')].filter(Boolean);
  const toLines = [client.name, client.email, ...client.address.split('\n')].filter(Boolean);
  fromLines.forEach((line, i) => doc.text(line, marginX, y + 16 + i * 14));
  toLines.forEach((line, i) => doc.text(line, 320, y + 16 + i * 14));

  y += 16 + Math.max(fromLines.length, toLines.length) * 14 + 20;

  const getFinalY = () => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

  if (entries.length > 0) {
    const rows = entries.map((e) => [
      formatDate(e.date),
      e.description || '—',
      e.hours.toFixed(2),
      formatCurrency(e.rate),
      formatCurrency(e.hours * e.rate),
    ]);

    autoTable(doc, {
      startY: y,
      head: [['Date', 'Description', 'Hours', 'Rate', 'Amount']],
      body: rows,
      margin: { left: marginX, right: marginX },
      headStyles: { fillColor: [31, 41, 55] },
      columnStyles: {
        2: { halign: 'right' },
        3: { halign: 'right' },
        4: { halign: 'right' },
      },
      styles: { fontSize: 9, cellPadding: 6 },
    });
    y = getFinalY() + 20;
  }

  if (materials.length > 0) {
    const rows = materials.map((m) => [formatDate(m.date), m.description || '—', formatCurrency(m.amount)]);

    autoTable(doc, {
      startY: y,
      head: [['Date', 'Materials', 'Amount']],
      body: rows,
      margin: { left: marginX, right: marginX },
      headStyles: { fillColor: [31, 41, 55] },
      columnStyles: {
        2: { halign: 'right' },
      },
      styles: { fontSize: 9, cellPadding: 6 },
    });
    y = getFinalY() + 20;
  }

  const timeSubtotal = entries.reduce((sum, e) => sum + e.hours * e.rate, 0);
  const materialsSubtotal = materials.reduce((sum, m) => sum + m.amount, 0);
  const subtotal = timeSubtotal + materialsSubtotal;
  const tax = subtotal * (invoice.taxRate / 100);
  const total = subtotal + tax;

  const totalsX = 380;
  let ty = y;
  doc.setFontSize(10);
  doc.text('Subtotal', totalsX, ty);
  doc.text(formatCurrency(subtotal), 555, ty, { align: 'right' });
  ty += 16;
  if (invoice.taxRate > 0) {
    doc.text(`Tax (${invoice.taxRate}%)`, totalsX, ty);
    doc.text(formatCurrency(tax), 555, ty, { align: 'right' });
    ty += 16;
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('Total Due', totalsX, ty + 4);
  doc.text(formatCurrency(total), 555, ty + 4, { align: 'right' });

  if (invoice.notes) {
    ty += 40;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('Notes', marginX, ty);
    doc.setFont('helvetica', 'normal');
    const noteLines = doc.splitTextToSize(invoice.notes, 515);
    doc.text(noteLines, marginX, ty + 14);
  }

  return doc;
}
