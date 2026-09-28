'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Download, X, RefreshCw } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import {
  isBackupAvailable,
  runAutoBackup,
  findAutoBackup,
  restoreFromFile,
} from '@/lib/backup';

const PROMPTED_KEY = 'backup_restore_prompted_v1';
const LAST_AUTO_KEY = 'backup_last_auto_ts';
const AUTO_INTERVAL_MS = 5 * 60 * 1000; // throttle auto-backup to 5 min

// Handles two things in one place:
//  1. Auto backup on app background / foreground (throttled).
//  2. On a fresh install, offers to restore the auto-backup file if one
//     is present in Downloads/NeuraChat.
export default function BackupManager() {
  const [restorePrompt, setRestorePrompt] = useState<{ filename: string } | null>(null);
  const [restoring, setRestoring] = useState(false);

  // ---- Auto backup ----
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!isBackupAvailable()) return;

    let cancelled = false;

    const maybeBackup = async () => {
      try {
        const last = parseInt(localStorage.getItem(LAST_AUTO_KEY) || '0', 10);
        if (Date.now() - last < AUTO_INTERVAL_MS) return;
        if (cancelled) return;
        const res = await runAutoBackup();
        if (res.ok) {
          localStorage.setItem(LAST_AUTO_KEY, String(Date.now()));
          console.log('[BackupManager] auto backup written', res.path);
        } else {
          console.warn('[BackupManager] auto backup failed', res.error);
        }
      } catch (e) {
        console.warn('[BackupManager] auto backup threw', e);
      }
    };

    // First auto-backup shortly after start.
    const t1 = setTimeout(maybeBackup, 3000);

    // Whenever the app goes to background, try again (throttled).
    let appStateHandle: any = null;
    (async () => {
      try {
        const { App } = await import('@capacitor/app');
        appStateHandle = await App.addListener('appStateChange', ({ isActive }) => {
          if (!isActive) {
            // Fire and forget; interval throttle handles spam.
            maybeBackup();
          }
        });
      } catch (e) {
        console.warn('[BackupManager] App listener failed', e);
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(t1);
      if (appStateHandle && appStateHandle.remove) {
        try { appStateHandle.remove(); } catch {}
      }
    };
  }, []);

  // ---- Restore prompt on fresh install ----
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!isBackupAvailable()) return;

    // Only show once per install.
    try {
      if (localStorage.getItem(PROMPTED_KEY) === '1') return;
    } catch {}

    let cancelled = false;

    const check = async () => {
      await new Promise((r) => setTimeout(r, 2500));
      if (cancelled) return;

      // Only prompt if the app has no contacts yet (fresh install).
      try {
        const { getContacts } = await import('@/lib/db');
        const contacts = await getContacts();
        if (contacts.length > 0) return;
      } catch {}

      try {
        const found = await findAutoBackup();
        if (!found) return;
        if (cancelled) return;
        setRestorePrompt({ filename: found.filename });
      } catch (e) {
        console.warn('[BackupManager] auto backup check failed', e);
      }
    };

    check();

    return () => {
      cancelled = true;
    };
  }, []);

  const acceptRestore = async () => {
    if (!restorePrompt) return;
    setRestoring(true);
    try {
      const res = await restoreFromFile(restorePrompt.filename);
      console.log('[BackupManager] restore result', res);
    } catch (e) {
      console.error('[BackupManager] restore failed', e);
    } finally {
      setRestoring(false);
      setRestorePrompt(null);
      try { localStorage.setItem(PROMPTED_KEY, '1'); } catch {}
    }
  };

  const dismissRestore = () => {
    setRestorePrompt(null);
    try { localStorage.setItem(PROMPTED_KEY, '1'); } catch {}
  };

  return (
    <AnimatePresence>
      {restorePrompt && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[90] bg-black/80 backdrop-blur-md flex items-center justify-center p-6"
        >
          <motion.div
            initial={{ scale: 0.95, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, y: 20 }}
            className="w-full max-w-sm bg-zinc-950 border border-zinc-900 rounded-3xl p-6 relative"
          >
            <button
              onClick={dismissRestore}
              className="absolute top-4 right-4 text-zinc-500 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-[#00D4FF]/15 border border-[#00D4FF]/40 flex items-center justify-center">
              <Download className="h-6 w-6 text-[#00D4FF]" />
            </div>

            <h3 className="text-base font-bold text-white text-center mb-1">
              Restore previous backup?
            </h3>
            <p className="text-xs text-zinc-400 text-center mb-5 leading-relaxed">
              A NeuraChat backup was found in Downloads/NeuraChat. Restore your
              contacts, chats, messages, call logs, and settings from it?
            </p>

            <div className="flex gap-2">
              <button
                onClick={dismissRestore}
                disabled={restoring}
                className="flex-1 py-3 bg-zinc-900 text-zinc-300 font-semibold text-xs rounded-xl active:scale-97 disabled:opacity-50"
              >
                Skip
              </button>
              <button
                onClick={acceptRestore}
                disabled={restoring}
                className="flex-1 py-3 bg-[#00D4FF] text-black font-semibold text-xs rounded-xl active:scale-97 disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {restoring ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    Restoring…
                  </>
                ) : (
                  <>
                    <Download className="h-3.5 w-3.5" />
                    Restore
                  </>
                )}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
