/**
 * Receipt photos live in IndexedDB (localStorage is far too small for images),
 * keyed by the material entry's id. Photos are compressed before saving so a
 * typical receipt is well under 200 KB.
 */
import { cropToPixels } from './crop';
import type { CropRect } from './crop';

const DB_NAME = 'hti-photos';
const STORE = 'photos';
const MAX_SIDE = 1400;
const JPEG_QUALITY = 0.72;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('Could not open photo storage.'));
    }).catch((err) => {
      dbPromise = null;
      throw err;
    }) as Promise<IDBDatabase>;
  }
  return dbPromise;
}

function run<T>(mode: IDBTransactionMode, op: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const request = op(tx.objectStore(STORE));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error('Photo storage failed.'));
      }),
  );
}

export function savePhoto(id: string, blob: Blob): Promise<void> {
  return run('readwrite', (store) => store.put(blob, id)).then(() => undefined);
}

export function getPhoto(id: string): Promise<Blob | undefined> {
  return run<Blob | undefined>('readonly', (store) => store.get(id));
}

export function deletePhoto(id: string): Promise<void> {
  return run('readwrite', (store) => store.delete(id)).then(() => undefined);
}

function loadImage(file: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not read that photo.'));
    image.src = url;
  }).finally(() => URL.revokeObjectURL(url));
}

/** Downscales a camera photo and re-encodes it as JPEG so it is small enough to keep on the phone. */
export async function compressPhoto(file: Blob, crop?: CropRect | null): Promise<Blob> {
  const img = await loadImage(file);
  const { sx, sy, sw, sh } = crop ? cropToPixels(crop, img.naturalWidth, img.naturalHeight) : { sx: 0, sy: 0, sw: img.naturalWidth, sh: img.naturalHeight };
  const scale = Math.min(1, MAX_SIDE / Math.max(sw, sh));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(sw * scale));
  canvas.height = Math.max(1, Math.round(sh * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not process that photo.');
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not compress that photo.'))), 'image/jpeg', JPEG_QUALITY);
  });
}
