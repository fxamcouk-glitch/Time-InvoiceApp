import { useMemo, useState } from 'react';
import { formatCurrency, today } from '../lib/format';
import { newId } from '../lib/id';
import type { Client, MaterialEntry } from '../types';
import { Button, Card, EmptyState, Field, Input, LabelBadge, Select, Textarea } from './ui';

interface Props {
  clients: Client[];
  materials: MaterialEntry[];
  onChange: (materials: MaterialEntry[]) => void;
}

function emptyForm(clients: Client[]) {
  return { clientId: clients[0]?.id ?? '', date: today(), description: '', amount: '' };
}

export function MaterialsView({ clients, materials, onChange }: Props) {
  const [form, setForm] = useState(() => emptyForm(clients));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filterClientId, setFilterClientId] = useState<string>('all');

  const clientMap = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);

  function resetForm() {
    setForm(emptyForm(clients));
    setEditingId(null);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const amount = Number(form.amount);
    if (!form.clientId || !amount || amount <= 0) return;

    if (editingId) {
      onChange(
        materials.map((m) =>
          m.id === editingId
            ? { ...m, clientId: form.clientId, date: form.date, description: form.description.trim(), amount }
            : m,
        ),
      );
    } else {
      const material: MaterialEntry = {
        id: newId(),
        clientId: form.clientId,
        date: form.date,
        description: form.description.trim(),
        amount,
        invoiceId: null,
      };
      onChange([material, ...materials]);
    }
    resetForm();
  }

  function edit(material: MaterialEntry) {
    setEditingId(material.id);
    setForm({
      clientId: material.clientId,
      date: material.date,
      description: material.description,
      amount: String(material.amount),
    });
  }

  function remove(id: string) {
    onChange(materials.filter((m) => m.id !== id));
    if (editingId === id) resetForm();
  }

  const visibleMaterials = materials
    .filter((m) => filterClientId === 'all' || m.clientId === filterClientId)
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  const unbilledTotal = visibleMaterials.filter((m) => !m.invoiceId).reduce((sum, m) => sum + m.amount, 0);

  if (clients.length === 0) {
    return <EmptyState title="Add a client first" description="You need at least one client before logging materials." />;
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <Card className="p-5 lg:col-span-1 h-fit">
        <h2 className="mb-4 text-sm font-semibold text-slate-800">{editingId ? 'Edit material' : 'Log material'}</h2>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <Field label="Client">
            <Select value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })} required>
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
              placeholder="Petrol, timber, screws, etc."
            />
          </Field>
          <Field label="Cost (£)">
            <Input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              required
            />
          </Field>
          <div className="mt-1 flex gap-2">
            <Button type="submit">{editingId ? 'Save changes' : 'Add material'}</Button>
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
          <Select value={filterClientId} onChange={(e) => setFilterClientId(e.target.value)} className="w-40 sm:w-48">
            <option value="all">All clients</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <p className="text-sm text-slate-500">
            Unbilled: <span className="font-semibold text-slate-800">{formatCurrency(unbilledTotal)}</span>
          </p>
        </div>

        {visibleMaterials.length === 0 ? (
          <EmptyState title="No materials logged" description="Log your first material cost to see it here." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {visibleMaterials.map((material) => (
              <li key={material.id} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-slate-800">{clientMap.get(material.clientId)?.name ?? 'Unknown client'}</p>
                    {material.invoiceId ? <LabelBadge tone="blue">Invoiced</LabelBadge> : <LabelBadge tone="amber">Unbilled</LabelBadge>}
                  </div>
                  <p className="truncate text-xs text-slate-400">
                    {material.date} {material.description && `· ${material.description}`}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3 sm:shrink-0">
                  <span className="text-sm font-medium text-slate-700">{formatCurrency(material.amount)}</span>
                  {!material.invoiceId && (
                    <>
                      <Button variant="ghost" onClick={() => edit(material)}>
                        Edit
                      </Button>
                      <Button variant="danger" onClick={() => remove(material.id)}>
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
