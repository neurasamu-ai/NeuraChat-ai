'use client';

import { useEffect } from 'react';
import { isNativePlatform } from '@/lib/capacitor';
import { bootstrapContacts } from '@/lib/contacts-store';

// Loads the contacts store as soon as the app opens. The store reads the
// IndexedDB cache first (instant, works offline) and only kicks a native
// sync when the throttle window has elapsed. Once this has run, the Chats
// "New" dialog, the dialer match list, and the Contacts tab all see the
// same list without triggering their own fetches.
export default function ContactsBootstrap() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!isNativePlatform()) return;

    let cancelled = false;

    const start = async () => {
      // Small warm-up so the bridge is ready; the cache read is fast
      // either way.
      await new Promise((r) => setTimeout(r, 400));
      if (cancelled) return;
      try {
        await bootstrapContacts();
      } catch (e) {
        console.error('[ContactsBootstrap] failed', e);
      }
    };

    start();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
