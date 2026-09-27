'use client';

import { useEffect } from 'react';
import { getMessages, saveMessage, saveChat, getChats, Chat, Message } from '@/lib/db';
import { generateId } from '@/lib/utils';
import {
  drainIncomingSms,
  addSmsReceivedListener,
  addSmsSentListener,
  isSmsPluginAvailable,
  IncomingSms,
} from '@/lib/sms-plugin';
import { normalizePhone, chatIdFromPhone } from '@/lib/phone';

// Normalizes a raw Android SMS sender into a stable chat key.
// Android may deliver "03001234567", "+923001234567", or a shortcode.
function chatIdFor(sender: string): string {
  return chatIdFromPhone(sender);
}

// Persists an SMS (incoming or outgoing) as a Message + ensures a Chat exists.
async function persistIncoming(msg: IncomingSms) {
  const address = msg.address || msg.sender;
  if (!msg || !address) return;

  const isOutgoing = msg.direction === 'outgoing';
  const chatId = chatIdFor(address);

  // Ensure chat exists.
  try {
    const chats = await getChats();
    const existing = chats.find((c) => c.id === chatId);
    if (existing) {
      existing.lastMessage = msg.body || '';
      existing.timestamp = msg.timestamp || Date.now();
      if (!isOutgoing) {
        existing.unread = (existing.unread || 0) + 1;
      }
      await saveChat(existing);
    } else {
      const newChat: Chat = {
        id: chatId,
        name: address,
        phone: address,
        lastMessage: msg.body || '',
        timestamp: msg.timestamp || Date.now(),
        unread: isOutgoing ? 0 : 1,
        archived: false,
      };
      await saveChat(newChat);
    }
  } catch (e) {
    console.error('[SmsInbox] chat upsert failed', e);
  }

  const newMsg: Message = {
    id: generateId(isOutgoing ? 'sms-out' : 'sms-in'),
    chatId,
    text: msg.body || '',
    sender: isOutgoing ? 'user' : 'contact',
    timestamp: msg.timestamp || Date.now(),
    status: isOutgoing ? 'sent' : 'received',
  };

  try {
    const existingMsgs = await getMessages(chatId);
    const dup = existingMsgs.some(
      (m) =>
        m.text === newMsg.text &&
        m.sender === newMsg.sender &&
        Math.abs((m.timestamp || 0) - (newMsg.timestamp || 0)) < 5000
    );
    if (dup) {
      console.log('[SmsInbox] duplicate skipped');
      return;
    }
    await saveMessage(newMsg);
    console.log('[SmsInbox] saved', isOutgoing ? 'outgoing' : 'incoming', 'msg');
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('neura-sms-updated', { detail: { chatId } }));
    }
  } catch (e) {
    console.error('[SmsInbox] message save failed', e);
  }
}

export default function SmsInboxBridge() {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    let listenerHandle: { remove: () => void } | null = null;
    let listenerHandleOut: { remove: () => void } | null = null;
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

      // Push the persisted blocked list to native so SMS / calls from
      // blocked numbers are dropped even after a cold start.
      try {
        const { getBlockedContacts } = await import('@/lib/db');
        const { syncBlockedListToNative } = await import('@/lib/sms-plugin');
        const list = await getBlockedContacts();
        await syncBlockedListToNative(list.map((x) => x.phone));
        console.log('[SmsInbox] blocked list synced to native, count=', list.length);
      } catch (e) {
        console.error('[SmsInbox] blocked list sync failed', e);
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

      // Subscribe to live incoming SMS
      try {
        listenerHandle = await addSmsReceivedListener(async (msg) => {
          await persistIncoming(msg);
        });
        console.log('[SmsInbox] live incoming listener attached');
      } catch (e) {
        console.error('[SmsInbox] incoming listener attach failed', e);
      }

      // Subscribe to live outgoing SMS (sent from app or notification reply)
      try {
        listenerHandleOut = await addSmsSentListener(async (msg) => {
          await persistIncoming(msg);
        });
        console.log('[SmsInbox] live outgoing listener attached');
      } catch (e) {
        console.error('[SmsInbox] outgoing listener attach failed', e);
      }
    };

    start();

    return () => {
      cancelled = true;
      if (listenerHandle && listenerHandle.remove) {
        try { listenerHandle.remove(); } catch {}
      }
      if (listenerHandleOut && listenerHandleOut.remove) {
        try { listenerHandleOut.remove(); } catch {}
      }
    };
  }, []);

  return null;
}
