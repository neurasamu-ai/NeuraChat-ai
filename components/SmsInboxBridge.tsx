'use client';

import { useEffect } from 'react';
import { getRecentMessages, saveMessage, getContacts, Chat, Message } from '@/lib/db';
import { upsertChat, loadChatsFromDB, getState as getChatsState } from '@/lib/chats-store';
import { loadCallLogsFromDB } from '@/lib/call-log-store';
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

  const newMsg: Message = {
    id: generateId(isOutgoing ? 'sms-out' : 'sms-in'),
    chatId,
    text: msg.body || '',
    sender: isOutgoing ? 'user' : 'contact',
    timestamp: msg.timestamp || Date.now(),
    status: isOutgoing ? 'sent' : 'received',
    subscriptionId: typeof msg.subscriptionId === 'number' ? msg.subscriptionId : undefined,
  };

  // Deduplicate & save message FIRST so the active chat UI updates with 0ms delay
  // and duplicate events never double-increment unread counts.
  try {
    const existingMsgs = await getRecentMessages(chatId, 30);
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
    return;
  }

  // Look up the contact for display name / avatar on new or unnamed chats.
  let contactName: string | undefined;
  let contactAvatar: string | undefined;
  try {
    const list = await getContacts();
    const target = normalizePhone(address);
    if (target) {
      const c = list.find((x) => normalizePhone(x.phone || '') === target);
      if (c) {
        contactName = c.name;
        contactAvatar = c.avatar;
      }
    }
  } catch {}

  // Ensure chat exists via the global chats store so every screen updates.
  try {
    const current = getChatsState().chats;
    const existing = current.find((c) => c.id === chatId);
    if (existing) {
      const patch: Chat = {
        ...existing,
        lastMessage: msg.body || '',
        timestamp: msg.timestamp || Date.now(),
        unread: isOutgoing ? 0 : (existing.unread || 0) + 1,
      };
      if (contactName && (!existing.name || existing.name === existing.phone)) {
        patch.name = contactName;
      }
      if (contactAvatar && !existing.avatar) {
        patch.avatar = contactAvatar;
      }
      await upsertChat(patch);
    } else {
      const newChat: Chat = {
        id: chatId,
        name: contactName || address,
        phone: address,
        avatar: contactAvatar,
        lastMessage: msg.body || '',
        timestamp: msg.timestamp || Date.now(),
        unread: isOutgoing ? 0 : 1,
        archived: false,
      };
      await upsertChat(newChat);
    }
  } catch (e) {
    console.error('[SmsInbox] chat upsert failed', e);
  }
}

export default function SmsInboxBridge() {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    let listenerHandle: { remove: () => void } | null = null;
    let listenerHandleOut: { remove: () => void } | null = null;
    let cancelled = false;

    const drainQueue = async () => {
      if (cancelled || !isSmsPluginAvailable()) return;
      try {
        const queued = await drainIncomingSms();
        if (cancelled || queued.length === 0) return;
        console.log('[SmsInbox] drained', queued.length, 'queued SMS');
        const { beginBatch, commitBatch } = await import('@/lib/chats-store');
        beginBatch();
        try {
          for (const m of queued) {
            await persistIncoming(m);
          }
        } finally {
          commitBatch();
        }
      } catch (e) {
        console.error('[SmsInbox] drain failed', e);
      }
    };

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        drainQueue();
      }
    };
    document.addEventListener('visibilitychange', onVisible);

    const start = async () => {
      if (!isSmsPluginAvailable()) {
        console.warn('[SmsInbox] plugin not available, skipping');
        return;
      }

      // Attach live listeners IMMEDIATELY (0ms delay) before draining so no
      // message can slip through the gap.
      try {
        listenerHandle = await addSmsReceivedListener(async (msg) => {
          await persistIncoming(msg);
        });
        console.log('[SmsInbox] live incoming listener attached');
      } catch (e) {
        console.error('[SmsInbox] incoming listener attach failed', e);
      }

      try {
        listenerHandleOut = await addSmsSentListener(async (msg) => {
          await persistIncoming(msg);
        });
        console.log('[SmsInbox] live outgoing listener attached');
      } catch (e) {
        console.error('[SmsInbox] outgoing listener attach failed', e);
      }

      // Prime the chats store so upsertChat has current data.
      try {
        await loadChatsFromDB();
      } catch (e) {
        console.warn('[SmsInbox] chats-store prime failed', e);
      }

      // Drain any queued SMS immediately.
      await drainQueue();

      // Push the persisted blocked list to native in the background.
      try {
        const { getBlockedContacts } = await import('@/lib/db');
        const { syncBlockedListToNative } = await import('@/lib/sms-plugin');
        const list = await getBlockedContacts();
        await syncBlockedListToNative(list.map((x) => x.phone));
        console.log('[SmsInbox] blocked list synced to native, count=', list.length);
      } catch (e) {
        console.error('[SmsInbox] blocked list sync failed', e);
      }
    };

    start();

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
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
