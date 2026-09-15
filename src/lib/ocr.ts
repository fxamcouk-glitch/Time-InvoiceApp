import type { Worker } from 'tesseract.js';
import { cropToPixels } from './crop';
import type { CropRect } from './crop';

/** Longest side the photo is scaled down to before OCR; keeps it fast on a phone. */
const MAX_SIDE = 1800;

export type OcrProgress = { stage: 'loading' | 'recognizing'; progress: number; pass?: number };

/**
 * How the photo is cleaned up before OCR. "adaptive" flattens uneven lighting and the surface
 * around the receipt to plain white, which suits receipt photos; "plain" is a straight greyscale.
 */
export type PrepareMode = 'adaptive' | 'plain';

let workerPromise: Promise<Worker> | null = null;
let progressListener: ((p: OcrProgress) => void) | null = null;

/** Tesseract assets are copied into public/tesseract by scripts/copy-tesseract.mjs. */
function assetBase(): string {
  return `${import.meta.env.BASE_URL}tesseract/`;
}

async function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker, OEM } = await import('tesseract.js');
      const base = assetBase();
      return createWorker('eng', OEM.LSTM_ONLY, {
        workerPath: `${base}worker.min.js`,
        corePath: base,
        langPath: base,
        logger: (m) => {
          if (!progressListener) return;
          if (m.status === 'recognizing text') progressListener({ stage: 'recognizing', progress: m.progress });
          else progressListener({ stage: 'loading', progress: m.progress });
        },
      });
    })().catch((err) => {
      workerPromise = null;
      throw err;
    });
  }
  return workerPromise;
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

/** Greyscale in place (done by hand rather than ctx.filter, which older Safari ignores). */
function toGrey(data: Uint8ClampedArray): Uint8ClampedArray {
  const grey = new Uint8ClampedArray(data.length / 4);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    grey[p] = (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000;
  }
  return grey;
}

/**
 * Bradley adaptive threshold: a pixel is ink if it is noticeably darker than the average of the
 * area around it. Paper, shadows and the table all become white; print becomes black.
 */
function adaptiveThreshold(data: Uint8ClampedArray, width: number, height: number) {
  const grey = toGrey(data);
  const stride = width + 1;
  const integral = new Uint32Array(stride * (height + 1));
  for (let y = 0; y < height; y++) {
    let rowSum = 0;
    for (let x = 0; x < width; x++) {
      rowSum += grey[y * width + x];
      integral[(y + 1) * stride + (x + 1)] = integral[y * stride + (x + 1)] + rowSum;
    }
  }
  const half = Math.max(8, Math.round(width / 24));
  const darkerBy = 0.12;
  for (let y = 0; y < height; y++) {
    const y1 = Math.max(0, y - half);
    const y2 = Math.min(height - 1, y + half);
    for (let x = 0; x < width; x++) {
      const x1 = Math.max(0, x - half);
      const x2 = Math.min(width - 1, x + half);
      const count = (x2 - x1 + 1) * (y2 - y1 + 1);
      const sum =
        integral[(y2 + 1) * stride + (x2 + 1)] -
        integral[y1 * stride + (x2 + 1)] -
        integral[(y2 + 1) * stride + x1] +
        integral[y1 * stride + x1];
      const p = y * width + x;
      const value = grey[p] * count < sum * (1 - darkerBy) ? 0 : 255;
      const i = p * 4;
      data[i] = data[i + 1] = data[i + 2] = value;
      data[i + 3] = 255;
    }
  }
}

function greyscale(data: Uint8ClampedArray) {
  const grey = toGrey(data);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    data[i] = data[i + 1] = data[i + 2] = grey[p];
    data[i + 3] = 255;
  }
}

/** Draws the photo onto a canvas, downscaled and cleaned up, which OCR reads faster and more reliably. */
export async function prepareImage(file: Blob, mode: PrepareMode, crop?: CropRect | null): Promise<HTMLCanvasElement> {
  const img = await loadImage(file);
  const { sx, sy, sw, sh } = crop ? cropToPixels(crop, img.naturalWidth, img.naturalHeight) : { sx: 0, sy: 0, sw: img.naturalWidth, sh: img.naturalHeight };
  const scale = Math.min(1, MAX_SIDE / Math.max(sw, sh));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(sw * scale));
  canvas.height = Math.max(1, Math.round(sh * scale));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Could not process that photo.');
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  if (mode === 'adaptive') adaptiveThreshold(imageData.data, canvas.width, canvas.height);
  else greyscale(imageData.data);
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

/** Runs on-device OCR over a receipt photo and returns the recognised text. The photo never leaves the phone. */
export async function recognizeReceipt(
  file: Blob,
  onProgress?: (p: OcrProgress) => void,
  mode: PrepareMode = 'adaptive',
  crop?: CropRect | null,
): Promise<string> {
  progressListener = onProgress ?? null;
  try {
    const [worker, image] = await Promise.all([getWorker(), prepareImage(file, mode, crop)]);
    const result = await worker.recognize(image);
    return result.data.text;
  } finally {
    progressListener = null;
  }
}
