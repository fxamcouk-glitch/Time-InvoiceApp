import { useState } from 'react';
import { getCurrentPosition, reverseGeocode } from '../lib/geo';
import { newId } from '../lib/id';
import type { Client } from '../types';
import { Button, Card, EmptyState, Field, Input, Textarea } from './ui';

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
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  function resetForm() {
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
    resetForm();
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
  }

  function remove(id: string) {
    if (!confirm('Delete this client? Their time entries and invoices will be kept but unlinked.')) return;
    onChange(clients.filter((c) => c.id !== id));
    if (editingId === id) resetForm();
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <Card className="p-5 lg:col-span-1 h-fit">
        <h2 className="mb-4 text-sm font-semibold text-slate-800">{editingId ? 'Edit client' : 'New client'}</h2>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <Field label="Name">
            <Input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Acme Corp"
            />
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
              placeholder="123 Main St&#10;Springfield, USA"
            />
          </Field>
          <div>
            <Button type="button" variant="secondary" onClick={handleUseLocation} disabled={locating} className="w-full">
              📍 {locating ? 'Finding your location…' : 'Use my location'}
            </Button>
            {locationError && <p className="mt-1.5 text-xs text-red-600">{locationError}</p>}
            {form.lat != null && !locationError && (
              <p className="mt-1.5 flex items-center gap-2 text-xs text-slate-500">
                📍 Location saved for distance matching
                <button type="button" onClick={clearLocation} className="font-medium text-indigo-600 hover:underline">
                  Clear
                </button>
              </p>
            )}
          </div>
          <Field label="Default hourly rate ($)">
            <Input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={form.hourlyRate}
              onChange={(e) => setForm({ ...form, hourlyRate: e.target.value })}
              placeholder="75"
            />
          </Field>
          <div className="mt-1 flex gap-2">
            <Button type="submit">{editingId ? 'Save changes' : 'Add client'}</Button>
            {editingId && (
              <Button type="button" variant="secondary" onClick={resetForm}>
                Cancel
              </Button>
            )}
          </div>
        </form>
      </Card>

      <Card className="lg:col-span-2">
        {clients.length === 0 ? (
          <EmptyState title="No clients yet" description="Add a client to start tracking hours against them." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {clients.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-4 px-5 py-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-800">{c.name}</p>
                  <p className="truncate text-xs text-slate-400">{c.email || 'No email on file'}</p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  {c.lat != null && <span title="Location saved">📍</span>}
                  <span className="text-sm text-slate-500">${c.hourlyRate.toFixed(2)}/hr</span>
                  <Button variant="ghost" onClick={() => edit(c)}>
                    Edit
                  </Button>
                  <Button variant="danger" onClick={() => remove(c.id)}>
                    Delete
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
