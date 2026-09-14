import { useState } from 'react';
import { formatCurrency } from '../lib/format';
import { getCurrentPosition, reverseGeocode } from '../lib/geo';
import { newId } from '../lib/id';
import type { Client } from '../types';
import { ChevronRightIcon, PinIcon } from './icons';
import { Sheet } from './Sheet';
import { AddButton, Button, Card, EmptyState, Field, Input, Textarea } from './ui';

interface Props {
  clients: Client[];
  onChange: (clients: Client[]) => void;
}

const emptyForm: { name: string; email: string; address: string; hourlyRate: string; lat?: number; lng?: number } = {
  name: '',
  email: '',
  address: '',
  hourlyRate: '',
};

export function ClientsView({ clients, onChange }: Props) {
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  function openNew() {
    setForm(emptyForm);
    setEditingId(null);
    setLocationError(null);
    setSheetOpen(true);
  }

  function closeSheet() {
    setSheetOpen(false);
    setForm(emptyForm);
    setEditingId(null);
    setLocating(false);
    setLocationError(null);
  }

  async function handleUseLocation() {
    setLocating(true);
    setLocationError(null);
    try {
      const pos = await getCurrentPosition();
      const address = await reverseGeocode(pos).catch(() => `${pos.lat.toFixed(5)}, ${pos.lng.toFixed(5)}`);
      setForm((f) => ({ ...f, address, lat: pos.lat, lng: pos.lng }));
    } catch (err) {
      setLocationError(err instanceof Error ? err.message : 'Could not get your location.');
    } finally {
      setLocating(false);
    }
  }

  function clearLocation() {
    setForm((f) => ({ ...f, lat: undefined, lng: undefined }));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    const rate = Number(form.hourlyRate) || 0;

    if (editingId) {
      onChange(
        clients.map((c) =>
          c.id === editingId
            ? {
                ...c,
                name: form.name.trim(),
                email: form.email.trim(),
                address: form.address.trim(),
                hourlyRate: rate,
                lat: form.lat,
                lng: form.lng,
              }
            : c,
        ),
      );
    } else {
      const client: Client = {
        id: newId(),
        name: form.name.trim(),
        email: form.email.trim(),
        address: form.address.trim(),
        hourlyRate: rate,
        lat: form.lat,
        lng: form.lng,
      };
      onChange([...clients, client]);
    }
    closeSheet();
  }

  function edit(client: Client) {
    setEditingId(client.id);
    setForm({
      name: client.name,
      email: client.email,
      address: client.address,
      hourlyRate: String(client.hourlyRate),
      lat: client.lat,
      lng: client.lng,
    });
    setLocationError(null);
    setSheetOpen(true);
  }

  function remove(id: string) {
    if (!confirm('Delete this client? Their time entries and invoices will be kept but unlinked.')) return;
    onChange(clients.filter((c) => c.id !== id));
    closeSheet();
  }

  const sortedClients = [...clients].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="mx-auto max-w-3xl">
      <Card>
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 sm:px-5">
          <p className="text-sm text-slate-500">
            {clients.length} {clients.length === 1 ? 'client' : 'clients'}
          </p>
          <AddButton label="New client" onClick={openNew} />
        </div>

        {sortedClients.length === 0 ? (
          <EmptyState title="No clients yet" description="Tap + to add your first client." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {sortedClients.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => edit(c)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 active:bg-slate-100 sm:px-5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 truncate text-base font-medium text-slate-800 sm:text-sm">
                      <span className="truncate">{c.name}</span>
                      {c.lat != null && <PinIcon className="h-3.5 w-3.5 shrink-0 text-slate-400" />}
                    </p>
                    <p className="truncate text-sm text-slate-500 sm:text-xs">{c.email || 'No email on file'}</p>
                  </div>
                  <span className="shrink-0 text-sm text-slate-500">{formatCurrency(c.hourlyRate)}/hr</span>
                  <ChevronRightIcon className="h-5 w-5 shrink-0 text-slate-300" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {sheetOpen && (
        <Sheet title={editingId ? 'Edit client' : 'New client'} onClose={closeSheet}>
          <form onSubmit={submit} className="flex flex-col gap-3">
            <Field label="Name">
              <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Acme Corp" />
            </Field>
            <Field label="Email">
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="billing@acme.com"
              />
            </Field>
            <Field label="Address">
              <Textarea
                rows={3}
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value, lat: undefined, lng: undefined })}
                placeholder="123 Main St&#10;Springfield"
              />
            </Field>
            <div>
              <Button type="button" variant="secondary" onClick={handleUseLocation} disabled={locating} className="w-full">
                <PinIcon className="h-4 w-4" />
                {locating ? 'Finding your location…' : 'Use my location'}
              </Button>
              {locationError && <p className="mt-1.5 text-xs text-red-600">{locationError}</p>}
              {form.lat != null && !locationError && (
                <p className="mt-1.5 flex items-center gap-2 text-xs text-slate-500">
                  <PinIcon className="h-3 w-3 shrink-0" />
                  Location saved for distance matching
                  <button type="button" onClick={clearLocation} className="font-medium text-indigo-600 hover:underline">
                    Clear
                  </button>
                </p>
              )}
            </div>
            <Field label="Default hourly rate (£)">
              <Input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={form.hourlyRate}
                onChange={(e) => setForm({ ...form, hourlyRate: e.target.value })}
                placeholder="25"
              />
            </Field>
            <Button type="submit" className="mt-1 w-full">
              {editingId ? 'Save changes' : 'Add client'}
            </Button>
            {editingId && (
              <Button type="button" variant="danger" onClick={() => remove(editingId)} className="w-full">
                Delete client
              </Button>
            )}
          </form>
        </Sheet>
      )}
    </div>
  );
}
