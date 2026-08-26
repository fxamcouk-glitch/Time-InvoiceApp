import { useMemo, useState } from 'react';
import { today } from '../lib/format';
import { newId } from '../lib/id';
import type { Client, TimeEntry } from '../types';
import type { Granularity } from './PeriodRollup';
import { PeriodRollup } from './PeriodRollup';
import { Button, Card, EmptyState, Field, Input, Select, Textarea, LabelBadge } from './ui';

interface Props {
  clients: Client[];
  entries: TimeEntry[];
  onChange: (entries: TimeEntry[]) => void;
}

type ViewMode = 'list' | Granularity;

const VIEW_MODES: { id: ViewMode; label: string }[] = [
  { id: 'list', label: 'List' },
  { id: 'day', label: 'Days' },
  { id: 'week', label: 'Weeks' },
  { id: 'month', label: 'Months' },
];

function emptyForm(clients: Client[]) {
  const first = clients[0];
  return {
    clientId: first?.id ?? '',
    date: today(),
    description: '',
    hours: '',
    rate: first ? String(first.hourlyRate) : '',
  };
}

export function TimeTracker({ clients, entries, onChange }: Props) {
  const [form, setForm] = useState(() => emptyForm(clients));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filterClientId, setFilterClientId] = useState<string>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('list');

  const clientMap = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);

  function resetForm() {
    setForm(emptyForm(clients));
    setEditingId(null);
  }

  function handleClientChange(clientId: string) {
    const client = clientMap.get(clientId);
    setForm((f) => ({ ...f, clientId, rate: editingId ? f.rate : client ? String(client.hourlyRate) : f.rate }));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const hours = Number(form.hours);
    const rate = Number(form.rate);
    if (!form.clientId || !hours || hours <= 0) return;

    if (editingId) {
      onChange(
        entries.map((entry) =>
          entry.id === editingId
            ? { ...entry, clientId: form.clientId, date: form.date, description: form.description.trim(), hours, rate }
            : entry,
        ),
      );
    } else {
      const entry: TimeEntry = {
        id: newId(),
        clientId: form.clientId,
        date: form.date,
        description: form.description.trim(),
        hours,
        rate,
        invoiceId: null,
      };
      onChange([entry, ...entries]);
    }
    resetForm();
  }

  function edit(entry: TimeEntry) {
    setEditingId(entry.id);
    setForm({
      clientId: entry.clientId,
      date: entry.date,
      description: entry.description,
      hours: String(entry.hours),
      rate: String(entry.rate),
    });
  }

  function remove(id: string) {
    onChange(entries.filter((e) => e.id !== id));
    if (editingId === id) resetForm();
  }

  const visibleEntries = entries
    .filter((e) => filterClientId === 'all' || e.clientId === filterClientId)
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  const unbilledTotal = visibleEntries.filter((e) => !e.invoiceId).reduce((sum, e) => sum + e.hours * e.rate, 0);

  if (clients.length === 0) {
    return <EmptyState title="Add a client first" description="You need at least one client before logging hours." />;
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <Card className="p-5 lg:col-span-1 h-fit">
        <h2 className="mb-4 text-sm font-semibold text-slate-800">{editingId ? 'Edit entry' : 'Log time'}</h2>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <Field label="Client">
            <Select value={form.clientId} onChange={(e) => handleClientChange(e.target.value)} required>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Date">
            <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
          </Field>
          <Field label="Description">
            <Textarea
              rows={2}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="What did you work on?"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Hours">
              <Input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.25"
                value={form.hours}
                onChange={(e) => setForm({ ...form, hours: e.target.value })}
                required
              />
            </Field>
            <Field label="Rate ($/hr)">
              <Input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={form.rate}
                onChange={(e) => setForm({ ...form, rate: e.target.value })}
                required
              />
            </Field>
          </div>
          <div className="mt-1 flex gap-2">
            <Button type="submit">{editingId ? 'Save changes' : 'Add entry'}</Button>
            {editingId && (
              <Button type="button" variant="secondary" onClick={resetForm}>
                Cancel
              </Button>
            )}
          </div>
        </form>
      </Card>

      <Card className="lg:col-span-2">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
          <div className="flex flex-wrap items-center gap-3">
            <Select value={filterClientId} onChange={(e) => setFilterClientId(e.target.value)} className="w-40 sm:w-48">
              <option value="all">All clients</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
            <div className="flex rounded-md border border-slate-300 p-0.5">
              {VIEW_MODES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setViewMode(m.id)}
                  className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                    viewMode === m.id ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
          {viewMode === 'list' && (
            <p className="text-sm text-slate-500">
              Unbilled: <span className="font-semibold text-slate-800">${unbilledTotal.toFixed(2)}</span>
            </p>
          )}
        </div>

        {viewMode !== 'list' ? (
          <PeriodRollup entries={visibleEntries} clients={clients} granularity={viewMode} />
        ) : visibleEntries.length === 0 ? (
          <EmptyState title="No time entries" description="Log your first entry to see it here." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {visibleEntries.map((entry) => (
              <li key={entry.id} className="flex items-center justify-between gap-4 px-5 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-slate-800">{clientMap.get(entry.clientId)?.name ?? 'Unknown client'}</p>
                    {entry.invoiceId ? <LabelBadge tone="blue">Invoiced</LabelBadge> : <LabelBadge tone="amber">Unbilled</LabelBadge>}
                  </div>
                  <p className="truncate text-xs text-slate-400">
                    {entry.date} {entry.description && `· ${entry.description}`}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="text-sm text-slate-600">
                    {entry.hours}h &times; ${entry.rate.toFixed(2)} = <span className="font-medium">${(entry.hours * entry.rate).toFixed(2)}</span>
                  </span>
                  {!entry.invoiceId && (
                    <>
                      <Button variant="ghost" onClick={() => edit(entry)}>
                        Edit
                      </Button>
                      <Button variant="danger" onClick={() => remove(entry.id)}>
                        Delete
                      </Button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
