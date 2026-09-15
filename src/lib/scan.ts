import type { CropRect } from './crop';
import { recognizeReceipt } from './ocr';
import type { OcrProgress } from './ocr';
import { parseReceipt } from './receipt';
import type { ParsedReceipt } from './receipt';

export interface ScanResult {
  text: string;
  parsed: ParsedReceipt;
}

function score(parsed: ParsedReceipt): number {
  return (
    (parsed.itemsMatchTotal ? 100 : 0) +
    (parsed.merchant ? 20 : 0) +
    (parsed.amount !== undefined ? 10 : 0) +
    (parsed.date ? 5 : 0) +
    parsed.items.length
  );
}

/**
 * Scans a receipt photo. The first pass cleans the photo up aggressively, which suits most receipts;
 * if the items it finds don't add up to the total, a second plain-greyscale pass is tried and the
 * better reading wins.
 */
export async function scanReceipt(file: Blob, onProgress?: (p: OcrProgress) => void, crop?: CropRect | null): Promise<ScanResult> {
  const firstText = await recognizeReceipt(file, onProgress, 'adaptive', crop);
  const first: ScanResult = { text: firstText, parsed: parseReceipt(firstText) };
  if (first.parsed.itemsMatchTotal && first.parsed.merchant && first.parsed.date) return first;

  const secondText = await recognizeReceipt(file, (p) => onProgress?.({ ...p, pass: 2 }), 'plain', crop);
  const second: ScanResult = { text: secondText, parsed: parseReceipt(secondText) };
  return score(second.parsed) > score(first.parsed) ? second : first;
}
