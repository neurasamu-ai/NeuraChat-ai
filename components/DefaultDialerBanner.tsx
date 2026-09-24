'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Phone, X } from 'lucide-react';
import { isDefaultDialer, requestDefaultDialer, isTelecomPluginAvailable } from '@/lib/telecom-plugin';

const DISMISS_KEY = 'default_dialer_banner_dismissed_until';

export default function DefaultDialerBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!isTelecomPluginAvailable()) return;

    try {
      const until = parseInt(localStorage.getItem(DISMISS_KEY) || '0', 10);
      if (until && Date.now() < until) return;
    } catch {}

    let cancelled = false;
    const check = async () => {
      const isDefault = await isDefaultDialer();
      if (cancelled) return;
      setShow(!isDefault);
    };
    const t = setTimeout(check, 1400);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, []);

  const handleSet = async () => {
    await requestDefaultDialer();
    setTimeout(async () => {
      const isDefault = await isDefaultDialer();
      setShow(!isDefault);
    }, 800);
  };

  const handleDismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now() + 24 * 60 * 60 * 1000));
    } catch {}
    setShow(false);
  };

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -20, opacity: 0 }}
          className="mx-3 mt-2 rounded-xl p-3 flex items-start gap-2.5 z-40 relative"
          style={{
            backgroundColor: 'rgba(16,185,129,0.1)',
            border: '1px solid rgba(16,185,129,0.4)',
          }}
        >
          <div className="p-1.5 rounded-lg" style={{ backgroundColor: 'rgba(16,185,129,0.2)' }}>
            <Phone className="h-4 w-4" style={{ color: '#10b981' }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-white">Set NeuraChat as default dialer</p>
            <p className="text-[10px] text-zinc-400 mt-0.5 leading-relaxed">
              Required for in-app call UI and SIM selection for calls.
            </p>
            <button
              onClick={handleSet}
              className="mt-2 text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-lg active:scale-95 transition-all"
              style={{ backgroundColor: '#10b981', color: '#000000' }}
            >
              Set as default
            </button>
          </div>
          <button
            onClick={handleDismiss}
            className="text-zinc-500 hover:text-white p-1 -mt-0.5 -mr-0.5"
            aria-label="Dismiss"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
