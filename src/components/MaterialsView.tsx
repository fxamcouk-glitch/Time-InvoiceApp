import { useMemo, useRef, useState } from 'react';
import { formatCurrency, formatDayHeading, today } from '../lib/format';
import { newId } from '../lib/id';
import type { OcrProgress } from '../lib/ocr';
import { compressPhoto, deletePhoto, savePhoto } from '../lib/photos';
import { describeReceipt } from '../lib/receipt';
import { scanReceipt } from '../lib/scan';
import type { Client, MaterialEntry } from '../types';
import type { CropRect } from '../lib/crop';
import { CameraIcon, ChevronRightIcon } from './icons';
import { ReceiptCropper } from './ReceiptCropper';
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

/** What the scan read, waiting for the user to check and approve it before it goes into the entry. */
interface ScanReview {
  amount: string;
  description: string;
  date: string;
  found: { amount: boolean; description: boolean; date: boolean };
  /** Shown when the items read don't add up to the total, so some are probably missing or misread. */
  warning?: string;
}

function textareaRows(text: string): number {
  return Math.min(8, Math.max(2, text.split('\n').length + (text.includes('\n') ? 1 : 0)));
}

function ReadBadge({ found }: { found: boolean }) {
  return found ? <LabelBadge tone="green">Read from receipt</LabelBadge> : <LabelBadge tone="amber">Not found — enter by hand</LabelBadge>;
}

function scanLabel(progress: OcrProgress): string {
  if (progress.stage === 'loading') return 'Preparing scanner…';
  const pct = Math.round(progress.progress * 100);
  return progress.pass === 2 ? `Taking a second look… ${pct}%` : `Reading receipt… ${pct}%`;
}

export function MaterialsView({ clients, materials, onChange }: Props) {
  const [form, setForm] = useState(() => emptyForm(clients));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [filterClientId, setFilterClientId] = useState<string>('all');
  const [scan, setScan] = useState<ScanState>({ status: 'idle' });
  const [photo, setPhoto] = useState<PhotoSource>(null);
  const [review, setReview] = useState<ScanReview | null>(null);
  /** A freshly chosen photo waiting for the user to mark the receipt area. */
  const [cropping, setCropping] = useState<Blob | null>(null);
  const [viewingPhoto, setViewingPhoto] = useState<PhotoSource>(null);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const clientMap = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);

  function openNew() {
    setForm(emptyForm(clients));
    setEditingId(null);
    setScan({ status: 'idle' });
    setPhoto(null);
    setReview(null);
    setCropping(null);
    setSheetOpen(true);
  }

  function closeSheet() {
    setSheetOpen(false);
    setForm(emptyForm(clients));
    setEditingId(null);
    setScan({ status: 'idle' });
    setPhoto(null);
    setReview(null);
    setCropping(null);
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
    setReview(null);
    setCropping(null);
    setSheetOpen(true);
  }

  function handleReceiptPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setScan({ status: 'idle' });
    setCropping(file);
  }

  async function scanCropped(file: Blob, crop: CropRect | null) {
    setCropping(null);

    // Keep the (cropped) photo with the entry regardless of how the scan goes.
    compressPhoto(file, crop)
      .then((blob) => setPhoto(blob))
      .catch((err) => console.error(err));

    setScan({ status: 'working', progress: { stage: 'loading', progress: 0 } });
    try {
      const { parsed } = await scanReceipt(file, (progress) => setScan({ status: 'working', progress }), crop);
      const description = describeReceipt(parsed);
      // Hand the results to the user to check against the photo; nothing goes into the entry until they approve.
      setReview({
        amount: parsed.amount !== undefined ? parsed.amount.toFixed(2) : form.amount,
        description: description && !form.description.trim() ? description : form.description,
        date: parsed.date ?? form.date,
        found: { amount: parsed.amount !== undefined, description: !!description, date: !!parsed.date },
        warning:
          parsed.items.length > 0 && !parsed.itemsMatchTotal
            ? "The items read don't add up to the total, so some may be missing or misread."
            : parsed.items.length === 0
              ? "Couldn't pick out the individual items — add them to the description if you want them on the invoice."
              : undefined,
      });
      setScan({ status: 'idle' });
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

  function approveReview() {
    if (!review) return;
    setForm((current) => ({
      ...current,
      amount: review.amount,
      description: review.description,
      date: review.date || current.date,
    }));
    setReview(null);
    setScan({ status: 'done', message: `Receipt details added. Check everything, then tap ${editingId ? 'Save changes' : 'Add material'}.` });
  }

  function discardReview() {
    setReview(null);
    setScan({ status: 'idle' });
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
        // Keyed so the sheet remounts (and scrolls back to the top) when switching between the review and the form.
        <Sheet
          key={cropping ? 'crop' : review ? 'review' : 'form'}
          title={cropping ? 'Crop the receipt' : review ? 'Check the scan' : editingId ? 'Edit material' : 'Log material'}
          onClose={closeSheet}
        >
          {cropping ? (
            <ReceiptCropper file={cropping} onConfirm={(crop) => scanCropped(cropping, crop)} onCancel={() => setCropping(null)} />
          ) : review ? (
            <div className="flex flex-col gap-3" data-testid="scan-review">
              <p className="text-sm text-slate-500">
                Compare what was read with the receipt and correct anything that is wrong. Nothing is saved yet.
              </p>
              <ReceiptThumb source={photo} fit="contain" className="h-48 w-full bg-slate-100" onClick={() => setViewingPhoto(photo)} />
              <p className="-mt-2 text-center text-xs text-slate-400">Tap the photo to enlarge</p>
              <Field
                label={
                  <span className="flex flex-wrap items-center gap-2">
                    Cost (£) <ReadBadge found={review.found.amount} />
                  </span>
                }
              >
                <Input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={review.amount}
                  onChange={(e) => setReview({ ...review, amount: e.target.value })}
                  autoFocus={!review.found.amount}
                />
              </Field>
              <Field
                label={
                  <span className="flex flex-wrap items-center gap-2">
                    Description <ReadBadge found={review.found.description} />
                  </span>
                }
              >
                {review.warning && <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700">{review.warning}</p>}
                <Textarea
                  rows={textareaRows(review.description)}
                  value={review.description}
                  onChange={(e) => setReview({ ...review, description: e.target.value })}
                  placeholder="Petrol, timber, screws, etc."
                />
              </Field>
              <Field
                label={
                  <span className="flex flex-wrap items-center gap-2">
                    Date <ReadBadge found={review.found.date} />
                  </span>
                }
              >
                <Input type="date" value={review.date} onChange={(e) => setReview({ ...review, date: e.target.value })} />
              </Field>
              <Button type="button" onClick={approveReview} className="mt-1 w-full" disabled={!(Number(review.amount) > 0)}>
                Use these details
              </Button>
              <Button type="button" variant="secondary" onClick={discardReview} className="w-full">
                Discard scan
              </Button>
            </div>
          ) : (
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
                  rows={textareaRows(form.description)}
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
          )}
        </Sheet>
      )}

      {viewingPhoto && <ReceiptViewer source={viewingPhoto} onClose={() => setViewingPhoto(null)} />}
    </div>
  );
}
