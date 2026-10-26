'use client';

import { useEffect } from 'react';
import { addSmsStatusListener, isSmsPluginAvailable } from '@/lib/sms-plugin';
import { getChats, getMessages, saveMessage } from '@/lib/db';

// Global SMS status bridge + stuck-message scanner.
//
// 1. Live listener  — updates message status on 'sent' / 'delivered' /
//    'failed' events from the native SMS plugin.
// 2. Stuck scanner  — any message still marked 'sending' for over 60s is
//    flipped to 'failed' so the Retry button returns. Covers the cases
//    where the local timer in chat-detail is killed by backgrounding,
//    process death, or a dropped broadcast from the ROM.
export default function SmsStatusBridge() {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    let handle: { remove: () => void } | null = null;
    let cancelled = false;

    const STUCK_AFTER_MS = 20_000;
    const SCAN_INTERVAL_MS = 8_000;

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
            m.status = 'failed';
            await saveMessage(m);
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

    // Run immediately, then periodically.
    scanStuck();
    const scanTimer = setInterval(scanStuck, SCAN_INTERVAL_MS);

    const onVisible = () => {
      if (document.visibilityState === 'visible') scanStuck();
    };
    document.addEventListener('visibilitychange', onVisible);

    // Live status listener (best effort — plugin may not be available yet).
    const startListener = async () => {
      if (!isSmsPluginAvailable()) return;
      await new Promise((r) => setTimeout(r, 1200));
      if (cancelled) return;

      try {
        handle = await addSmsStatusListener(async (ev) => {
          console.log('[SmsStatusBridge]', ev);
          try {
            const chats = await getChats();
            for (const c of chats) {
              const msgs = await getMessages(c.id);
              const m = msgs.find((x) => x.id === ev.clientId);
              if (!m) continue;

              if (ev.status === 'sent') {
                m.status = 'sent';
              } else if (ev.status === 'delivered') {
                m.status = 'read';
              } else if (ev.status === 'failed') {
                m.status = 'failed';
              }
              await saveMessage(m);

              window.dispatchEvent(
                new CustomEvent('neura-sms-status', {
                  detail: { chatId: c.id, messageId: m.id, status: m.status },
                })
              );
              break;
            }
          } catch (e) {
            console.error('[SmsStatusBridge] update failed', e);
          }
        });
        console.log('[SmsStatusBridge] listener attached');
      } catch (e) {
        console.error('[SmsStatusBridge] attach failed', e);
      }
    };

    startListener();

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
