import { useMemo, useState } from 'react';
import { addDays, formatCurrency, formatDate, today } from '../lib/format';
import { newId } from '../lib/id';
import { generateInvoicePdf } from '../lib/pdf';
import type { BusinessInfo, Client, Invoice, InvoiceStatus, MaterialEntry, TimeEntry } from '../types';
import { Button, Card, EmptyState, Field, Input, LabelBadge, Select, Textarea } from './ui';

interface Props {
  clients: Client[];
  entries: TimeEntry[];
  materials: MaterialEntry[];
  invoices: Invoice[];
  business: BusinessInfo;
  onEntriesChange: (entries: TimeEntry[]) => void;
  onMaterialsChange: (materials: MaterialEntry[]) => void;
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

export function InvoicesView({
  clients,
  entries,
  materials,
  invoices,
  business,
  onEntriesChange,
  onMaterialsChange,
  onInvoicesChange,
}: Props) {
  const clientMap = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);
  const [creatingClientId, setCreatingClientId] = useState(clients[0]?.id ?? '');
  const [selectedEntryIds, setSelectedEntryIds] = useState<Set<string>>(new Set());
  const [selectedMaterialIds, setSelectedMaterialIds] = useState<Set<string>>(new Set());
  const [taxRate, setTaxRate] = useState('0');
  const [notes, setNotes] = useState('');
  const [dueInDays, setDueInDays] = useState('14');
  const [viewingId, setViewingId] = useState<string | null>(null);

  const unbilledForClient = entries.filter((e) => e.clientId === creatingClientId && !e.invoiceId);
  const unbilledMaterialsForClient = materials.filter((m) => m.clientId === creatingClientId && !m.invoiceId);

  function toggleEntry(id: string) {
    setSelectedEntryIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleMaterial(id: string) {
    setSelectedMaterialIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelectedEntryIds(new Set(unbilledForClient.map((e) => e.id)));
  }

  function selectAllMaterials() {
    setSelectedMaterialIds(new Set(unbilledMaterialsForClient.map((m) => m.id)));
  }

  function createInvoice() {
    const entryIds = [...selectedEntryIds].filter((id) => unbilledForClient.some((e) => e.id === id));
    const materialIds = [...selectedMaterialIds].filter((id) => unbilledMaterialsForClient.some((m) => m.id === id));
    if (!creatingClientId || (entryIds.length === 0 && materialIds.length === 0)) return;
    const issueDate = today();
    const invoice: Invoice = {
      id: newId(),
      number: nextInvoiceNumber(invoices),
      clientId: creatingClientId,
      issueDate,
      dueDate: addDays(issueDate, Number(dueInDays) || 0),
      entryIds,
      materialIds,
      taxRate: Number(taxRate) || 0,
      notes: notes.trim(),
      status: 'draft',
    };
    onInvoicesChange([invoice, ...invoices]);
    onEntriesChange(entries.map((e) => (entryIds.includes(e.id) ? { ...e, invoiceId: invoice.id } : e)));
    onMaterialsChange(materials.map((m) => (materialIds.includes(m.id) ? { ...m, invoiceId: invoice.id } : m)));
    setSelectedEntryIds(new Set());
    setSelectedMaterialIds(new Set());
    setNotes('');
    setViewingId(invoice.id);
  }

  function deleteInvoice(id: string) {
    if (!confirm('Delete this invoice? Its time entries and materials will become unbilled again.')) return;
    onEntriesChange(entries.map((e) => (e.invoiceId === id ? { ...e, invoiceId: null } : e)));
    onMaterialsChange(materials.map((m) => (m.invoiceId === id ? { ...m, invoiceId: null } : m)));
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
    const invoiceMaterials = materials.filter((m) => (invoice.materialIds ?? []).includes(m.id));
    const doc = generateInvoicePdf(invoice, client, invoiceEntries, invoiceMaterials, business);
    doc.save(`${invoice.number}.pdf`);
  }

  const viewingInvoice = invoices.find((i) => i.id === viewingId) ?? null;
  const selectedCount = selectedEntryIds.size + selectedMaterialIds.size;

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
                  setSelectedMaterialIds(new Set());
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
                <span className="text-sm font-medium text-slate-700">Unbilled hours</span>
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

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-sm font-medium text-slate-700">Unbilled materials</span>
                {unbilledMaterialsForClient.length > 0 && (
                  <button type="button" onClick={selectAllMaterials} className="text-xs font-medium text-indigo-600 hover:underline">
                    Select all
                  </button>
                )}
              </div>
              {unbilledMaterialsForClient.length === 0 ? (
                <p className="text-sm text-slate-400">No unbilled materials for this client.</p>
              ) : (
                <ul className="max-h-56 divide-y divide-slate-100 overflow-y-auto rounded-md border border-slate-200">
                  {unbilledMaterialsForClient.map((material) => (
                    <li key={material.id} className="flex items-center gap-3 px-2.5 py-3 text-sm">
                      <input
                        type="checkbox"
                        checked={selectedMaterialIds.has(material.id)}
                        onChange={() => toggleMaterial(material.id)}
                        className="h-5 w-5 shrink-0 rounded border-slate-300 text-indigo-600"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-slate-700">{material.description || material.date}</p>
                        <p className="text-xs text-slate-400">{material.date}</p>
                      </div>
                      <span className="shrink-0 text-slate-500">{formatCurrency(material.amount)}</span>
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

            <Button type="button" disabled={selectedCount === 0} onClick={createInvoice} className="mt-1">
              Create invoice ({selectedCount} {selectedCount === 1 ? 'item' : 'items'})
            </Button>
          </div>
        )}
      </Card>

      <div className="flex flex-col gap-6 lg:col-span-2">
        <Card>
          {invoices.length === 0 ? (
            <EmptyState title="No invoices yet" description="Select unbilled hours or materials on the left to create your first invoice." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {invoices.map((inv) => {
                const invoiceEntries = entries.filter((e) => inv.entryIds.includes(e.id));
                const invoiceMaterials = materials.filter((m) => (inv.materialIds ?? []).includes(m.id));
                const subtotal =
                  invoiceEntries.reduce((sum, e) => sum + e.hours * e.rate, 0) +
                  invoiceMaterials.reduce((sum, m) => sum + m.amount, 0);
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
            materials={materials.filter((m) => (viewingInvoice.materialIds ?? []).includes(m.id))}
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
  materials,
  onStatusChange,
  onDelete,
  onDownload,
}: {
  invoice: Invoice;
  client: Client | null;
  entries: TimeEntry[];
  materials: MaterialEntry[];
  onStatusChange: (status: InvoiceStatus) => void;
  onDelete: () => void;
  onDownload: () => void;
}) {
  const timeSubtotal = entries.reduce((sum, e) => sum + e.hours * e.rate, 0);
  const materialsSubtotal = materials.reduce((sum, m) => sum + m.amount, 0);
  const subtotal = timeSubtotal + materialsSubtotal;
  const tax = subtotal * (invoice.taxRate / 100);
  const total = subtotal + tax;

  return (
    <Card className="p-6">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold text-slate-800">{invoice.number}</h3>
          <p className="text-sm text-slate-500">
            {client?.name ?? 'Unknown client'} · Issued {formatDate(invoice.issueDate)} · Due {formatDate(invoice.dueDate)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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

      {entries.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-left text-sm">
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
        </div>
      )}

      {materials.length > 0 && (
        <div className={`overflow-x-auto ${entries.length > 0 ? 'mt-4' : ''}`}>
          <table className="w-full min-w-[360px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
                <th className="py-2 font-medium">Date</th>
                <th className="py-2 font-medium">Materials</th>
                <th className="py-2 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {materials.map((m) => (
                <tr key={m.id}>
                  <td className="py-2 text-slate-600">{formatDate(m.date)}</td>
                  <td className="py-2 text-slate-600">{m.description || '—'}</td>
                  <td className="py-2 text-right text-slate-700">{formatCurrency(m.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

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
