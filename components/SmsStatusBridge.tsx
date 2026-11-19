'use client';

import { useEffect } from 'react';
import {
  addSmsStatusListener,
  drainSmsStatusEvents,
  isSmsPluginAvailable,
  SmsStatusEvent,
} from '@/lib/sms-plugin';
import { getChats, getMessages, saveMessage } from '@/lib/db';

// Global SMS status bridge + stuck-message scanner.
//
// 1. Live listener  — updates message status on 'sent' / 'delivered' /
//    'failed' events from the native SMS plugin with 0ms startup delay.
// 2. Status drain   — replays any status events queued while backgrounded.
// 3. Stuck scanner  — any message still marked 'sending' for over 45s is
//    flipped to 'failed' so the Retry button returns if the ROM drops a broadcast.
export default function SmsStatusBridge() {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    let handle: { remove: () => void } | null = null;
    let cancelled = false;

    const STUCK_AFTER_MS = 45_000;
    const SCAN_INTERVAL_MS = 5_000;

    const applyStatusEvent = async (ev: SmsStatusEvent) => {
      if (!ev || !ev.clientId) return;
      try {
        const chats = await getChats();
        for (const c of chats) {
          const msgs = await getMessages(c.id);
          const m = msgs.find((x) => x.id === ev.clientId);
          if (!m) continue;

          // Never downgrade an already delivered ('read') message, and never
          // overwrite 'sent' with 'failed'.
          let nextStatus = m.status;
          if (ev.status === 'delivered') {
            nextStatus = 'read';
          } else if (ev.status === 'sent' && m.status !== 'read') {
            nextStatus = 'sent';
          } else if (ev.status === 'failed' && m.status !== 'sent' && m.status !== 'read') {
            nextStatus = 'failed';
          }

          if (nextStatus !== m.status) {
            await saveMessage({ ...m, status: nextStatus });
            window.dispatchEvent(
              new CustomEvent('neura-sms-status', {
                detail: { chatId: c.id, messageId: m.id, status: nextStatus },
              })
            );
          }
          break;
        }
      } catch (e) {
        console.error('[SmsStatusBridge] update failed', e);
      }
    };

    const drainStatusQueue = async () => {
      if (cancelled || !isSmsPluginAvailable()) return;
      try {
        const events = await drainSmsStatusEvents();
        if (cancelled || events.length === 0) return;
        for (const ev of events) {
          await applyStatusEvent(ev);
        }
      } catch (e) {
        console.error('[SmsStatusBridge] drainStatusQueue failed', e);
      }
    };

    const scanStuck = async () => {
      try {
        const chats = await getChats();
        const now = Date.now();
        for (const c of chats) {
          const msgs = await getMessages(c.id);
          let changed = false;
          for (const m of msgs) {
            if (m.sender !== 'user') continue;
            if (m.status !== 'sending') continue;
            if (now - (m.timestamp || 0) < STUCK_AFTER_MS) continue;
            await saveMessage({ ...m, status: 'failed' });
            changed = true;
          }
          if (changed) {
            window.dispatchEvent(
              new CustomEvent('neura-sms-status', {
                detail: { chatId: c.id, messageId: '', status: 'failed' },
              })
            );
          }
        }
      } catch (e) {
        console.error('[SmsStatusBridge] scanStuck failed', e);
      }
    };

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        drainStatusQueue().then(scanStuck);
      }
    };
    document.addEventListener('visibilitychange', onVisible);

    const startListener = async () => {
      if (!isSmsPluginAvailable()) {
        scanStuck();
        return;
      }

      // Attach immediately (0ms delay) before draining queued events.
      try {
        handle = await addSmsStatusListener(async (ev) => {
          console.log('[SmsStatusBridge]', ev);
          await applyStatusEvent(ev);
        });
        console.log('[SmsStatusBridge] listener attached');
      } catch (e) {
        console.error('[SmsStatusBridge] attach failed', e);
      }

      await drainStatusQueue();
      await scanStuck();
    };

    startListener();
    const scanTimer = setInterval(scanStuck, SCAN_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(scanTimer);
      document.removeEventListener('visibilitychange', onVisible);
      if (handle && handle.remove) {
        try { handle.remove(); } catch {}
      }
    };
  }, []);

  return null;
}
