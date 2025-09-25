// src/app/components/TokenIcon.tsx
'use client';

import React, { useMemo, useState } from 'react';

export default function TokenIcon({
  src,       // original icon URL from token list
  size = 24,
  alt = 'token',
  className,
}: {
  src?: string;
  size?: number;
  alt?: string;
  className?: string;
}) {
  const proxied = useMemo(() => {
    if (!src) return '';
    return `/api/icon?u=${encodeURIComponent(src)}`;
  }, [src]);

  const [err, setErr] = useState(false);
  const fallback = '/assets/token-fallback.png';

  return (
    <img
      src={err || !proxied ? fallback : proxied}
      width={size}
      height={size}
      alt={alt}
      loading="lazy"
      decoding="async"
      crossOrigin="anonymous"
      referrerPolicy="no-referrer"
      onError={() => setErr(true)}
      className={className}
      style={{ borderRadius: 8, objectFit: 'cover' }}
    />
  );
}
