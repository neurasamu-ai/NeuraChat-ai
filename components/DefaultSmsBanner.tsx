'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MessageSquare, X } from 'lucide-react';
import { isDefaultSmsApp, requestDefaultSmsRole, isSmsPluginAvailable, openAppInfo } from '@/lib/sms-plugin';

const DISMISS_KEY = 'default_sms_banner_dismissed_until';

export default function DefaultSmsBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!isSmsPluginAvailable()) return;

    try {
      const until = parseInt(localStorage.getItem(DISMISS_KEY) || '0', 10);
      if (until && Date.now() < until) return;
    } catch {}

    let cancelled = false;
    const check = async () => {
      const isDefault = await isDefaultSmsApp();
      if (cancelled) return;
      setShow(!isDefault);
    };
    const t = setTimeout(check, 1200);
    const onVis = () => {
      if (document.visibilityState === 'visible') check();
    };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      cancelled = true;
      clearTimeout(t);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  // Try the role dialog first; regardless of what happens next, also open
  // App Info so the user can set NeuraChat as SMS app manually (row exists
  // there as "SMS app"). This makes the button work on every ROM.
  const handleSet = async () => {
    try {
      await requestDefaultSmsRole();
    } catch (e) {
      console.warn('role request failed', e);
    }
    // Give the OS dialog a moment; if it never shows, App Info is the path.
    setTimeout(async () => {
      const isDefault = await isDefaultSmsApp();
      if (!isDefault) {
        // Open App Info — user taps "SMS app" row there.
        try {
          await openAppInfo();
        } catch {}
      }
      setShow(!isDefault);
    }, 1200);
  };

  const handleAppInfo = async () => {
    try {
      await openAppInfo();
    } catch {}
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
          className="mx-3 mt-2 rounded-xl border border-[#00D4FF]/40 bg-[#00D4FF]/10 p-3 flex items-start gap-2.5 z-40 relative"
        >
          <div className="p-1.5 rounded-lg bg-[#00D4FF]/20">
            <MessageSquare className="h-4 w-4 text-[#00D4FF]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-white">Set NeuraChat as default SMS app</p>
            <p className="text-[10px] text-zinc-400 mt-0.5 leading-relaxed">
              Required to send and receive SMS directly from NeuraChat.
            </p>
            <div className="flex items-center flex-wrap gap-2 mt-2">
              <button
                onClick={handleSet}
                className="text-[10px] font-bold uppercase tracking-wider bg-[#00D4FF] text-black px-3 py-1.5 rounded-lg active:scale-95 transition-all"
              >
                Set as default
              </button>
              <button
                onClick={handleAppInfo}
                className="text-[10px] font-semibold text-zinc-400 hover:text-white px-2 py-1.5 rounded-lg active:scale-95 transition-all underline-offset-2 hover:underline"
              >
                App Info
              </button>
            </div>
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
