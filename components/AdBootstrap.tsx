'use client';

import { useEffect } from 'react';
import { initAds, preloadInterstitial, preloadRewarded } from '@/lib/ads';
import { isAdFreeNow } from '@/lib/use-ad-free';

// Runs once on app start: initializes the AdMob SDK and preloads the
// interstitial + rewarded ads so the next user tap shows them instantly
// instead of staring at a spinner.
export default function AdBootstrap() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    let cancelled = false;
    (async () => {
      // Small delay so the native bridge is fully ready.
      await new Promise((r) => setTimeout(r, 1500));
      if (cancelled) return;
      try {
        await initAds();
        if (cancelled) return;
        // Ad-free users do not need any of this.
        if (isAdFreeNow()) return;
        await preloadInterstitial();
        if (cancelled) return;
        await preloadRewarded();
      } catch (e) {
        console.error('[AdBootstrap] failed', e);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return null;
}
