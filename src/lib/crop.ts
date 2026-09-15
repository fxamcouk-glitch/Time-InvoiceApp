/** A crop rectangle in fractions of the image size (0–1), so it works at any display or export size. */
export interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const FULL_CROP: CropRect = { x: 0, y: 0, w: 1, h: 1 };
export const MIN_CROP_SIDE = 0.08;

export function clampCrop(crop: CropRect): CropRect {
  const w = Math.min(1, Math.max(MIN_CROP_SIDE, crop.w));
  const h = Math.min(1, Math.max(MIN_CROP_SIDE, crop.h));
  const x = Math.min(1 - w, Math.max(0, crop.x));
  const y = Math.min(1 - h, Math.max(0, crop.y));
  return { x, y, w, h };
}

export function cropToPixels(crop: CropRect, width: number, height: number) {
  return {
    sx: Math.round(crop.x * width),
    sy: Math.round(crop.y * height),
    sw: Math.max(1, Math.round(crop.w * width)),
    sh: Math.max(1, Math.round(crop.h * height)),
  };
}

/** Fills short gaps of `false` so a barcode or dashed rule doesn't split the paper in two. */
function bridgeGaps(flags: boolean[], maxGap: number): boolean[] {
  const out = flags.slice();
  let lastTrue = -1;
  for (let i = 0; i < out.length; i++) {
    if (!out[i]) continue;
    if (lastTrue !== -1 && i - lastTrue - 1 <= maxGap) {
      for (let j = lastTrue + 1; j < i; j++) out[j] = true;
    }
    lastTrue = i;
  }
  return out;
}

/** The longest run of `true` values (after bridging small gaps), as [start, end). */
function longestRun(flags: boolean[], maxGap = 0): [number, number] {
  if (maxGap > 0) flags = bridgeGaps(flags, maxGap);
  let best: [number, number] = [0, 0];
  let start = -1;
  for (let i = 0; i <= flags.length; i++) {
    const on = i < flags.length && flags[i];
    if (on && start === -1) start = i;
    if (!on && start !== -1) {
      if (i - start > best[1] - best[0]) best = [start, i];
      start = -1;
    }
  }
  return best;
}

/**
 * Guesses where the receipt is: the large bright (paper) region against a darker surface. Works on
 * a small thumbnail so it is instant. Falls back to the whole photo when nothing stands out (e.g.
 * a receipt on a white table).
 */
export function detectReceipt(image: HTMLImageElement): CropRect {
  const scale = 160 / Math.max(image.naturalWidth, image.naturalHeight);
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return FULL_CROP;
  ctx.drawImage(image, 0, 0, width, height);
  const { data } = ctx.getImageData(0, 0, width, height);

  const grey = new Uint8ClampedArray(width * height);
  const histogram = new Uint32Array(256);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    grey[p] = (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000;
    histogram[grey[p]]++;
  }
  // Paper ≈ the brightest 8% of pixels; the threshold sits between that and the overall median.
  const percentile = (fraction: number) => {
    let seen = 0;
    for (let v = 0; v < 256; v++) {
      seen += histogram[v];
      if (seen >= grey.length * fraction) return v;
    }
    return 255;
  };
  const paper = percentile(0.92);
  const median = percentile(0.5);
  if (paper - median < 40) return FULL_CROP; // no clear bright region
  const threshold = (paper + median) / 2;

  const rowBright = new Array<boolean>(height).fill(false);
  const colCount = new Uint32Array(width);
  for (let y = 0; y < height; y++) {
    let count = 0;
    for (let x = 0; x < width; x++) {
      if (grey[y * width + x] > threshold) {
        count++;
        colCount[x]++;
      }
    }
    rowBright[y] = count >= width * 0.12;
  }
  const [top, bottom] = longestRun(rowBright, Math.round(height * 0.08));
  if (bottom - top < height * 0.2) return FULL_CROP;

  // Columns are judged only within the rows found, so glare elsewhere doesn't widen the box.
  const colBright = new Array<boolean>(width).fill(false);
  for (let x = 0; x < width; x++) {
    let count = 0;
    for (let y = top; y < bottom; y++) if (grey[y * width + x] > threshold) count++;
    colBright[x] = count >= (bottom - top) * 0.5;
  }
  const [left, right] = longestRun(colBright, Math.round(width * 0.04));
  if (right - left < width * 0.1) return FULL_CROP;

  const pad = 0.03; // a little background around the paper is harmless; a clipped line is not
  return clampCrop({
    x: left / width - pad,
    y: top / height - pad,
    w: (right - left) / width + pad * 2,
    h: (bottom - top) / height + pad * 2,
  });
}
