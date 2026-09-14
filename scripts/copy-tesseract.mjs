// Copies the Tesseract.js worker, WASM core and English language data from
// node_modules into public/tesseract so receipt scanning is served from the
// app's own origin (works offline once cached, no third-party CDN at runtime).
import { copyFileSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'public', 'tesseract');
mkdirSync(out, { recursive: true });

const files = [
  join(root, 'node_modules', 'tesseract.js', 'dist', 'worker.min.js'),
  join(root, 'node_modules', '@tesseract.js-data', 'eng', '4.0.0_best_int', 'eng.traineddata.gz'),
];

const coreDir = join(root, 'node_modules', 'tesseract.js-core');
for (const name of readdirSync(coreDir)) {
  // Only the single-file LSTM-only builds are used (see src/lib/ocr.ts); skip the legacy engine.
  if (name.startsWith('tesseract-core') && name.endsWith('-lstm.wasm.js')) files.push(join(coreDir, name));
}

for (const file of files) {
  copyFileSync(file, join(out, file.split('/').pop()));
}
