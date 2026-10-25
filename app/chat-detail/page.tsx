'use client';

import React, { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import {
  Send,
  MoreVertical,
  Trash2,
  Copy,
  ArrowLeft,
  Smile,
  X,
  FileImage,
  Phone,
  Video,
  Share2,
  CornerUpRight,
  PhoneOff,
  User,
  ExternalLink,
  Users,
  MessageSquare
} from 'lucide-react';
import {
  getMessages,
  getRecentMessages,
  getMessagesBefore,
  getMessagesCount,
  saveMessage,
  deleteMessage,
  getContacts,
  getUserProfile,
  Message,
  Chat,
  Contact,
  UserProfile,
  ChatBackground
} from '@/lib/db';
import Header from '@/components/Header';
import MessageBubble from '@/components/MessageBubble';
import ChatBackgroundModal from '@/components/ChatBackgroundModal';
import { upsertChat, markChatRead as storeMarkRead, persistChatRead } from '@/lib/chats-store';
import { generateId, getCurrentTimestamp } from '@/lib/utils';
import { useBackHandler } from '@/lib/use-back-handler';
import { chatIdFromPhone, normalizePhone } from '@/lib/phone';
import { DEFAULT_BUBBLE_COLOR, getBubbleColorHex, bubbleTextColor } from '@/lib/bubble-colors';
import { dispatchCall, placeCall, setPreferredCallSimId, CallAccount } from '@/lib/telecom-plugin';
import { getActiveSubscriptions, sendSmsTracked, isSmsPluginAvailable, getPreferredSimId, setPreferredSimId, Subscription } from '@/lib/sms-plugin';

function ChatDetailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const phone = searchParams.get('phone') || '';
  const name = searchParams.get('name') || 'Neural Link';
  const avatar = searchParams.get('avatar') || '';
  const chatId = chatIdFromPhone(phone);

  const [messages, setMessages] = useState<Message[]>([]);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [resolvedContact, setResolvedContact] = useState<{ name: string; avatar?: string } | null>(null);
  const [bubbleColor, setBubbleColor] = useState<string>(DEFAULT_BUBBLE_COLOR);

  // Load the owner's profile once, so outgoing bubbles can show their
  // own avatar / name on the right side.
  useEffect(() => {
    (async () => {
      try {
        const p = await getUserProfile();
        setUserProfile(p);
        setBubbleColor(getBubbleColorHex(p.bubbleColor));
      } catch (e) {
        console.error('load userProfile failed', e);
      }
    })();
  }, []);

  // React live to Settings changes to bubble color without a reload.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { color?: string } | undefined;
      if (detail?.color) setBubbleColor(detail.color);
    };
    window.addEventListener('neurachat-bubble-color-change', handler);
    return () => window.removeEventListener('neurachat-bubble-color-change', handler);
  }, []);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const reloadDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const [inputText, setInputText] = useState('');
  
  // Header Options Menu Dropdown state
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isBgModalOpen, setIsBgModalOpen] = useState(false);
  const [chatBg, setChatBg] = useState<ChatBackground | null>(null);
  const [subsMap, setSubsMap] = useState<Record<number, { label: string; number: string }>>({});
  const [contactsByPhone, setContactsByPhone] = useState<Record<string, { name: string; avatar?: string }>>({});

  // Fetch the SIM subscriptions once so we can map subscriptionId -> label + number.
  useEffect(() => {
    (async () => {
      try {
        const subs = await getActiveSubscriptions();
        const map: Record<number, { label: string; number: string }> = {};
        for (const s of subs) {
          map[s.subscriptionId] = {
            label: s.label || `SIM ${(s.slotIndex ?? 0) + 1}`,
            number: (s as any).number || '',
          };
        }
        setSubsMap(map);
      } catch (e) {
        console.error('load subs failed', e);
      }
    })();
  }, []);

  // Index contacts by normalized phone so we can resolve a SIM number to a
  // saved contact name (used on the outgoing bubble header).
  useEffect(() => {
    (async () => {
      try {
        const list = await getContacts();
        const m: Record<string, { name: string; avatar?: string }> = {};
        for (const c of list) {
          const clean = normalizePhone(c.phone || '');
          if (clean) m[clean] = { name: c.name, avatar: c.avatar };
        }
        setContactsByPhone(m);
      } catch (e) {
        console.error('load contactsByPhone failed', e);
      }
    })();
  }, []);

  // Returns the display name for an outgoing bubble based on the SIM that
  // sent it: contact name if the SIM number is saved, else the raw number,
  // else the SIM label, else fallback to the owner profile name.
  const senderNameFor = (subId?: number): string => {
    if (subId == null) return userProfile?.name || 'You';
    const sub = subsMap[subId];
    if (!sub) return userProfile?.name || 'You';
    if (sub.number) {
      const clean = normalizePhone(sub.number);
      const match = contactsByPhone[clean];
      if (match?.name) return match.name;
      return sub.number;
    }
    return sub.label || 'SIM';
  };

  // Resolve the contact for this chat: prefer the URL params, then the
  // stored Chat row, then a contacts lookup by phone.
  useEffect(() => {
    (async () => {
      try {
        const { getChats, getContacts: fetchContacts } = await import('@/lib/db');
        const chats = await getChats();
        const row = chats.find((x) => x.id === chatId);

        // Try contact lookup by phone too — the chat row avatar may be
        // empty even when the contact has one, e.g. after a fresh SMS
        // created the chat without consulting the contacts table.
        let contactMatch: { name: string; avatar?: string } | null = null;
        try {
          const list = await fetchContacts();
          const target = normalizePhone(row?.phone || phone);
          if (target) {
            const c = list.find((x) => normalizePhone(x.phone || '') === target);
            if (c) contactMatch = { name: c.name, avatar: c.avatar };
          }
        } catch {}

        const finalName =
          contactMatch?.name || row?.name || row?.phone || phone || 'Unknown';
        const finalAvatar =
          contactMatch?.avatar || row?.avatar || undefined;

        setResolvedContact({ name: finalName, avatar: finalAvatar });
      } catch (e) {
        console.error('resolvedContact load failed', e);
      }
    })();
  }, [chatId, phone]);

  // Load the per-chat background image when the chat changes.
  useEffect(() => {
    (async () => {
      try {
        const { getChats } = await import('@/lib/db');
        const chats = await getChats();
        const c = chats.find((x) => x.id === chatId);
        setChatBg(c?.background || null);
      } catch (e) {
        console.error('load chatBg failed', e);
      }
    })();
  }, [chatId]);

  const saveChatBackground = async (bg: ChatBackground | null) => {
    try {
      const { getChats } = await import('@/lib/db');
      const chats = await getChats();
      const c = chats.find((x) => x.id === chatId);
      if (!c) return;
      const updated: Chat = { ...c, background: bg || undefined };
      // Use upsertChat so the in-memory store also reflects this change.
      // Otherwise a later partial update (e.g. from SmsInboxBridge) merges
      // against a snapshot that still has background=undefined and wipes it.
      await upsertChat(updated);
      setChatBg(bg);
    } catch (e) {
      console.error('saveChatBackground failed', e);
    }
  };

  // Selected Message Context Dialog (Copy/Delete)
  const [activeMessage, setActiveMessage] = useState<Message | null>(null);
  const [selectedMsgIds, setSelectedMsgIds] = useState<string[]>([]);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const justLongPressedRef = useRef(false);
  const msgTouchStartRef = useRef<{ x: number; y: number } | null>(null);
  const msgMovedRef = useRef(false);
  const MSG_SWIPE_THRESHOLD = 8;

  // File Picker Input reference
  const scrollRef = useRef<HTMLDivElement>(null);

  // Simulated Voice/Video Call states
  // SIM picker for outgoing SMS
  const [simPickerOpen, setSimPickerOpen] = useState(false);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [pendingSmsText, setPendingSmsText] = useState<string>('');
  const [pendingSmsClientId, setPendingSmsClientId] = useState<string>('');
  const [callSimPickerOpen, setCallSimPickerOpen] = useState(false);
  const [callAccounts, setCallAccounts] = useState<CallAccount[]>([]);
  const [pendingCallNumber, setPendingCallNumber] = useState<string>('');
  const [pendingCallNameHint, setPendingCallNameHint] = useState<string | undefined>(undefined);
  const [rememberCallSim, setRememberCallSim] = useState(false);
  const [rememberSim, setRememberSim] = useState(true);
  // Header SIM badge: which SIM is currently selected for this chat
  const [headerSimLabel, setHeaderSimLabel] = useState<string>('');
  const [headerSims, setHeaderSims] = useState<Subscription[]>([]);
  const [headerSimPickerOpen, setHeaderSimPickerOpen] = useState(false);

  // Profile sharing states
  const [isShareOpen, setIsShareOpen] = useState(false);

  // Forwarding states
  const [isForwarding, setIsForwarding] = useState(false);
  const [contacts, setContacts] = useState<Contact[]>([]);

  // Toast notifier state
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastKind, setToastKind] = useState<'info' | 'success' | 'error'>('info');

  const alertToast = (msg: string, kind: 'info' | 'success' | 'error' = 'info') => {
    setToastKind(kind);
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  };

  // Fetch destination contacts for forwarding
  useEffect(() => {
    const fetchForwardContacts = async () => {
      try {
        const list = await getContacts();
        setContacts(list);
      } catch (e) {
        console.error('Failed to fill contacts for forward:', e);
      }
    };
    fetchForwardContacts();
  }, []);

  // Load the most recent slice of the conversation. Older messages load
  // on demand when the user scrolls to the top.
  const MESSAGE_PAGE_SIZE = 100;

  const loadMessages = async () => {
    if (!phone) return;
    try {
      const logs = await getRecentMessages(chatId, MESSAGE_PAGE_SIZE);
      setMessages(logs);
      // If we fetched exactly the page size, there may be older messages.
      setHasMore(logs.length === MESSAGE_PAGE_SIZE);
    } catch (e) {
      console.error('loadMessages failed', e);
    }
  };

  // Debounced reload — used by live SMS status updates so a burst of
  // events does not cause a full re-read for every single one.
  const scheduleReload = () => {
    if (reloadDebounceRef.current) {
      clearTimeout(reloadDebounceRef.current);
    }
    reloadDebounceRef.current = setTimeout(() => {
      reloadDebounceRef.current = null;
      loadMessages();
    }, 200);
  };

  // Load an older page of messages (triggered on scroll to top).
  const loadOlderMessages = async () => {
    if (!phone || isLoadingMore || !hasMore || messages.length === 0) return;
    setIsLoadingMore(true);
    try {
      const oldest = messages[0].timestamp;
      const older = await getMessagesBefore(chatId, oldest, MESSAGE_PAGE_SIZE);

      if (older.length === 0) {
        setHasMore(false);
        return;
      }

      // Preserve the visual scroll position: record the current distance
      // from the top before prepending, then restore it after render.
      const container = messagesContainerRef.current;
      const prevScrollHeight = container?.scrollHeight ?? 0;
      const prevScrollTop = container?.scrollTop ?? 0;

      setMessages((prev) => [...older, ...prev]);
      setHasMore(older.length === MESSAGE_PAGE_SIZE);

      requestAnimationFrame(() => {
        const c = messagesContainerRef.current;
        if (c) {
          const newScrollHeight = c.scrollHeight;
          c.scrollTop = prevScrollTop + (newScrollHeight - prevScrollHeight);
        }
      });
    } catch (e) {
      console.error('loadOlderMessages failed', e);
    } finally {
      setIsLoadingMore(false);
    }
  };

  // Ensure a chat entry exists for this contact.
  const ensureChatExists = async () => {
    try {
      const matchingChat: Chat = {
        id: chatId,
        name,
        phone,
        avatar,
        lastMessage: '',
        timestamp: getCurrentTimestamp(),
        unread: 0,
        archived: false,
      };
      await upsertChat(matchingChat);
    } catch (e) {
      console.error('ensureChatExists failed', e);
    }
  };

  // If the chat title is just a raw number, try to resolve the contact name
  // so it shows the person's name instead of digits.
  useEffect(() => {
    const resolveName = async () => {
      try {
        const looksNumeric = /^[+\d\s-]+$/.test((name || '').trim());
        if (!looksNumeric) return;
        const list = await getContacts();
        const digits = (phone || '').replace(/\D/g, '');
        if (digits.length < 7) return;
        const found = list.find((c) => {
          const cd = (c.phone || '').replace(/\D/g, '');
          if (cd.length < 7) return false;
          return cd.endsWith(digits) || digits.endsWith(cd);
        });
        if (found && found.name && found.name !== name) {
          // Push the resolved name into the global chats store so the
          // Chats list + this header update instantly.
          await upsertChat({
            id: chatId,
            name: found.name,
            phone,
            avatar,
            lastMessage: '',
            timestamp: getCurrentTimestamp(),
            unread: 0,
            archived: false,
          });
        }
      } catch (e) {
        console.error('resolveName failed', e);
      }
    };
    const t = setTimeout(resolveName, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId]);

  // Load SIM list + selected SIM for the header badge.
  useEffect(() => {
    const load = async () => {
      try {
        if (!isSmsPluginAvailable()) return;
        const subs = await getActiveSubscriptions();
        setHeaderSims(subs);
        const pref = getPreferredSimId();
        if (pref !== null) {
          const found = subs.find((x) => x.subscriptionId === pref);
          if (found) setHeaderSimLabel(found.label);
        } else if (subs.length > 0) {
          setHeaderSimLabel('Default');
        }
      } catch (e) {
        console.error('header sim load failed', e);
      }
    };
    load();
  }, []);

  const pickHeaderSim = (sub: Subscription) => {
    setPreferredSimId(sub.subscriptionId);
    setHeaderSimLabel(sub.label);
    setHeaderSimPickerOpen(false);
    alertToast(`SMS will be sent via ${sub.label}`, 'success');
  };

  const clearHeaderSim = () => {
    setPreferredSimId(null);
    setHeaderSimLabel('Default');
    setHeaderSimPickerOpen(false);
    alertToast('Using default SIM', 'info');
  };

  // Mark this chat as read whenever it is opened. Goes through the global
  // chats store so the Chats list badge clears instantly.
  const markChatRead = async () => {
    try {
      storeMarkRead(chatId);
      await persistChatRead(chatId);
    } catch (e) {
      console.error('markChatRead failed', e);
    }
  };

  useEffect(() => {
    const handle = setTimeout(async () => {
      await loadMessages();
      await markChatRead();
    }, 0);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phone]);

  // Live reload when an SMS for this chat is saved by the bridge.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { chatId?: string } | undefined;
      if (!detail || !detail.chatId || detail.chatId === chatId) {
        loadMessages();
        markChatRead();
      }
    };
    window.addEventListener('neura-sms-updated', handler);
    return () => window.removeEventListener('neura-sms-updated', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId]);

  // Reload when returning to foreground (in case the bridge missed something).
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        scheduleReload();
        markChatRead();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId]);

  // Scroll to bottom whenever messages list gets updated
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const triggerVibration = () => {
    if (typeof window !== 'undefined' && window.navigator && window.navigator.vibrate) {
      window.navigator.vibrate(40);
    }
  };

  // Actually send the SMS with tracked status. clientId == message id in DB.
  // Helper: mark a message as failed in DB + reload UI.
  const markMessageFailed = async (clientId: string) => {
    try {
      const { getMessages: fetchMsgs } = await import('@/lib/db');
      const list = await fetchMsgs(chatId);
      const m = list.find((x) => x.id === clientId);
      if (!m) return;
      m.status = 'failed';
      await saveMessage(m);
      await loadMessages();
    } catch (e) {
      console.error('markMessageFailed', e);
    }
  };

  const performSmsSend = async (text: string, subscriptionId: number | undefined, clientId: string) => {
    // Persist the SIM (subscriptionId) on the message before sending, so
    // the outgoing bubble can show which SIM this went through.
    try {
      const { getMessages: fetchMsgs } = await import('@/lib/db');
      const list = await fetchMsgs(chatId);
      const m = list.find((x) => x.id === clientId);
      if (m) {
        m.subscriptionId = subscriptionId;
        await saveMessage(m);
      }
    } catch (e) {
      console.error('save subId failed', e);
    }

    if (!isSmsPluginAvailable()) {
      alertToast('Native SMS unavailable — opening system messenger', 'error');
      await markMessageFailed(clientId);
      const smsBody = encodeURIComponent(text);
      window.location.href = `sms:${phone}?body=${smsBody}`;
      return;
    }

    // Non-default SMS apps can still send with SEND_SMS; the previous
    // isDefaultSmsApp() gate was blocking sends on devices where the check
    // ran before the role was fully applied. Just send and report the real
    // result via the tracked status listener.
    try {
      await sendSmsTracked(phone, text, clientId, subscriptionId);
      console.log('SMS queued, clientId=', clientId);
      // Success here only means "queued with the OS". The real terminal
      // status arrives via SmsStatusBridge ('sent' / 'delivered' / 'failed').
    } catch (err: any) {
      console.error('sendSmsTracked failed:', err);
      alertToast('Send failed: ' + (err?.message || 'unknown error'), 'error');
      await markMessageFailed(clientId);
    }
  };

  // Decide whether we can send silently (1 SIM or remembered) or need a picker.
  const dispatchSms = async (text: string, clientId: string) => {
    if (!isSmsPluginAvailable()) {
      await performSmsSend(text, undefined, clientId);
      return;
    }

    const subs = await getActiveSubscriptions();
    if (subs.length <= 1) {
      await performSmsSend(text, subs[0]?.subscriptionId, clientId);
      return;
    }

    const remembered = getPreferredSimId();
    if (remembered !== null && subs.some((x) => x.subscriptionId === remembered)) {
      await performSmsSend(text, remembered, clientId);
      return;
    }

    setSubscriptions(subs);
    setPendingSmsText(text);
    setPendingSmsClientId(clientId);
    setSimPickerOpen(true);
  };

  const handlePickSim = async (subscriptionId: number) => {
    triggerVibration();
    if (rememberSim) {
      setPreferredSimId(subscriptionId);
    }
    const text = pendingSmsText;
    const clientId = pendingSmsClientId;
    setSimPickerOpen(false);
    setPendingSmsText('');
    setPendingSmsClientId('');
    if (text) {
      await performSmsSend(text, subscriptionId, clientId);
    }
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim()) return;

    const bodyText = inputText.trim();

    // 1. Build message payload for database
    const newMsg: Message = {
      id: generateId('msg'),
      chatId,
      text: bodyText,
      sender: 'user',
      timestamp: getCurrentTimestamp(),
      status: 'sending'
    };

    // 2. Ensure chat entry exists before saving the first message
    await ensureChatExists();

    // 3. Save locally in IndexedDB
    await saveMessage(newMsg);
    
    // Clear inputs immediately
    setInputText('');

    // Refresh display
    await loadMessages();

    // 3. Dispatch SMS via selected/default SIM (track with newMsg.id)
    triggerVibration();
    await dispatchSms(bodyText, newMsg.id);
  };

  // Retry a failed SMS: reuse the same body + client id so the tracked
  // status listener updates the existing bubble instead of creating a new one.
  const handleRetryMessage = async (msg: Message) => {
    triggerVibration();
    try {
      // Use a fresh copy — mutating the parent's object in place makes
      // React.memo think nothing changed (prev.msg === next.msg by ref).
      const updated: Message = { ...msg, status: 'sending' };
      await saveMessage(updated);
      await loadMessages();
      // Determine which SIM to use (same rules as a fresh send).
      const subs = await getActiveSubscriptions();
      let subId: number | undefined;
      if (subs.length === 1) subId = subs[0].subscriptionId;
      else {
        const pref = getPreferredSimId();
        if (pref !== null && subs.some((x) => x.subscriptionId === pref)) {
          subId = pref;
        }
      }
      await performSmsSend(msg.text || '', subId, msg.id);
    } catch (e) {
      console.error('retry failed', e);
      alertToast('Retry failed', 'error');
    }
  };


  // Long press triggering for messages. Movement cancels the timer so that
  // scrolling never selects a bubble.
  const handleMessagePressStart = (msg: Message, x?: number, y?: number) => {
    justLongPressedRef.current = false;
    msgMovedRef.current = false;
    if (typeof x === 'number' && typeof y === 'number') {
      msgTouchStartRef.current = { x, y };
    }
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    const timer = setTimeout(() => {
      // Guard: if user moved during the hold, do not select.
      if (msgMovedRef.current) return;
      triggerVibration();
      justLongPressedRef.current = true;
      setSelectedMsgIds(prev => {
        if (prev.includes(msg.id)) return prev;
        return [...prev, msg.id];
      });
    }, 600);
    longPressTimerRef.current = timer;
  };

  const handleMessageMove = (x: number, y: number) => {
    if (!msgTouchStartRef.current) return;
    const dx = Math.abs(x - msgTouchStartRef.current.x);
    const dy = Math.abs(y - msgTouchStartRef.current.y);
    if (dx > MSG_SWIPE_THRESHOLD || dy > MSG_SWIPE_THRESHOLD) {
      msgMovedRef.current = true;
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
    }
  };

  const handleMessagePressEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    msgTouchStartRef.current = null;
  };

  const handleMessageClick = (msg: Message) => {
    // Ignore any click that followed a scroll or a long press.
    const wasMoved = msgMovedRef.current;
    const wasLongPress = justLongPressedRef.current;
    msgMovedRef.current = false;
    justLongPressedRef.current = false;
    msgTouchStartRef.current = null;
    if (wasMoved || wasLongPress) return;

    // Only allow tap-to-toggle when selection mode is already active.
    // Uses the updater form so this handler never closes over
    // selectedMsgIds, which lets MessageBubble stay memoized.
    setSelectedMsgIds((prev) => {
      if (prev.length === 0) return prev;
      triggerVibration();
      if (prev.includes(msg.id)) {
        return prev.filter((id) => id !== msg.id);
      }
      return [...prev, msg.id];
    });
  };

  const handleCopySelected = () => {
    if (selectedMsgIds.length === 0) return;
    triggerVibration();
    const selectedTexts = messages
      .filter(m => selectedMsgIds.includes(m.id))
      .map(m => m.text || "")
      .filter(t => t !== "")
      .join("\n");
    navigator.clipboard.writeText(selectedTexts);
    setSelectedMsgIds([]);
    alertToast(`Copied selected message(s)!`);
  };

  const handleDeleteSelected = async () => {
    if (selectedMsgIds.length === 0) return;
    triggerVibration();
    for (const id of selectedMsgIds) {
      await deleteMessage(id);
    }
    setSelectedMsgIds([]);
    await loadMessages();
    alertToast("Deleted selected message(s)");
  };

  const handleClearChat = async () => {
    const db = await getMessages(chatId);
    for (const msg of db) {
      await deleteMessage(msg.id);
    }
    setIsMenuOpen(false);
    loadMessages();
    alertToast("Chat cleared");
  };

  const triggerCallSimulation = async (isVideo: boolean) => {
    triggerVibration();
    if (!phone) {
      alertToast('No phone number for this contact', 'error');
      return;
    }
    const result = await dispatchCall(phone, name || undefined);
    if (result.action === 'pick') {
      setCallAccounts(result.accounts);
      setPendingCallNumber(phone);
      setPendingCallNameHint(name || undefined);
      setCallSimPickerOpen(true);
      return;
    }
    if (!result.success) {
      alertToast('Call failed: ' + (result.error || 'unknown'), 'error');
    }
  };

  const handlePickCallSim = async (accountId: string) => {
    triggerVibration();
    if (rememberCallSim) setPreferredCallSimId(accountId);
    const number = pendingCallNumber;
    const hint = pendingCallNameHint;
    setCallSimPickerOpen(false);
    setPendingCallNumber('');
    setPendingCallNameHint(undefined);
    if (number) {
      const res = await placeCall(number, accountId, hint);
      if (!res.success) {
        alertToast('Call failed: ' + (res.error || 'unknown'), 'error');
      }
    }
  };

  // ---- Back-button integration ----
  // Register in reverse priority: topmost UI consumes back first.
  useBackHandler(simPickerOpen, () => setSimPickerOpen(false));
  useBackHandler(headerSimPickerOpen, () => setHeaderSimPickerOpen(false));
  useBackHandler(callSimPickerOpen, () => setCallSimPickerOpen(false));

  // Reload on any SMS status change that belongs to this chat. The actual
  // DB update is done by the global SmsStatusBridge.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { chatId?: string } | undefined;
      if (!detail || detail.chatId === chatId) {
        scheduleReload();
      }
    };
    window.addEventListener('neura-sms-status', handler);
    return () => window.removeEventListener('neura-sms-status', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId]);
  // Load older messages when the user scrolls near the top.
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const onScroll = () => {
      if (container.scrollTop < 80 && hasMore && !isLoadingMore) {
        loadOlderMessages();
      }
    };
    container.addEventListener('scroll', onScroll, { passive: true });
    return () => container.removeEventListener('scroll', onScroll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMore, isLoadingMore, chatId]);

  // Cleanup debounce timer on unmount.
  useEffect(() => {
    return () => {
      if (reloadDebounceRef.current) {
        clearTimeout(reloadDebounceRef.current);
      }
    };
  }, []);

  useBackHandler(isMenuOpen, () => setIsMenuOpen(false));
  useBackHandler(isBgModalOpen, () => setIsBgModalOpen(false));
  useBackHandler(isShareOpen, () => setIsShareOpen(false));
  useBackHandler(isForwarding, () => {
    setIsForwarding(false);
    setSelectedMsgIds([]);
  });
  useBackHandler(selectedMsgIds.length > 0 && !isForwarding, () => setSelectedMsgIds([]));
  useBackHandler(!!activeMessage, () => setActiveMessage(null));

  const hasTextOrMedia = inputText.trim().length > 0;

  return (
    <div className="fixed inset-x-0 top-0 bottom-0 w-full md:max-w-md md:mx-auto bg-zinc-950 text-white flex flex-col z-30 overflow-hidden md:border-x border-zinc-900 shadow-2xl">
      {/* Pink Glowing pulsing header component */}
      <Header
        title={(() => {
          // URL name may still be a raw phone number on the first render
          // (or after a fresh chat was created from an SMS). Prefer the
          // resolved contact name when available so the header always shows
          // the saved contact title.
          const urlName = (name || '').trim();
          const looksNumeric = /^[+\d\s-]+$/.test(urlName);
          if (!urlName || looksNumeric) return resolvedContact?.name || urlName || phone;
          return urlName;
        })()}
        isChatDetail={true}
        backHref="/chats"
        onTitleClick={() => {
          triggerVibration();
          router.push(
            `/profile?phone=${encodeURIComponent(phone)}&name=${encodeURIComponent(name)}&avatar=${encodeURIComponent(avatar)}`
          );
        }}
        rightAction={
          <div className="flex items-center gap-1.5 select-none">
            {/* SIM badge — tap to change SMS SIM for this chat */}
            {headerSims.length > 0 && (
              <button
                onClick={() => {
                  triggerVibration();
                  setHeaderSimPickerOpen(true);
                }}
                className="px-2 py-1 rounded-md text-[9px] font-bold uppercase tracking-wider"
                style={{
                  backgroundColor: '#18181b',
                  color: '#00D4FF',
                  border: '1px solid rgba(0,212,255,0.35)',
                }}
                title="Change SMS SIM"
              >
                {headerSimLabel || 'SIM'}
              </button>
            )}

            {/* Voice call icon */}
            <button
              onClick={() => triggerCallSimulation(false)}
              className="p-1 px-1.5 rounded-full hover:bg-black/10 active:scale-90 transition-all text-zinc-900 cursor-pointer"
              title="Voice Call"
            >
              <Phone className="h-4.5 w-4.5 stroke-[2.5]" />
            </button>
            {/* Video call icon */}
            <button
              onClick={() => triggerCallSimulation(true)}
              className="p-1 px-1.5 rounded-full hover:bg-black/10 active:scale-90 transition-all text-zinc-900 cursor-pointer"
              title="Video Call"
            >
              <Video className="h-4.5 w-4.5 stroke-[2.5]" />
            </button>

            {/* Menu Dropdown Trigger */}
            <div className="relative">
              <button
                onClick={() => setIsMenuOpen(!isMenuOpen)}
                className="p-1 rounded-full hover:bg-[#18181b]/10 active:scale-90 transition-all text-zinc-900 cursor-pointer"
                id="chat-menu-trigger"
                title="Options"
              >
                <MoreVertical className="h-5 w-5 stroke-[2.5]" />
              </button>

              {/* Menu Dropdown Container */}
              <AnimatePresence>
                {isMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setIsMenuOpen(false)} />
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95, y: -10 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95, y: -10 }}
                      className="absolute right-0 mt-2 w-44 bg-zinc-900 border border-zinc-805 rounded-xl shadow-xl z-50 p-1.5 select-none text-left"
                      id="chat-dropdown-menu"
                    >
                      <button
                        onClick={() => {
                          setIsMenuOpen(false);
                          router.push(`/profile?name=${encodeURIComponent(name)}&phone=${encodeURIComponent(phone)}&avatar=${encodeURIComponent(avatar)}`);
                        }}
                        className="w-full text-left font-sans text-xs py-2 px-3 hover:bg-zinc-850 rounded-lg text-zinc-200 transition-colors cursor-pointer"
                      >
                        View Profile
                      </button>
                      <button
                        onClick={() => {
                          setIsMenuOpen(false);
                          setIsShareOpen(true);
                        }}
                        className="w-full text-left font-sans text-xs py-2 px-3 hover:bg-zinc-850 rounded-lg text-zinc-200 transition-colors cursor-pointer"
                      >
                        Share Profile
                      </button>
                      <button
                        onClick={() => {
                          setIsMenuOpen(false);
                          setIsBgModalOpen(true);
                        }}
                        className="w-full text-left font-sans text-xs py-2 px-3 hover:bg-zinc-850 rounded-lg text-zinc-200 transition-colors cursor-pointer"
                      >
                        Chat Background
                      </button>
                      <div className="h-[1px] bg-zinc-805 my-1" />
                      <button
                        onClick={handleClearChat}
                        className="w-full text-left font-sans text-xs py-2 px-3 hover:bg-red-950/40 text-red-450 rounded-lg transition-colors cursor-pointer"
                      >
                        Clear Chat
                      </button>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
          </div>
        }
      />

      {/* Messages Scroll Area */}
      <div className="relative flex-1 min-h-0 flex flex-col">
        {/* Per-chat custom background (behind the messages).
            Height is pinned to 100vh so the layer keeps covering the
            screen even when the soft keyboard shrinks the flex parent. */}
        {chatBg?.image && (
          <div
            className="absolute left-0 right-0 top-0 pointer-events-none bg-cover bg-center"
            style={{
              minHeight: '100vh',
              backgroundImage: `url(data:image/jpeg;base64,${chatBg.image})`,
              opacity: (chatBg.opacity ?? 40) / 100,
              backgroundPosition: `calc(50% + ${chatBg.panX ?? 0}%) calc(50% + ${chatBg.panY ?? 0}%)`,
              backgroundSize: `${(chatBg.zoom ?? 1) * 100}% auto`,
            }}
          />
        )}
      <div ref={messagesContainerRef} className="relative flex-1 overflow-y-auto px-4 pt-6 pb-1 space-y-4 no-scrollbar" id="messages-scroller">
        {messages.length === 0 ? (
          /* Empty State emoji hello with name */
          <div className="flex flex-col items-center justify-center h-full text-center py-20 select-none" id="messages-empty-state">
            <span className="text-4xl animate-bounce mb-3">💬</span>
            <p className="text-zinc-300 font-bold text-sm font-display mb-1">
              Say hello to {name}
            </p>
            <p className="text-zinc-500 text-xs px-12 leading-relaxed">
              Secure channel speed is stable. Shoot a SMS or send a pulse attachment!
            </p>
          </div>
        ) : (
          messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              msg={msg}
              isSelected={selectedMsgIds.includes(msg.id)}
              contactName={(() => {
                // If the URL name is just a phone number, prefer the
                // resolved contact name (which came from the contacts DB).
                const urlName = (name || '').trim();
                const urlLooksLikeNumber = /^[+0-9][0-9\s\-()]*$/.test(urlName);
                if (!urlName || urlLooksLikeNumber) {
                  return resolvedContact?.name || urlName || phone || 'Unknown';
                }
                return urlName;
              })()}
              contactAvatar={avatar || resolvedContact?.avatar || undefined}
              userName={msg.sender === 'user' ? senderNameFor(msg.subscriptionId) : (userProfile?.name || 'You')}
              userAvatar={userProfile?.avatar || undefined}
              bubbleColor={bubbleColor}
              simLabel={
                msg.subscriptionId != null
                  ? subsMap[msg.subscriptionId]?.label
                  : undefined
              }
              onRetry={handleRetryMessage}
              onPressStart={handleMessagePressStart}
              onPressEnd={handleMessagePressEnd}
              onMove={handleMessageMove}
              onClick={handleMessageClick}
            />
          ))
        )}
        <div ref={scrollRef} className="h-2" />
      </div>
      </div>

      {/* Selected Image Preview Bar above input */}
      {/* Bottom Message Composer Input form is fixed position and non-scrollable */}
      <form
        onSubmit={handleSendMessage}
        className="relative z-30 mx-3 mb-1 mt-1 flex items-end gap-2 select-none rounded-3xl bg-zinc-950/70 backdrop-blur-xl border border-zinc-800/60 shadow-[0_8px_30px_rgba(0,0,0,0.5)] px-2.5 py-2"
        id="messages-composer-form"
      >
        {/* Hidden Picker Input */}
        <div className="flex-1 relative">
          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Send chat..."
            rows={1}
            className="w-full bg-transparent py-2 px-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none transition-colors resize-none max-h-32 leading-snug"
            style={{ minHeight: '36px' }}
          />
        </div>

        {/* Send button is gray by default, turns yellow when there is text or media */}
        <button
          type="submit"
          className={`p-2.5 rounded-2xl transition-all duration-200 cursor-pointer shrink-0 ${
            hasTextOrMedia
              ? 'bg-[#cbfe00] text-zinc-950 font-bold shadow-[0_0_12px_rgba(203,254,0,0.45)] active:scale-95'
              : 'bg-zinc-800/60 text-zinc-500'
          }`}
          disabled={!hasTextOrMedia}
          id="message-send-btn"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>

      {/* Side-floating Tool Dock for multi-selection without backdrop blur */}
      <AnimatePresence>
        {selectedMsgIds.length > 0 && !isForwarding && (
          <motion.div
            initial={{ opacity: 0, x: 50, scale: 0.9 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 50, scale: 0.9 }}
            transition={{ type: 'spring', damping: 20, stiffness: 300 }}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 bg-white border border-zinc-200 p-2 py-3.5 rounded-full flex flex-col items-center gap-4.5 shadow-[0_4px_25px_rgba(255,255,255,0.25)] z-40 select-none"
            id="multi-select-dock"
          >
            {/* Display count of selected */}
            <span className="text-[10px] font-mono font-bold text-zinc-600 bg-zinc-100 rounded-full w-5 h-5 flex items-center justify-center border border-zinc-200">
              {selectedMsgIds.length}
            </span>

            {/* Copy Button (Black symbol) */}
            <button
              onClick={handleCopySelected}
              className="p-2 cursor-pointer hover:bg-zinc-100 active:scale-90 rounded-full transition-all text-black"
              title="Copy"
            >
              <Copy className="h-4.5 w-4.5 stroke-[2.2]" />
            </button>

            {/* Forward Button (Black symbol) */}
            <button
              onClick={() => {
                triggerVibration();
                setIsForwarding(true);
              }}
              className="p-2 cursor-pointer hover:bg-zinc-100 active:scale-90 rounded-full transition-all text-black"
              title="Forward"
            >
              <CornerUpRight className="h-4.5 w-4.5 stroke-[2.2]" />
            </button>

            {/* Delete Button (Red symbol) */}
            <button
              onClick={handleDeleteSelected}
              className="p-2 cursor-pointer hover:bg-red-50 text-red-650 active:scale-90 rounded-full transition-all text-red-600"
              title="Delete"
            >
              <Trash2 className="h-4.5 w-4.5 stroke-[2.2]" />
            </button>

            <div className="w-5 h-[1px] bg-zinc-200 my-0.5" />

            {/* Close/Deselect button (X symbol) */}
            <button
              onClick={() => setSelectedMsgIds([])}
              className="p-2 cursor-pointer hover:bg-zinc-100 active:scale-90 rounded-full transition-all text-zinc-500"
              title="Cancel Selection"
            >
              <X className="h-4 w-4 stroke-[2]" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Share profile modal overlay (with X button in top right) */}
      <AnimatePresence>
        {isShareOpen && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-6 select-none">
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-sm p-5 relative shadow-2xl">
              {/* Dynamic top-right close cross button */}
              <button
                onClick={() => setIsShareOpen(false)}
                className="absolute top-4 right-4 p-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white rounded-full transition-all cursor-pointer"
              >
                <X className="h-4.5 w-4.5" />
              </button>

              <div className="text-center space-y-4">
                {/* Title */}
                <div className="flex items-center justify-center gap-2 text-xs font-mono font-bold uppercase tracking-wider text-[#cbfe00]">
                  <Share2 className="h-4 w-4" />
                  Share Node Profile
                </div>

                {/* Profile Card */}
                <div className="bg-zinc-950 border border-zinc-850 rounded-xl p-4 flex flex-col items-center space-y-3">
                  {avatar ? (
                    <img
                      src={avatar}
                      alt={name}
                      className="w-16 h-16 rounded-full object-cover border-2 border-zinc-800"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-full bg-zinc-900 border border-zinc-850 flex items-center justify-center text-[#cbfe00] font-bold text-xl uppercase">
                      {name.slice(0, 2)}
                    </div>
                  )}

                  <div>
                    <h4 className="text-white font-bold text-sm">{name}</h4>
                    <p className="text-zinc-500 font-mono text-xs">{phone}</p>
                  </div>

                  <div className="w-full text-center py-2 px-3 bg-zinc-900/60 rounded-lg text-[10px] text-zinc-400 font-sans italic">
                    &quot;Secure Profile Connection verified&quot;
                  </div>
                </div>

                {/* Action Link Copy */}
                <div className="space-y-2 pt-2">
                  <button
                    onClick={() => {
                      triggerVibration();
                      navigator.clipboard.writeText(`NeuraChat Profile Connection:\nNode: ${name}\nPhone: ${phone}`);
                      setIsShareOpen(false);
                      alertToast("Connection copied!");
                    }}
                    className="w-full py-2 bg-[#cbfe00] hover:bg-[#b5e200] text-zinc-900 text-xs font-bold rounded-lg flex items-center justify-center gap-2 transition-all active:scale-97 cursor-pointer"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Copy Connection
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </AnimatePresence>

      {/* Forward selection drawer pop-up dialog (includes close cross button) */}
      <AnimatePresence>
        {isForwarding && (selectedMsgIds.length > 0 || activeMessage) && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-6 select-none">
            <div className="bg-zinc-900 border border-zinc-805 rounded-2xl w-full max-w-sm p-5 relative shadow-2xl flex flex-col max-h-[70vh]">
              {/* Top right close cross button */}
              <button
                onClick={() => {
                  setIsForwarding(false);
                  setSelectedMsgIds([]);
                  setActiveMessage(null);
                }}
                className="absolute top-4 right-4 p-1.5 bg-zinc-800 hover:bg-zinc-750 text-zinc-400 hover:text-white rounded-full transition-all cursor-pointer"
              >
                <X className="h-4.5 w-4.5" />
              </button>

              <div className="text-center mb-4 select-none">
                <h4 className="text-white font-bold text-sm flex items-center justify-center gap-1.5">
                  <CornerUpRight className="h-4 w-4 text-[#cbfe00]" />
                  Forward Pulse
                </h4>
                <p className="text-zinc-500 text-[10px] uppercase font-mono mt-0.5">Select destination node</p>
              </div>

              <div className="flex-1 overflow-y-auto space-y-2 pr-1 no-scrollbar">
                {contacts.length === 0 ? (
                  <p className="text-center text-zinc-500 text-xs py-8">No destination nodes available</p>
                ) : (
                  contacts.map(c => (
                    <button
                      key={c.id}
                      onClick={async () => {
                        triggerVibration();
                        const forwardChatId = `chat-${c.phone}`;
                        // Filter the exact messages that are selected
                        const selectedObjects = messages.filter(m => selectedMsgIds.includes(m.id));
                        
                        // Fallback to activeMessage if somehow selectedObjects is empty
                        const msgsToForward = selectedObjects.length > 0 
                          ? selectedObjects 
                          : (activeMessage ? [activeMessage] : []);

                        for (const msgToFwd of msgsToForward) {
                          const forwardMsg: Message = {
                            id: generateId('msg-fwd'),
                            chatId: forwardChatId,
                            text: msgToFwd.text,
                            image: msgToFwd.image,
                            sender: 'user',
                            timestamp: getCurrentTimestamp(),
                            status: 'sent'
                          };
                          await saveMessage(forwardMsg);
                        }

                        setIsForwarding(false);
                        setSelectedMsgIds([]);
                        setActiveMessage(null);
                        alertToast(`Forwarded ${msgsToForward.length} message(s) to ${c.name}`);
                      }}
                      className="w-full text-left p-2 bg-zinc-950 border border-zinc-900 hover:border-zinc-800 rounded-xl flex items-center gap-3 transition-all cursor-pointer active:scale-[0.99]"
                    >
                      <div className="w-8 h-8 rounded-full bg-zinc-900 text-[#cbfe00] flex items-center justify-center font-bold text-xs uppercase border border-zinc-850">
                        {c.name.slice(0, 2)}
                      </div>
                      <div>
                        <p className="text-white text-xs font-semibold">{c.name}</p>
                        <p className="text-zinc-500 text-[9px] font-mono">{c.phone}</p>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </AnimatePresence>

      {/* CALL SIM PICKER MODAL (2+ SIMs) */}
      <AnimatePresence>
        {callSimPickerOpen && (
          <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-6 select-none">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-sm bg-zinc-950 border border-zinc-900 rounded-3xl p-6 relative"
            >
              <button
                onClick={() => {
                  setCallSimPickerOpen(false);
                  setPendingCallNumber('');
                }}
                className="absolute top-4 right-4 text-zinc-400 hover:text-white cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>

              <h3 className="text-base font-bold font-display text-white mb-1">
                Call with
              </h3>
              <p className="text-xs text-zinc-500 mb-4">
                Choose which SIM to place this call from.
              </p>

              <div className="space-y-2">
                {callAccounts.map((acc) => (
                  <button
                    key={acc.id}
                    onClick={() => handlePickCallSim(acc.id)}
                    className="w-full bg-zinc-900 border border-zinc-800 hover:border-[#10b981]/40 hover:bg-zinc-850 rounded-xl p-3 flex items-center justify-between transition-all cursor-pointer active:scale-[0.98]"
                  >
                    <div className="text-left">
                      <p className="text-xs font-semibold text-white">{acc.label}</p>
                      {acc.accountId && (
                        <p className="text-[10px] text-zinc-500 font-mono mt-0.5">
                          {acc.accountId}
                        </p>
                      )}
                    </div>
                    <Phone className="h-4 w-4 text-[#10b981]" />
                  </button>
                ))}
              </div>

              <label className="flex items-center gap-2 mt-4 text-[11px] text-zinc-400 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={rememberCallSim}
                  onChange={(e) => setRememberCallSim(e.target.checked)}
                  className="accent-[#10b981]"
                />
                Remember my choice
              </label>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* SIM PICKER MODAL (2+ SIMs) */}
      <AnimatePresence>
        {simPickerOpen && (
          <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-6 select-none">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-sm bg-zinc-950 border border-zinc-900 rounded-3xl p-6 relative"
            >
              <button
                onClick={() => {
                  setSimPickerOpen(false);
                  setPendingSmsText('');
                }}
                className="absolute top-4 right-4 text-zinc-400 hover:text-white cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>

              <h3 className="text-base font-bold font-display text-white mb-1">
                Send SMS with
              </h3>
              <p className="text-xs text-zinc-500 mb-4">
                Choose which SIM to send this message from.
              </p>

              <div className="space-y-2">
                {subscriptions.map((sub) => (
                  <button
                    key={sub.subscriptionId}
                    onClick={() => handlePickSim(sub.subscriptionId)}
                    className="w-full bg-zinc-900 border border-zinc-800 hover:border-[#00D4FF]/40 hover:bg-zinc-850 rounded-xl p-3 flex items-center justify-between transition-all cursor-pointer active:scale-[0.98]"
                  >
                    <div className="text-left">
                      <p className="text-xs font-semibold text-white">{sub.label}</p>
                      {(sub.carrierName || sub.displayName) && (
                        <p className="text-[10px] text-zinc-500 font-mono mt-0.5">
                          {sub.carrierName || sub.displayName}
                        </p>
                      )}
                    </div>
                    <MessageSquare className="h-4 w-4 text-[#00D4FF]" />
                  </button>
                ))}
              </div>

              <label className="flex items-center gap-2 mt-4 text-[11px] text-zinc-400 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={rememberSim}
                  onChange={(e) => setRememberSim(e.target.checked)}
                  className="accent-[#00D4FF]"
                />
                Remember my choice
              </label>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* HEADER SIM PICKER MODAL */}
      <AnimatePresence>
        {headerSimPickerOpen && (
          <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-6 select-none">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-sm bg-zinc-950 border border-zinc-900 rounded-3xl p-6 relative"
            >
              <button
                onClick={() => setHeaderSimPickerOpen(false)}
                className="absolute top-4 right-4 text-zinc-400 hover:text-white cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>

              <h3 className="text-base font-bold font-display text-white mb-1">
                SMS SIM
              </h3>
              <p className="text-xs text-zinc-500 mb-4">
                Choose which SIM sends messages from this chat.
              </p>

              <div className="space-y-2">
                <button
                  onClick={clearHeaderSim}
                  className={`w-full bg-zinc-900 border rounded-xl p-3 text-left transition-all cursor-pointer active:scale-[0.98] ${
                    !headerSimLabel || headerSimLabel === 'Default'
                      ? 'border-[#00D4FF]/50'
                      : 'border-zinc-800 hover:bg-zinc-850'
                  }`}
                >
                  <p className="text-xs font-semibold text-white">Always ask / Default</p>
                  <p className="text-[10px] text-zinc-500 mt-0.5">
                    Prompt each time when multiple SIMs are active
                  </p>
                </button>
                {headerSims.map((sub) => (
                  <button
                    key={sub.subscriptionId}
                    onClick={() => pickHeaderSim(sub)}
                    className={`w-full bg-zinc-900 border rounded-xl p-3 text-left transition-all cursor-pointer active:scale-[0.98] ${
                      headerSimLabel === sub.label
                        ? 'border-[#00D4FF]/50'
                        : 'border-zinc-800 hover:bg-zinc-850'
                    }`}
                  >
                    <p className="text-xs font-semibold text-white">{sub.label}</p>
                    {sub.carrierName && (
                      <p className="text-[10px] text-zinc-500 mt-0.5 font-mono">
                        {sub.carrierName}
                      </p>
                    )}
                  </button>
                ))}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Floating alert toast notification */}
      <AnimatePresence>
        {toastMessage && (
          <div
            className="fixed bottom-24 left-1/2 -translate-x-1/2 px-4 py-2.5 rounded-xl text-xs font-semibold shadow-2xl z-50 flex items-center gap-2 max-w-[85%]"
            style={{
              backgroundColor: '#18181b',
              color: '#ffffff',
              borderWidth: 1,
              borderStyle: 'solid',
              borderColor:
                toastKind === 'error'
                  ? '#FF006E'
                  : toastKind === 'success'
                  ? '#10b981'
                  : '#00D4FF',
            }}
          >
            <span
              style={{
                display: 'inline-block',
                width: 6,
                height: 6,
                borderRadius: 9999,
                backgroundColor:
                  toastKind === 'error'
                    ? '#FF006E'
                    : toastKind === 'success'
                    ? '#10b981'
                    : '#00D4FF',
                flexShrink: 0,
              }}
            />
            <span style={{ wordBreak: 'break-word' }}>{toastMessage}</span>
          </div>
        )}
      </AnimatePresence>

      <ChatBackgroundModal
        open={isBgModalOpen}
        current={chatBg || undefined}
        onCancel={() => setIsBgModalOpen(false)}
        onSave={(bg) => {
          saveChatBackground(bg);
          setIsBgModalOpen(false);
        }}
      />
    </div>
  );
}

export default function ChatDetailPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-black flex items-center justify-center">
        <label className="text-[#cbfe00] text-xs font-mono">Loading Neural Channel...</label>
      </div>
    }>
      <ChatDetailContent />
    </Suspense>
  );
}
