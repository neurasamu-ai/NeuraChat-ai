'use client';

import { useEffect } from 'react';
import { bootstrapContacts } from '@/lib/contacts-store';

// Loads the contacts store as soon as the app opens. Runs at app startup
// so every tab (Chats, Dialer, Contacts) sees the same list without
// triggering its own fetch. The bootstrap function itself handles native
// checks and cache-first reads.
export default function ContactsBootstrap() {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    let cancelled = false;
    let attempt = 0;

    const run = async () => {
      if (cancelled) return;
      try {
        await bootstrapContacts();
        console.log('[ContactsBootstrap] done');
      } catch (e) {
        console.error('[ContactsBootstrap] failed', e);
        // Retry a couple of times in case the Capacitor bridge was not
        // ready yet on a very early call.
        if (attempt < 2 && !cancelled) {
          attempt++;
          setTimeout(run, 1500);
        }
      }
    };

    // Small initial delay so the Capacitor bridge has settled, then run.
    const t = setTimeout(run, 300);

    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, []);

  return null;
}
