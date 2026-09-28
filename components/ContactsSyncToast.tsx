'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Users } from 'lucide-react';
import { isNativePlatform } from '@/lib/capacitor';
import { useContacts } from '@/lib/use-contacts';

const SHOWN_KEY = 'contacts_sync_toast_shown_v1';

// Shown once per install while contacts are syncing for the first time.
// Disappears after 5 seconds or as soon as the first load completes.
export default function ContactsSyncToast() {
  const contactsState = useContacts();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!isNativePlatform()) return;

    try {
      if (localStorage.getItem(SHOWN_KEY) === '1') return;
    } catch {}

    // Show after a small delay (so it doesn't flash on app open) and
    // regardless of whether the load finishes quickly — the user gets a
    // clear signal on first launch.
    const t = setTimeout(() => {
      setShow(true);
      try { localStorage.setItem(SHOWN_KEY, '1'); } catch {}
      // Auto dismiss after 5s
      setTimeout(() => setShow(false), 5000);
    }, 1200);

    return () => clearTimeout(t);
  }, []);

  // Hide early once the first sync completes.
  useEffect(() => {
    if (!show) return;
    if (contactsState.loadedOnce && !contactsState.syncing && contactsState.contacts.length > 0) {
      const t = setTimeout(() => setShow(false), 800);
      return () => clearTimeout(t);
    }
  }, [show, contactsState.loadedOnce, contactsState.syncing, contactsState.contacts.length]);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ y: -30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -30, opacity: 0 }}
          transition={{ type: 'spring', damping: 22, stiffness: 250 }}
          className="fixed top-4 left-1/2 -translate-x-1/2 z-[80] px-4 py-3 rounded-2xl flex items-center gap-2.5 shadow-2xl max-w-[90%]"
          style={{
            backgroundColor: '#18181b',
            border: '1px solid #00D4FF66',
            color: '#ffffff',
          }}
        >
          <div className="p-1.5 rounded-lg" style={{ backgroundColor: '#00D4FF22' }}>
            <Users className="h-4 w-4" style={{ color: '#00D4FF' }} />
          </div>
          <div>
            <p className="text-xs font-semibold">Syncing contacts…</p>
            <p className="text-[10px] text-zinc-400">This only happens once. Please wait a moment.</p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
