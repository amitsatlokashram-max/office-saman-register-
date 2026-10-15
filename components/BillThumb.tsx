'use client';

import { useEffect, useState } from 'react';
import { cachedBill, getBill } from '@/lib/bills';

/** Bill ki photo Firestore se laa ke dikhata hai. */
export function BillImg({ id, alt, className }: { id: string; alt: string; className?: string }) {
  const [url, setUrl] = useState<string | null>(() => cachedBill(id)?.url ?? null);
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    let live = true;
    if (!url) {
      getBill(id).then(
        (v) => live && setUrl(v.url),
        () => live && setBroken(true),
      );
    }
    return () => {
      live = false;
    };
  }, [id, url]);

  if (broken) return <span className={className} data-broken="1" aria-label="Bill nahi mila" />;
  // eslint-disable-next-line @next/next/no-img-element
  return url ? <img className={className} src={url} alt={alt} /> : <span className={className} aria-hidden="true" />;
}
