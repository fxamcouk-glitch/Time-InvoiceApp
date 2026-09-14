import type { Worker } from 'tesseract.js';

/** Longest side the photo is scaled down to before OCR; keeps it fast on a phone. */
const MAX_SIDE = 1600;

export type OcrProgress = { stage: 'loading' | 'recognizing'; progress: number };

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

/** Draws the photo onto a canvas, downscaled and grey-scaled, which OCR reads faster and more reliably. */
async function prepareImage(file: Blob): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Could not read that photo.'));
      image.src = url;
    });
    const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not process that photo.');
    ctx.filter = 'grayscale(1) contrast(1.2)';
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Runs on-device OCR over a receipt photo and returns the recognised text. The photo never leaves the phone. */
export async function recognizeReceipt(file: Blob, onProgress?: (p: OcrProgress) => void): Promise<string> {
  progressListener = onProgress ?? null;
  try {
    const [worker, image] = await Promise.all([getWorker(), prepareImage(file)]);
    const result = await worker.recognize(image);
    return result.data.text;
  } finally {
    progressListener = null;
  }
}
