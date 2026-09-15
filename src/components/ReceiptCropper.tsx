import { useEffect, useRef, useState } from 'react';
import { clampCrop, detectReceipt, FULL_CROP } from '../lib/crop';
import type { CropRect } from '../lib/crop';
import { Button } from './ui';

interface Props {
  file: Blob;
  onConfirm: (crop: CropRect | null) => void;
  onCancel: () => void;
}

type Handle = 'nw' | 'ne' | 'sw' | 'se' | 'move';

const MAX_HEIGHT_VH = 55;

/** Shows the photo with an adjustable box around the receipt so only that area is scanned. */
export function ReceiptCropper({ file, onConfirm, onCancel }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [aspect, setAspect] = useState(1);
  const [crop, setCrop] = useState<CropRect>(FULL_CROP);
  const [detected, setDetected] = useState(false);
  const frameRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ handle: Handle; startX: number; startY: number; start: CropRect } | null>(null);

  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    let cancelled = false;
    const image = new Image();
    image.onload = () => {
      if (cancelled) return;
      setAspect(image.naturalWidth / image.naturalHeight);
      const found = detectReceipt(image);
      setCrop(found);
      setDetected(found !== FULL_CROP);
      setUrl(objectUrl);
    };
    image.src = objectUrl;
    return () => {
      cancelled = true;
      URL.revokeObjectURL(objectUrl);
    };
  }, [file]);

  function onPointerDown(handle: Handle) {
    return (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      drag.current = { handle, startX: e.clientX, startY: e.clientY, start: crop };
    };
  }

  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    const frame = frameRef.current;
    if (!d || !frame) return;
    const rect = frame.getBoundingClientRect();
    const dx = (e.clientX - d.startX) / rect.width;
    const dy = (e.clientY - d.startY) / rect.height;
    const s = d.start;
    let next: CropRect;
    if (d.handle === 'move') {
      next = { ...s, x: s.x + dx, y: s.y + dy };
    } else {
      const left = d.handle === 'nw' || d.handle === 'sw' ? s.x + dx : s.x;
      const top = d.handle === 'nw' || d.handle === 'ne' ? s.y + dy : s.y;
      const right = d.handle === 'ne' || d.handle === 'se' ? s.x + s.w + dx : s.x + s.w;
      const bottom = d.handle === 'sw' || d.handle === 'se' ? s.y + s.h + dy : s.y + s.h;
      next = { x: Math.min(left, right), y: Math.min(top, bottom), w: Math.abs(right - left), h: Math.abs(bottom - top) };
    }
    setCrop(clampCrop(next));
  }

  function onPointerUp() {
    drag.current = null;
  }

  const isWhole = crop.x === 0 && crop.y === 0 && crop.w === 1 && crop.h === 1;
  const handleStyle: Record<Exclude<Handle, 'move'>, React.CSSProperties> = {
    nw: { left: 0, top: 0, transform: 'translate(-50%, -50%)' },
    ne: { right: 0, top: 0, transform: 'translate(50%, -50%)' },
    sw: { left: 0, bottom: 0, transform: 'translate(-50%, 50%)' },
    se: { right: 0, bottom: 0, transform: 'translate(50%, 50%)' },
  };

  return (
    <div className="flex flex-col gap-3" data-testid="receipt-cropper">
      <p className="text-sm text-slate-500">
        {detected
          ? 'Check the box covers the whole receipt and nothing else. Drag the corners to adjust.'
          : 'Drag the corners so the box covers just the receipt.'}
      </p>
      <div className="flex justify-center overflow-hidden rounded-md bg-slate-900">
        {url ? (
          <div
            ref={frameRef}
            className="relative select-none"
            style={{
              width: '100%',
              maxWidth: `calc(${MAX_HEIGHT_VH}vh * ${aspect})`,
              aspectRatio: String(aspect),
              touchAction: 'none',
            }}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            <img src={url} alt="Receipt photo" className="block h-full w-full" draggable={false} />
            <div
              data-testid="crop-box"
              className="absolute cursor-move border-2 border-indigo-400"
              style={{
                left: `${crop.x * 100}%`,
                top: `${crop.y * 100}%`,
                width: `${crop.w * 100}%`,
                height: `${crop.h * 100}%`,
                boxShadow: '0 0 0 9999px rgba(15, 23, 42, 0.6)',
              }}
              onPointerDown={onPointerDown('move')}
            >
              {(Object.keys(handleStyle) as (keyof typeof handleStyle)[]).map((handle) => (
                <button
                  key={handle}
                  type="button"
                  aria-label={`Adjust ${handle} corner`}
                  data-testid={`handle-${handle}`}
                  onPointerDown={onPointerDown(handle)}
                  className="absolute flex h-11 w-11 items-center justify-center"
                  style={handleStyle[handle]}
                >
                  <span className="block h-5 w-5 rounded-full border-2 border-white bg-indigo-500 shadow" />
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="h-48 w-full animate-pulse bg-slate-800" />
        )}
      </div>
      <Button type="button" onClick={() => onConfirm(isWhole ? null : crop)} disabled={!url} className="mt-1 w-full">
        Scan this area
      </Button>
      <div className="flex gap-2">
        <Button type="button" variant="secondary" onClick={() => onConfirm(null)} disabled={!url} className="flex-1">
          Use whole photo
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel} className="flex-1">
          Cancel
        </Button>
      </div>
    </div>
  );
}
