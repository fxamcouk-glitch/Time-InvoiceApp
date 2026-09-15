import { useMemo, useRef, useState } from 'react';
import { formatCurrency, formatDayHeading, today } from '../lib/format';
import { newId } from '../lib/id';
import { recognizeReceipt } from '../lib/ocr';
import type { OcrProgress } from '../lib/ocr';
import { compressPhoto, deletePhoto, savePhoto } from '../lib/photos';
import { parseReceipt } from '../lib/receipt';
import type { Client, MaterialEntry } from '../types';
import { CameraIcon, ChevronRightIcon } from './icons';
import { ReceiptThumb, ReceiptViewer } from './ReceiptPhoto';
import { Sheet } from './Sheet';
import { AddButton, Button, Card, EmptyState, Field, Input, LabelBadge, Select, Textarea } from './ui';

interface Props {
  clients: Client[];
  materials: MaterialEntry[];
  onChange: (materials: MaterialEntry[]) => void;
}

function emptyForm(clients: Client[]) {
  return { clientId: clients[0]?.id ?? '', date: today(), description: '', amount: '' };
}

type ScanState =
  | { status: 'idle' }
  | { status: 'working'; progress: OcrProgress }
  | { status: 'done'; message: string }
  | { status: 'error'; message: string };

/** The receipt photo attached to the entry being edited: a stored photo (material id), a new one (Blob), or none. */
type PhotoSource = string | Blob | null;

function scanLabel(progress: OcrProgress): string {
  if (progress.stage === 'loading') return 'Preparing scanner…';
  return `Reading receipt… ${Math.round(progress.progress * 100)}%`;
}

export function MaterialsView({ clients, materials, onChange }: Props) {
  const [form, setForm] = useState(() => emptyForm(clients));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [filterClientId, setFilterClientId] = useState<string>('all');
  const [scan, setScan] = useState<ScanState>({ status: 'idle' });
  const [photo, setPhoto] = useState<PhotoSource>(null);
  const [viewingPhoto, setViewingPhoto] = useState<PhotoSource>(null);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const clientMap = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);

  function openNew() {
    setForm(emptyForm(clients));
    setEditingId(null);
    setScan({ status: 'idle' });
    setPhoto(null);
    setSheetOpen(true);
  }

  function closeSheet() {
    setSheetOpen(false);
    setForm(emptyForm(clients));
    setEditingId(null);
    setScan({ status: 'idle' });
    setPhoto(null);
  }

  function edit(material: MaterialEntry) {
    setEditingId(material.id);
    setForm({
      clientId: material.clientId,
      date: material.date,
      description: material.description,
      amount: String(material.amount),
    });
    setScan({ status: 'idle' });
    setPhoto(material.hasPhoto ? material.id : null);
    setSheetOpen(true);
  }

  async function handleReceiptPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    // Keep the photo with the entry regardless of how the scan goes.
    compressPhoto(file)
      .then((blob) => setPhoto(blob))
      .catch((err) => console.error(err));

    setScan({ status: 'working', progress: { stage: 'loading', progress: 0 } });
    try {
      const text = await recognizeReceipt(file, (progress) => setScan({ status: 'working', progress }));
      const parsed = parseReceipt(text);
      const fillDescription = !!parsed.merchant && !form.description.trim();
      const found: string[] = [];
      if (parsed.amount !== undefined) found.push(formatCurrency(parsed.amount));
      if (fillDescription) found.push(parsed.merchant!);
      if (parsed.date) found.push(formatDayHeading(parsed.date));
      setForm((current) => ({
        ...current,
        amount: parsed.amount !== undefined ? parsed.amount.toFixed(2) : current.amount,
        description: fillDescription ? parsed.merchant! : current.description,
        date: parsed.date ?? current.date,
      }));
      setScan(
        found.length > 0
          ? { status: 'done', message: `Found ${found.join(' · ')}. Check the details before saving.` }
          : { status: 'error', message: "Couldn't read a total from that photo, but it's attached. Enter the cost by hand." },
      );
    } catch (err) {
      console.error(err);
      setScan({
        status: 'error',
        message: navigator.onLine
          ? "Couldn't scan that photo, but it's attached. Please enter the details by hand."
          : 'Scanning needs an internet connection the first time it is used. The photo is still attached.',
      });
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const amount = Number(form.amount);
    if (!form.clientId || !amount || amount <= 0 || saving) return;

    const id = editingId ?? newId();
    const existing = editingId ? materials.find((m) => m.id === editingId) : undefined;

    setSaving(true);
    let hasPhoto = existing?.hasPhoto ?? false;
    try {
      if (photo instanceof Blob) {
        await savePhoto(id, photo);
        hasPhoto = true;
      } else if (photo === null && existing?.hasPhoto) {
        await deletePhoto(id);
        hasPhoto = false;
      }
    } catch (err) {
      console.error(err);
      alert("The receipt photo couldn't be saved on this device, so the entry will be saved without it.");
    } finally {
      setSaving(false);
    }

    if (existing) {
      onChange(
        materials.map((m) =>
          m.id === id
            ? { ...m, clientId: form.clientId, date: form.date, description: form.description.trim(), amount, hasPhoto }
            : m,
        ),
      );
    } else {
      const material: MaterialEntry = {
        id,
        clientId: form.clientId,
        date: form.date,
        description: form.description.trim(),
        amount,
        invoiceId: null,
        hasPhoto,
      };
      onChange([material, ...materials]);
    }
    closeSheet();
  }

  function remove(id: string) {
    if (!confirm('Delete this material?')) return;
    deletePhoto(id).catch((err) => console.error(err));
    onChange(materials.filter((m) => m.id !== id));
    closeSheet();
  }

  const visibleMaterials = materials
    .filter((m) => filterClientId === 'all' || m.clientId === filterClientId)
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  const unbilledTotal = visibleMaterials.filter((m) => !m.invoiceId).reduce((sum, m) => sum + m.amount, 0);

  const byDay: [string, MaterialEntry[]][] = [];
  for (const material of visibleMaterials) {
    const last = byDay[byDay.length - 1];
    if (last && last[0] === material.date) last[1].push(material);
    else byDay.push([material.date, [material]]);
  }

  if (clients.length === 0) {
    return <EmptyState title="Add a client first" description="You need at least one client before logging materials." />;
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
          <p className="text-sm text-slate-500">
            Unbilled <span className="font-semibold text-slate-800">{formatCurrency(unbilledTotal)}</span>
          </p>
          <div className="ml-auto">
            <AddButton label="Log material" onClick={openNew} />
          </div>
        </div>

        {visibleMaterials.length === 0 ? (
          <EmptyState title="No materials logged yet" description="Tap + to log your first one." />
        ) : (
          <div className="divide-y divide-slate-100">
            {byDay.map(([date, dayMaterials]) => (
              <section key={date}>
                <h3 className="bg-slate-50 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 sm:px-5">
                  {formatDayHeading(date)}
                  <span className="font-normal normal-case">
                    {' '}
                    · {formatCurrency(dayMaterials.reduce((sum, m) => sum + m.amount, 0))}
                  </span>
                </h3>
                <ul className="divide-y divide-slate-100">
                  {dayMaterials.map((material) => {
                    const content = (
                      <>
                        {material.hasPhoto && <ReceiptThumb source={material.id} className="h-11 w-11 shrink-0" />}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-base font-medium text-slate-800 sm:text-sm">
                            {clientMap.get(material.clientId)?.name ?? 'Unknown client'}
                          </p>
                          {material.description && (
                            <p className="truncate text-sm text-slate-500 sm:text-xs">{material.description}</p>
                          )}
                        </div>
                        <p className="shrink-0 text-base font-medium text-slate-800 sm:text-sm">{formatCurrency(material.amount)}</p>
                      </>
                    );
                    return (
                      <li key={material.id}>
                        {material.invoiceId ? (
                          <div className="flex items-center gap-3 px-4 py-3 sm:px-5">
                            {content}
                            <LabelBadge tone="blue">Invoiced</LabelBadge>
                            {material.hasPhoto && (
                              <button
                                type="button"
                                onClick={() => setViewingPhoto(material.id)}
                                className="text-sm text-indigo-600"
                              >
                                Receipt
                              </button>
                            )}
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => edit(material)}
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
        <Sheet title={editingId ? 'Edit material' : 'Log material'} onClose={closeSheet}>
          <form onSubmit={submit} className="flex flex-col gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleReceiptPhoto}
              className="hidden"
              aria-label="Receipt photo"
            />
            <Button
              type="button"
              variant="secondary"
              onClick={() => fileInputRef.current?.click()}
              disabled={scan.status === 'working'}
              className="w-full"
            >
              <CameraIcon className="h-5 w-5" />
              {scan.status === 'working' ? scanLabel(scan.progress) : photo ? 'Scan a different receipt' : 'Scan receipt'}
            </Button>
            {scan.status === 'working' && (
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200" role="progressbar">
                <div
                  className="h-full rounded-full bg-indigo-500 transition-[width]"
                  style={{ width: `${Math.round((scan.progress.stage === 'recognizing' ? scan.progress.progress : 0.05) * 100)}%` }}
                />
              </div>
            )}
            {scan.status === 'done' && (
              <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700" role="status">
                {scan.message}
              </p>
            )}
            {scan.status === 'error' && (
              <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700" role="status">
                {scan.message}
              </p>
            )}
            {photo && (
              <div className="flex items-center gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2" data-testid="receipt-photo">
                <ReceiptThumb source={photo} className="h-14 w-14" onClick={() => setViewingPhoto(photo)} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-700">Receipt photo attached</p>
                  <p className="text-xs text-slate-500">Kept on this phone with the entry.</p>
                </div>
                <button type="button" onClick={() => setViewingPhoto(photo)} className="text-sm font-medium text-indigo-600">
                  View
                </button>
                <button type="button" onClick={() => setPhoto(null)} className="text-sm font-medium text-red-600">
                  Remove
                </button>
              </div>
            )}
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
            <Button type="submit" className="mt-1 w-full" disabled={saving}>
              {saving ? 'Saving…' : editingId ? 'Save changes' : 'Add material'}
            </Button>
            {editingId && (
              <Button type="button" variant="danger" onClick={() => remove(editingId)} className="w-full">
                Delete material
              </Button>
            )}
          </form>
        </Sheet>
      )}

      {viewingPhoto && <ReceiptViewer source={viewingPhoto} onClose={() => setViewingPhoto(null)} />}
    </div>
  );
}
