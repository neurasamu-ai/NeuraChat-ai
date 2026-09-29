'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import { Users } from 'lucide-react';
import { isNativePlatform } from '@/lib/capacitor';
import { useContacts } from '@/lib/use-contacts';

const SHOWN_KEY = 'contacts_sync_toast_shown_v1';

// Shown only on the Contacts tab, only on first launch, only while the
// first sync is still running. Disappears as soon as the sync completes
// or after 6 seconds, whichever is first.
export default function ContactsSyncToast() {
  const pathname = usePathname();
  const contactsState = useContacts();
  const [show, setShow] = useState(false);

  const onContactsTab = pathname?.startsWith('/contacts');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!isNativePlatform()) return;
    if (!onContactsTab) {
      // User is not on the contacts tab: hide immediately.
      setShow(false);
      return;
    }

    // Only show if the sync is actually running or the list is still empty
    // (i.e. first load in progress). Never show if the user already saw it.
    try {
      if (localStorage.getItem(SHOWN_KEY) === '1') {
        setShow(false);
        return;
      }
    } catch {}

    // If contacts are already loaded we do not need the hint.
    if (contactsState.loadedOnce && contactsState.contacts.length > 0) {
      setShow(false);
      return;
    }

    // Show only while the sync is active.
    if (!contactsState.syncing && contactsState.loadedOnce) {
      setShow(false);
      return;
    }

    const t = setTimeout(() => {
      setShow(true);
      try { localStorage.setItem(SHOWN_KEY, '1'); } catch {}
    }, 800);

    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onContactsTab, contactsState.syncing, contactsState.loadedOnce]);

  // Auto-hide once the sync completes or after 6s max.
  useEffect(() => {
    if (!show) return;
    const max = setTimeout(() => setShow(false), 6000);
    if (contactsState.loadedOnce && !contactsState.syncing && contactsState.contacts.length > 0) {
      const t = setTimeout(() => setShow(false), 500);
      return () => {
        clearTimeout(t);
        clearTimeout(max);
      };
    }
    return () => clearTimeout(max);
  }, [show, contactsState.loadedOnce, contactsState.syncing, contactsState.contacts.length]);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ y: -30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -30, opacity: 0 }}
          transition={{ type: 'spring', damping: 22, stiffness: 250 }}
          className="fixed top-20 left-1/2 -translate-x-1/2 z-[80] px-4 py-3 rounded-2xl flex items-center gap-2.5 shadow-2xl max-w-[90%]"
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
            <p className="text-xs font-semibold" style={{ color: '#ffffff' }}>
              Syncing contacts…
            </p>
            <p className="text-[10px]" style={{ color: '#a1a1aa' }}>
              This only happens once. Please wait a moment.
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
