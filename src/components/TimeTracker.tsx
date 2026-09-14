import { useEffect, useMemo, useState } from 'react';
import { formatCurrency, formatDayHeading, today } from '../lib/format';
import { distanceMeters, geocodeAddress, getCurrentPosition, reverseGeocode, sleep } from '../lib/geo';
import { newId } from '../lib/id';
import type { Client, EntryLocation, TimeEntry } from '../types';
import { ChevronRightIcon, PinIcon } from './icons';
import type { Granularity } from './PeriodRollup';
import { PeriodRollup } from './PeriodRollup';
import { Sheet } from './Sheet';
import { AddButton, Button, Card, EmptyState, Field, Input, LabelBadge, Select, Textarea } from './ui';

interface Props {
  clients: Client[];
  entries: TimeEntry[];
  onChange: (entries: TimeEntry[]) => void;
  onClientsChange: (clients: Client[]) => void;
  pendingEditEntryId?: string | null;
  onPendingEditHandled?: () => void;
}

type ViewMode = 'list' | Granularity;

const VIEW_MODES: { id: ViewMode; label: string }[] = [
  { id: 'list', label: 'List' },
  { id: 'day', label: 'Days' },
  { id: 'week', label: 'Weeks' },
  { id: 'month', label: 'Months' },
];

function formatDistance(meters: number): string {
  return meters < 1000 ? `${Math.round(meters)}m` : `${(meters / 1000).toFixed(1)}km`;
}

/** Geocodes any client addresses we haven't looked up yet, respecting Nominatim's ~1 req/sec limit. */
async function ensureClientCoords(clients: Client[]): Promise<Client[]> {
  let changed = false;
  const updated = [...clients];
  for (let i = 0; i < updated.length; i++) {
    const client = updated[i];
    if (client.lat != null && client.lng != null) continue;
    if (!client.address.trim()) continue;
    const coords = await geocodeAddress(client.address);
    if (coords) {
      updated[i] = { ...client, lat: coords.lat, lng: coords.lng };
      changed = true;
    }
    await sleep(1100);
  }
  return changed ? updated : clients;
}

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

export function TimeTracker({ clients, entries, onChange, onClientsChange, pendingEditEntryId, onPendingEditHandled }: Props) {
  const [form, setForm] = useState(() => emptyForm(clients));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [filterClientId, setFilterClientId] = useState<string>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('list');

  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [capturedLocation, setCapturedLocation] = useState<EntryLocation | null>(null);
  const [suggestion, setSuggestion] = useState<{ clientId: string; distance: number } | null>(null);

  const clientMap = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);

  function resetFormState() {
    setForm(emptyForm(clients));
    setEditingId(null);
    setLocating(false);
    setLocationError(null);
    setCapturedLocation(null);
    setSuggestion(null);
  }

  function openNew() {
    resetFormState();
    setSheetOpen(true);
  }

  function closeSheet() {
    setSheetOpen(false);
    resetFormState();
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
    setLocationError(null);
    setCapturedLocation(null);
    setSuggestion(null);
    setSheetOpen(true);
  }

  useEffect(() => {
    if (!pendingEditEntryId) return;
    const entry = entries.find((e) => e.id === pendingEditEntryId);
    if (entry) edit(entry);
    onPendingEditHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingEditEntryId]);

  function handleClientChange(clientId: string) {
    const client = clientMap.get(clientId);
    setForm((f) => ({ ...f, clientId, rate: editingId ? f.rate : client ? String(client.hourlyRate) : f.rate }));
  }

  async function handleUseLocation() {
    setLocating(true);
    setLocationError(null);
    setSuggestion(null);
    try {
      const pos = await getCurrentPosition();
      const address = await reverseGeocode(pos).catch(() => `${pos.lat.toFixed(5)}, ${pos.lng.toFixed(5)}`);
      setCapturedLocation({ ...pos, address });

      const updatedClients = await ensureClientCoords(clients);
      if (updatedClients !== clients) onClientsChange(updatedClients);

      let nearest: { clientId: string; distance: number } | null = null;
      for (const client of updatedClients) {
        if (client.lat == null || client.lng == null) continue;
        const distance = distanceMeters(pos, { lat: client.lat, lng: client.lng });
        if (!nearest || distance < nearest.distance) nearest = { clientId: client.id, distance };
      }
      if (nearest && nearest.distance <= 500 && nearest.clientId !== form.clientId) {
        setSuggestion(nearest);
      }
    } catch (err) {
      setLocationError(err instanceof Error ? err.message : 'Could not get your location.');
    } finally {
      setLocating(false);
    }
  }

  function applySuggestion() {
    if (!suggestion) return;
    handleClientChange(suggestion.clientId);
    setSuggestion(null);
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
            ? {
                ...entry,
                clientId: form.clientId,
                date: form.date,
                description: form.description.trim(),
                hours,
                rate,
                location: capturedLocation ?? entry.location,
              }
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
        location: capturedLocation ?? undefined,
      };
      onChange([entry, ...entries]);
    }
    closeSheet();
  }

  function remove(id: string) {
    if (!confirm('Delete this time entry?')) return;
    onChange(entries.filter((e) => e.id !== id));
    closeSheet();
  }

  const visibleEntries = entries
    .filter((e) => filterClientId === 'all' || e.clientId === filterClientId)
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  const unbilledTotal = visibleEntries.filter((e) => !e.invoiceId).reduce((sum, e) => sum + e.hours * e.rate, 0);

  const byDay: [string, TimeEntry[]][] = [];
  for (const entry of visibleEntries) {
    const last = byDay[byDay.length - 1];
    if (last && last[0] === entry.date) last[1].push(entry);
    else byDay.push([entry.date, [entry]]);
  }

  if (clients.length === 0) {
    return <EmptyState title="Add a client first" description="You need at least one client before logging hours." />;
  }

  return (
    <div className="mx-auto max-w-3xl">
      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-3 sm:px-5">
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
          {viewMode === 'list' && (
            <p className="text-sm text-slate-500">
              Unbilled <span className="font-semibold text-slate-800">{formatCurrency(unbilledTotal)}</span>
            </p>
          )}
          <div className="ml-auto">
            <AddButton label="Log time" onClick={openNew} />
          </div>
        </div>

        {viewMode !== 'list' ? (
          <PeriodRollup entries={visibleEntries} clients={clients} granularity={viewMode} />
        ) : visibleEntries.length === 0 ? (
          <EmptyState title="No time entries yet" description="Tap + to log your first one." />
        ) : (
          <div className="divide-y divide-slate-100">
            {byDay.map(([date, dayEntries]) => (
              <section key={date}>
                <h3 className="bg-slate-50 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 sm:px-5">
                  {formatDayHeading(date)}
                  <span className="font-normal normal-case"> · {dayEntries.reduce((sum, e) => sum + e.hours, 0)}h</span>
                </h3>
                <ul className="divide-y divide-slate-100">
                  {dayEntries.map((entry) => {
                    const content = (
                      <>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-base font-medium text-slate-800 sm:text-sm">
                            {clientMap.get(entry.clientId)?.name ?? 'Unknown client'}
                          </p>
                          {entry.description && <p className="truncate text-sm text-slate-500 sm:text-xs">{entry.description}</p>}
                          {entry.location && (
                            <p className="flex items-center gap-1 truncate text-xs text-slate-400">
                              <PinIcon className="h-3 w-3 shrink-0" />
                              <span className="truncate">{entry.location.address}</span>
                            </p>
                          )}
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-base font-medium text-slate-800 sm:text-sm">{formatCurrency(entry.hours * entry.rate)}</p>
                          <p className="text-xs text-slate-400">
                            {entry.hours}h &times; {formatCurrency(entry.rate)}
                          </p>
                        </div>
                      </>
                    );
                    return (
                      <li key={entry.id}>
                        {entry.invoiceId ? (
                          <div className="flex items-center gap-3 px-4 py-3 sm:px-5">
                            {content}
                            <LabelBadge tone="blue">Invoiced</LabelBadge>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => edit(entry)}
                            className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 active:bg-slate-100 sm:px-5"
                          >
                            {content}
                            <ChevronRightIcon className="h-5 w-5 shrink-0 text-slate-300" />
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}
      </Card>

      {sheetOpen && (
        <Sheet title={editingId ? 'Edit entry' : 'Log time'} onClose={closeSheet}>
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
              <Field label="Rate (£/hr)">
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
            <div>
              <Button type="button" variant="secondary" onClick={handleUseLocation} disabled={locating} className="w-full">
                <PinIcon className="h-4 w-4" />
                {locating ? 'Finding your location…' : 'Use my location'}
              </Button>
              {locationError && <p className="mt-1.5 text-xs text-red-600">{locationError}</p>}
              {capturedLocation && !locationError && (
                <p className="mt-1.5 flex items-center gap-1 truncate text-xs text-slate-500">
                  <PinIcon className="h-3 w-3 shrink-0" />
                  <span className="truncate">{capturedLocation.address}</span>
                </p>
              )}
              {suggestion && (
                <button type="button" onClick={applySuggestion} className="mt-1.5 text-xs font-medium text-indigo-600 hover:underline">
                  Near {clientMap.get(suggestion.clientId)?.name} ({formatDistance(suggestion.distance)}) — tap to use
                </button>
              )}
            </div>
            <Button type="submit" className="mt-1 w-full">
              {editingId ? 'Save changes' : 'Add entry'}
            </Button>
            {editingId && (
              <Button type="button" variant="danger" onClick={() => remove(editingId)} className="w-full">
                Delete entry
              </Button>
            )}
          </form>
        </Sheet>
      )}
    </div>
  );
}
