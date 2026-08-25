import { useMemo, useState } from 'react';
import { addDays, formatCurrency, formatDate, today } from '../lib/format';
import { newId } from '../lib/id';
import { generateInvoicePdf } from '../lib/pdf';
import type { BusinessInfo, Client, Invoice, InvoiceStatus, TimeEntry } from '../types';
import { Button, Card, EmptyState, Field, Input, LabelBadge, Select, Textarea } from './ui';

interface Props {
  clients: Client[];
  entries: TimeEntry[];
  invoices: Invoice[];
  business: BusinessInfo;
  onEntriesChange: (entries: TimeEntry[]) => void;
  onInvoicesChange: (invoices: Invoice[]) => void;
}

const statusTone: Record<InvoiceStatus, 'gray' | 'blue' | 'green'> = {
  draft: 'gray',
  sent: 'blue',
  paid: 'green',
};

function nextInvoiceNumber(invoices: Invoice[]): string {
  const year = new Date().getFullYear();
  const count = invoices.filter((i) => i.number.startsWith(`INV-${year}`)).length + 1;
  return `INV-${year}-${String(count).padStart(3, '0')}`;
}

export function InvoicesView({ clients, entries, invoices, business, onEntriesChange, onInvoicesChange }: Props) {
  const clientMap = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);
  const [creatingClientId, setCreatingClientId] = useState(clients[0]?.id ?? '');
  const [selectedEntryIds, setSelectedEntryIds] = useState<Set<string>>(new Set());
  const [taxRate, setTaxRate] = useState('0');
  const [notes, setNotes] = useState('');
  const [dueInDays, setDueInDays] = useState('14');
  const [viewingId, setViewingId] = useState<string | null>(null);

  const unbilledForClient = entries.filter((e) => e.clientId === creatingClientId && !e.invoiceId);

  function toggleEntry(id: string) {
    setSelectedEntryIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelectedEntryIds(new Set(unbilledForClient.map((e) => e.id)));
  }

  function createInvoice() {
    const ids = [...selectedEntryIds].filter((id) => unbilledForClient.some((e) => e.id === id));
    if (!creatingClientId || ids.length === 0) return;
    const issueDate = today();
    const invoice: Invoice = {
      id: newId(),
      number: nextInvoiceNumber(invoices),
      clientId: creatingClientId,
      issueDate,
      dueDate: addDays(issueDate, Number(dueInDays) || 0),
      entryIds: ids,
      taxRate: Number(taxRate) || 0,
      notes: notes.trim(),
      status: 'draft',
    };
    onInvoicesChange([invoice, ...invoices]);
    onEntriesChange(entries.map((e) => (ids.includes(e.id) ? { ...e, invoiceId: invoice.id } : e)));
    setSelectedEntryIds(new Set());
    setNotes('');
    setViewingId(invoice.id);
  }

  function deleteInvoice(id: string) {
    if (!confirm('Delete this invoice? Its time entries will become unbilled again.')) return;
    onEntriesChange(entries.map((e) => (e.invoiceId === id ? { ...e, invoiceId: null } : e)));
    onInvoicesChange(invoices.filter((i) => i.id !== id));
    if (viewingId === id) setViewingId(null);
  }

  function setStatus(id: string, status: InvoiceStatus) {
    onInvoicesChange(invoices.map((i) => (i.id === id ? { ...i, status } : i)));
  }

  function download(invoice: Invoice) {
    const client = clientMap.get(invoice.clientId);
    if (!client) return;
    const invoiceEntries = entries.filter((e) => invoice.entryIds.includes(e.id));
    const doc = generateInvoicePdf(invoice, client, invoiceEntries, business);
    doc.save(`${invoice.number}.pdf`);
  }

  const viewingInvoice = invoices.find((i) => i.id === viewingId) ?? null;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <Card className="p-5 lg:col-span-1 h-fit">
        <h2 className="mb-4 text-sm font-semibold text-slate-800">New invoice</h2>
        {clients.length === 0 ? (
          <p className="text-sm text-slate-400">Add a client first.</p>
        ) : (
          <div className="flex flex-col gap-3">
            <Field label="Client">
              <Select
                value={creatingClientId}
                onChange={(e) => {
                  setCreatingClientId(e.target.value);
                  setSelectedEntryIds(new Set());
                }}
              >
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-sm font-medium text-slate-700">Unbilled entries</span>
                {unbilledForClient.length > 0 && (
                  <button type="button" onClick={selectAll} className="text-xs font-medium text-indigo-600 hover:underline">
                    Select all
                  </button>
                )}
              </div>
              {unbilledForClient.length === 0 ? (
                <p className="text-sm text-slate-400">No unbilled hours for this client.</p>
              ) : (
                <ul className="max-h-56 divide-y divide-slate-100 overflow-y-auto rounded-md border border-slate-200">
                  {unbilledForClient.map((entry) => (
                    <li key={entry.id} className="flex items-center gap-3 px-2.5 py-3 text-sm">
                      <input
                        type="checkbox"
                        checked={selectedEntryIds.has(entry.id)}
                        onChange={() => toggleEntry(entry.id)}
                        className="h-5 w-5 shrink-0 rounded border-slate-300 text-indigo-600"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-slate-700">{entry.description || entry.date}</p>
                        <p className="text-xs text-slate-400">{entry.date}</p>
                      </div>
                      <span className="shrink-0 text-slate-500">{formatCurrency(entry.hours * entry.rate)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Tax rate (%)">
                <Input type="number" inputMode="decimal" min="0" step="0.1" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} />
              </Field>
              <Field label="Due in (days)">
                <Input type="number" inputMode="numeric" min="0" value={dueInDays} onChange={(e) => setDueInDays(e.target.value)} />
              </Field>
            </div>
            <Field label="Notes (optional)">
              <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Payment terms, thank-you note, etc." />
            </Field>

            <Button
              type="button"
              disabled={selectedEntryIds.size === 0}
              onClick={createInvoice}
              className="mt-1"
            >
              Create invoice ({selectedEntryIds.size} {selectedEntryIds.size === 1 ? 'entry' : 'entries'})
            </Button>
          </div>
        )}
      </Card>

      <div className="flex flex-col gap-6 lg:col-span-2">
        <Card>
          {invoices.length === 0 ? (
            <EmptyState title="No invoices yet" description="Select unbilled hours on the left to create your first invoice." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {invoices.map((inv) => {
                const invoiceEntries = entries.filter((e) => inv.entryIds.includes(e.id));
                const subtotal = invoiceEntries.reduce((sum, e) => sum + e.hours * e.rate, 0);
                const total = subtotal * (1 + inv.taxRate / 100);
                return (
                  <li
                    key={inv.id}
                    className={`flex cursor-pointer items-center justify-between gap-4 px-5 py-3 hover:bg-slate-50 ${viewingId === inv.id ? 'bg-indigo-50/60' : ''}`}
                    onClick={() => setViewingId(inv.id)}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-slate-800">{inv.number}</p>
                        <LabelBadge tone={statusTone[inv.status]}>{inv.status}</LabelBadge>
                      </div>
                      <p className="truncate text-xs text-slate-400">
                        {clientMap.get(inv.clientId)?.name ?? 'Unknown client'} · Due {formatDate(inv.dueDate)}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm font-medium text-slate-700">{formatCurrency(total)}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {viewingInvoice && (
          <InvoiceDetail
            invoice={viewingInvoice}
            client={clientMap.get(viewingInvoice.clientId) ?? null}
            entries={entries.filter((e) => viewingInvoice.entryIds.includes(e.id))}
            onStatusChange={(status) => setStatus(viewingInvoice.id, status)}
            onDelete={() => deleteInvoice(viewingInvoice.id)}
            onDownload={() => download(viewingInvoice)}
          />
        )}
      </div>
    </div>
  );
}

function InvoiceDetail({
  invoice,
  client,
  entries,
  onStatusChange,
  onDelete,
  onDownload,
}: {
  invoice: Invoice;
  client: Client | null;
  entries: TimeEntry[];
  onStatusChange: (status: InvoiceStatus) => void;
  onDelete: () => void;
  onDownload: () => void;
}) {
  const subtotal = entries.reduce((sum, e) => sum + e.hours * e.rate, 0);
  const tax = subtotal * (invoice.taxRate / 100);
  const total = subtotal + tax;

  return (
    <Card className="p-6">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-800">{invoice.number}</h3>
          <p className="text-sm text-slate-500">
            {client?.name ?? 'Unknown client'} · Issued {formatDate(invoice.issueDate)} · Due {formatDate(invoice.dueDate)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={invoice.status} onChange={(e) => onStatusChange(e.target.value as InvoiceStatus)} className="w-32">
            <option value="draft">Draft</option>
            <option value="sent">Sent</option>
            <option value="paid">Paid</option>
          </Select>
          <Button variant="secondary" onClick={onDownload}>
            Download PDF
          </Button>
          <Button variant="danger" onClick={onDelete}>
            Delete
          </Button>
        </div>
      </div>

      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
            <th className="py-2 font-medium">Date</th>
            <th className="py-2 font-medium">Description</th>
            <th className="py-2 text-right font-medium">Hours</th>
            <th className="py-2 text-right font-medium">Rate</th>
            <th className="py-2 text-right font-medium">Amount</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {entries.map((e) => (
            <tr key={e.id}>
              <td className="py-2 text-slate-600">{formatDate(e.date)}</td>
              <td className="py-2 text-slate-600">{e.description || '—'}</td>
              <td className="py-2 text-right text-slate-600">{e.hours}</td>
              <td className="py-2 text-right text-slate-600">{formatCurrency(e.rate)}</td>
              <td className="py-2 text-right text-slate-700">{formatCurrency(e.hours * e.rate)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="ml-auto mt-4 w-56 space-y-1 text-sm">
        <div className="flex justify-between text-slate-500">
          <span>Subtotal</span>
          <span>{formatCurrency(subtotal)}</span>
        </div>
        {invoice.taxRate > 0 && (
          <div className="flex justify-between text-slate-500">
            <span>Tax ({invoice.taxRate}%)</span>
            <span>{formatCurrency(tax)}</span>
          </div>
        )}
        <div className="flex justify-between border-t border-slate-200 pt-1 text-base font-semibold text-slate-800">
          <span>Total</span>
          <span>{formatCurrency(total)}</span>
        </div>
      </div>

      {invoice.notes && (
        <div className="mt-4 border-t border-slate-100 pt-3 text-sm text-slate-500">
          <p className="mb-1 font-medium text-slate-600">Notes</p>
          <p className="whitespace-pre-line">{invoice.notes}</p>
        </div>
      )}
    </Card>
  );
}
