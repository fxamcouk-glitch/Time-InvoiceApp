import { usePhotoUrl } from '../hooks/usePhotoUrl';
import { XIcon } from './icons';

type Source = string | Blob | null | undefined;

/** Small square preview of a receipt photo (stored id or pending blob). */
export function ReceiptThumb({ source, className = 'h-11 w-11', onClick }: { source: Source; className?: string; onClick?: () => void }) {
  const url = usePhotoUrl(source);
  const image = url ? (
    <img src={url} alt="Receipt" className={`${className} rounded-md border border-slate-200 object-cover`} />
  ) : (
    <div className={`${className} rounded-md border border-slate-200 bg-slate-100`} />
  );
  if (!onClick) return image;
  return (
    <button type="button" onClick={onClick} aria-label="View receipt photo" className="shrink-0 active:opacity-80">
      {image}
    </button>
  );
}

/** Full-screen viewer for a receipt photo. Mount to open. */
export function ReceiptViewer({ source, onClose }: { source: Source; onClose: () => void }) {
  const url = usePhotoUrl(source);
  return (
    <div
      data-no-pull
      className="fixed inset-0 z-50 flex items-center justify-center bg-black"
      role="dialog"
      aria-modal="true"
      aria-label="Receipt photo"
      onClick={onClose}
    >
      {url && <img src={url} alt="Receipt" className="max-h-full max-w-full object-contain" onClick={(e) => e.stopPropagation()} />}
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute right-3 flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white"
        style={{ top: 'calc(env(safe-area-inset-top) + 12px)' }}
      >
        <XIcon className="h-6 w-6" />
      </button>
    </div>
  );
}
