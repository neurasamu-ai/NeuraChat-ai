'use client';

import { useEffect } from 'react';
import { addSmsStatusListener, isSmsPluginAvailable } from '@/lib/sms-plugin';
import { getMessages, saveMessage } from '@/lib/db';

// Global subscriber for SMS sent/delivered/failed events. Lives at the app
// root so status is persisted even when the user leaves chat-detail before
// the OS delivers the sent/failed callback.
export default function SmsStatusBridge() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!isSmsPluginAvailable()) return;

    let handle: { remove: () => void } | null = null;
    let cancelled = false;

    const start = async () => {
      await new Promise((r) => setTimeout(r, 1200));
      if (cancelled) return;

      try {
        handle = await addSmsStatusListener(async (ev) => {
          console.log('[SmsStatusBridge]', ev);
          try {
            // The clientId is the message id in IndexedDB. We need to find
            // which chat it belongs to — do a light scan over all chats.
            const { getChats } = await import('@/lib/db');
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

              if (typeof window !== 'undefined') {
                window.dispatchEvent(
                  new CustomEvent('neura-sms-status', {
                    detail: { chatId: c.id, messageId: m.id, status: m.status },
                  })
                );
              }
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

    start();

    return () => {
      cancelled = true;
      if (handle && handle.remove) {
        try { handle.remove(); } catch {}
      }
    };
  }, []);

  return null;
}
