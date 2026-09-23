'use client';

import { useEffect } from 'react';
import { getMessages, saveMessage, saveChat, getChats, Chat, Message } from '@/lib/db';
import { generateId } from '@/lib/utils';
import {
  drainIncomingSms,
  addSmsReceivedListener,
  isSmsPluginAvailable,
  IncomingSms,
} from '@/lib/sms-plugin';
import { normalizePhone, chatIdFromPhone } from '@/lib/phone';

// Normalizes a raw Android SMS sender into a stable chat key.
// Android may deliver "03001234567", "+923001234567", or a shortcode.
function chatIdFor(sender: string): string {
  return chatIdFromPhone(sender);
}

// Persists an incoming SMS as a Message + ensures a Chat entry exists.
async function persistIncoming(msg: IncomingSms) {
  if (!msg || !msg.sender) return;

  const senderNorm = normalizePhone(msg.sender) || msg.sender;
  const chatId = chatIdFor(msg.sender);

  // Ensure chat exists and bump unread.
  try {
    const chats = await getChats();
    const existing = chats.find((c) => c.id === chatId);
    if (existing) {
      existing.lastMessage = msg.body || '';
      existing.timestamp = msg.timestamp || Date.now();
      existing.unread = (existing.unread || 0) + 1;
      await saveChat(existing);
    } else {
      const newChat: Chat = {
        id: chatId,
        name: msg.sender,
        phone: msg.sender,
        lastMessage: msg.body || '',
        timestamp: msg.timestamp || Date.now(),
        unread: 1,
        archived: false,
      };
      await saveChat(newChat);
    }
  } catch (e) {
    console.error('[SmsInbox] chat upsert failed', e);
  }

  // Save the message body.
  const newMsg: Message = {
    id: generateId('sms-in'),
    chatId,
    text: msg.body || '',
    sender: 'contact',
    timestamp: msg.timestamp || Date.now(),
    status: 'received',
  };

  try {
    // Avoid duplicates when both drain and live-listener deliver the same SMS.
    const existingMsgs = await getMessages(chatId);
    const dup = existingMsgs.some(
      (m) =>
        m.text === newMsg.text &&
        Math.abs((m.timestamp || 0) - (newMsg.timestamp || 0)) < 5000
    );
    if (dup) {
      console.log('[SmsInbox] duplicate skipped');
      return;
    }
    await saveMessage(newMsg);
    console.log('[SmsInbox] saved incoming from', msg.sender, 'suffix', senderNorm.slice(-4));
  } catch (e) {
    console.error('[SmsInbox] message save failed', e);
  }
}

export default function SmsInboxBridge() {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    let listenerHandle: { remove: () => void } | null = null;
    let cancelled = false;

    const start = async () => {
      // Give the Capacitor bridge a moment to be ready (same pattern as
      // contacts sync). Without this, the very first drain call can fail
      // silently on a cold start.
      await new Promise((r) => setTimeout(r, 1200));
      if (cancelled) return;

      if (!isSmsPluginAvailable()) {
        console.warn('[SmsInbox] plugin not available, skipping');
        return;
      }

      // Drain queued SMS (received while app was closed)
      try {
        const queued = await drainIncomingSms();
        console.log('[SmsInbox] drained', queued.length, 'queued SMS');
        if (cancelled) return;
        for (const m of queued) {
          await persistIncoming(m);
        }
      } catch (e) {
        console.error('[SmsInbox] drain failed', e);
      }

      // Subscribe to live SMS
      try {
        listenerHandle = await addSmsReceivedListener(async (msg) => {
          await persistIncoming(msg);
        });
        console.log('[SmsInbox] live listener attached');
      } catch (e) {
        console.error('[SmsInbox] listener attach failed', e);
      }
    };

    start();

    return () => {
      cancelled = true;
      if (listenerHandle && listenerHandle.remove) {
        try { listenerHandle.remove(); } catch {}
      }
    };
  }, []);

  return null;
}
