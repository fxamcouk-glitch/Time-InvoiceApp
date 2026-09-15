import { useEffect, useState } from 'react';
import { getPhoto } from '../lib/photos';

type Source = string | Blob | null | undefined;

/** Object URL for a stored receipt photo (or a pending Blob), revoked when it changes or unmounts. */
export function usePhotoUrl(source: Source): string | null {
  const [loaded, setLoaded] = useState<{ source: Source; url: string }>();

  useEffect(() => {
    if (!source) return;
    let objectUrl: string | null = null;
    let cancelled = false;
    const load = typeof source === 'string' ? getPhoto(source) : Promise.resolve(source);
    load
      .then((blob) => {
        if (cancelled || !blob) return;
        objectUrl = URL.createObjectURL(blob);
        setLoaded({ source, url: objectUrl });
      })
      .catch((err) => console.error(err));
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [source]);

  return loaded && loaded.source === source ? loaded.url : null;
}
