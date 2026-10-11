'use client';

import { useEffect } from 'react';
import { hideBanner, showBanner } from '@/lib/ads';
import { useAdFree } from '@/lib/use-ad-free';

interface Props {
  position?: 'top' | 'bottom';
}

// Native AdMob banner. Renders nothing in the DOM — the native layer
// overlays it on top of the WebView. Mount it on screens that should
// show ads; it hides itself on unmount and whenever the user has an
// active ad-free window.
export default function AdBanner({ position = 'bottom' }: Props) {
  const adFree = useAdFree();

  useEffect(() => {
    if (adFree) {
      hideBanner();
      return;
    }
    showBanner(position);
    return () => {
      hideBanner();
    };
  }, [adFree, position]);

  return null;
}
