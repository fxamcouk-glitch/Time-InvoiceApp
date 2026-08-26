import type jsPDF from 'jspdf';

export function pdfToFile(doc: jsPDF, filename: string): File {
  const blob = doc.output('blob');
  return new File([blob], filename, { type: 'application/pdf' });
}

export function canShareFile(file: File): boolean {
  return typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });
}

export async function shareFile(file: File, title: string, text: string): Promise<boolean> {
  try {
    await navigator.share({ files: [file], title, text });
    return true;
  } catch (err) {
    // AbortError just means the person closed the share sheet - not a failure.
    if (err instanceof Error && err.name === 'AbortError') return true;
    return false;
  }
}

export function buildMailtoUrl(to: string, subject: string, body: string): string {
  // The address itself is left unencoded - some mail clients mishandle a percent-encoded "@".
  return `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function openMailto(to: string, subject: string, body: string) {
  window.location.href = buildMailtoUrl(to, subject, body);
}
