'use client';

import React, { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import {
  Send,
  Paperclip,
  MoreVertical,
  Trash2,
  Copy,
  ArrowLeft,
  Smile,
  X,
  FileImage,
  Check,
  CheckCheck,
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
  saveMessage,
  deleteMessage,
  getChats,
  saveChat,
  getContacts,
  Message,
  Chat,
  Contact
} from '@/lib/db';
import Header from '@/components/Header';
import { generateId, getCurrentTimestamp } from '@/lib/utils';
import { useBackHandler } from '@/lib/use-back-handler';
import { chatIdFromPhone } from '@/lib/phone';
import { dispatchCall, placeCall, setPreferredCallSimId, CallAccount } from '@/lib/telecom-plugin';
import { getActiveSubscriptions, sendSmsTracked, isSmsPluginAvailable, getPreferredSimId, setPreferredSimId, addSmsStatusListener, isDefaultSmsApp, requestDefaultSmsRole, Subscription } from '@/lib/sms-plugin';

function ChatDetailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const phone = searchParams.get('phone') || '';
  const name = searchParams.get('name') || 'Neural Link';
  const avatar = searchParams.get('avatar') || '';
  const chatId = chatIdFromPhone(phone);

  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  
  // Header Options Menu Dropdown state
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // Selected Message Context Dialog (Copy/Delete)
  const [activeMessage, setActiveMessage] = useState<Message | null>(null);
  const [selectedMsgIds, setSelectedMsgIds] = useState<string[]>([]);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const justLongPressedRef = useRef(false);
  const msgTouchStartRef = useRef<{ x: number; y: number } | null>(null);
  const msgMovedRef = useRef(false);
  const MSG_SWIPE_THRESHOLD = 8;

  // File Picker Input reference
  const fileInputRef = useRef<HTMLInputElement>(null);
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

  // Load message logs
  const loadMessages = async () => {
    if (!phone) return;
    try {
      // Only load existing messages. Chat entry is created on first send.
      const logs = await getMessages(chatId);
      setMessages(logs);
    } catch (e) {
      console.error(e);
    }
  };

  // Ensure a chat entry exists for this contact.
  const ensureChatExists = async () => {
    try {
      const currentChats = await getChats();
      const exists = currentChats.some(c => c.id === chatId);
      if (exists) return;
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
      await saveChat(matchingChat);
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
        if (found && found.name) {
          // Update the chat record so the Chats list also shows the name.
          const chats = await getChats();
          const c = chats.find((x) => x.id === chatId);
          if (c && c.name !== found.name) {
            c.name = found.name;
            await saveChat(c);
          }
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

  // Mark this chat as read whenever it is opened.
  const markChatRead = async () => {
    try {
      const chats = await getChats();
      const c = chats.find((x) => x.id === chatId);
      if (c && (c.unread || 0) > 0) {
        c.unread = 0;
        await saveChat(c);
      }
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
        loadMessages();
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

  // Attach Image via hidden input file picker
  const handleImagePickClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setSelectedImage(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  // Actually send the SMS with tracked status. clientId == message id in DB.
  const performSmsSend = async (text: string, subscriptionId: number | undefined, clientId: string) => {
    if (!isSmsPluginAvailable()) {
      alertToast('Native SMS unavailable — opening system messenger', 'error');
      const smsBody = encodeURIComponent(text);
      window.location.href = `sms:${phone}?body=${smsBody}`;
      return;
    }

    // If we are not the default SMS app, ask the user to grant that role
    // before sending. Without it our sends are unreliable on some ROMs and
    // other apps intercept SMS_RECEIVED.
    try {
      const isDefault = await isDefaultSmsApp();
      if (!isDefault) {
        alertToast('Set NeuraChat as default SMS app to send', 'error');
        const ok = await requestDefaultSmsRole();
        if (ok) {
          // Wait for the user to return from the system dialog.
          await new Promise((r) => setTimeout(r, 1200));
        }
        // Continue and attempt the send anyway — some carriers/ROMs still allow it.
      }
    } catch (e) {
      console.warn('default SMS check failed', e);
    }

    try {
      await sendSmsTracked(phone, text, clientId, subscriptionId);
      console.log('SMS queued, clientId=', clientId);
    } catch (err: any) {
      console.error('sendSmsTracked failed:', err);
      alertToast('Send failed: ' + (err?.message || 'unknown error'), 'error');
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
    if (!inputText.trim() && !selectedImage) return;

    const bodyText = inputText.trim();

    // 1. Build message payload for database
    const newMsg: Message = {
      id: generateId('msg'),
      chatId,
      text: bodyText,
      image: selectedImage || undefined,
      sender: 'user',
      timestamp: getCurrentTimestamp(),
      status: 'sent'
    };

    // 2. Ensure chat entry exists before saving the first message
    await ensureChatExists();

    // 3. Save locally in IndexedDB
    await saveMessage(newMsg);
    
    // Clear inputs immediately
    setInputText('');
    setSelectedImage(null);

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
      msg.status = 'sent';
      await saveMessage(msg);
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

    // Only allow tap-to-toggle when selection mode is already active
    // (initiated by an earlier long press).
    if (selectedMsgIds.length > 0) {
      triggerVibration();
      if (selectedMsgIds.includes(msg.id)) {
        setSelectedMsgIds(prev => prev.filter(id => id !== msg.id));
      } else {
        setSelectedMsgIds(prev => [...prev, msg.id]);
      }
    }
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
    const result = await dispatchCall(phone);
    if (result.action === 'pick') {
      setCallAccounts(result.accounts);
      setPendingCallNumber(phone);
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
    setCallSimPickerOpen(false);
    setPendingCallNumber('');
    if (number) {
      const res = await placeCall(number, accountId);
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

  // Track SMS sent/delivered/failed status
  useEffect(() => {
    let handle: { remove: () => void } | null = null;
    let cancelled = false;

    (async () => {
      if (!isSmsPluginAvailable()) return;
      await new Promise((r) => setTimeout(r, 1000));
      if (cancelled) return;
      handle = await addSmsStatusListener(async (ev) => {
        console.log('[SMS status]', ev);
        try {
          const msgs = await getMessages(chatId);
          const m = msgs.find((x) => x.id === ev.clientId);
          if (!m) return;
          if (ev.status === 'sent') {
            m.status = 'sent';
            await saveMessage(m);
          } else if (ev.status === 'delivered') {
            m.status = 'read';
            await saveMessage(m);
          } else if (ev.status === 'failed') {
            m.status = 'failed';
            await saveMessage(m);
            alertToast('SMS failed — tap Retry to resend', 'error');
          }
          await loadMessages();
        } catch (e) {
          console.error('status update failed', e);
        }
      });
    })();

    return () => {
      cancelled = true;
      if (handle && handle.remove) { try { handle.remove(); } catch {} }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId]);
  useBackHandler(isMenuOpen, () => setIsMenuOpen(false));
  useBackHandler(isShareOpen, () => setIsShareOpen(false));
  useBackHandler(isForwarding, () => {
    setIsForwarding(false);
    setSelectedMsgIds([]);
  });
  useBackHandler(selectedMsgIds.length > 0 && !isForwarding, () => setSelectedMsgIds([]));
  useBackHandler(!!activeMessage, () => setActiveMessage(null));

  const hasTextOrMedia = inputText.trim().length > 0 || selectedImage !== null;

  return (
    <div className="fixed inset-x-0 top-0 bottom-0 w-full md:max-w-md md:mx-auto bg-zinc-950 text-white flex flex-col z-30 overflow-hidden md:border-x border-zinc-900 shadow-2xl">
      {/* Pink Glowing pulsing header component */}
      <Header
        title={name}
        subtitle="Active now"
        isChatDetail={true}
        backHref="/chats"
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
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4 no-scrollbar" id="messages-scroller">
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
          messages.map((msg) => {
            const isUser = msg.sender === 'user';
            const isSelected = selectedMsgIds.includes(msg.id);
            return (
              <motion.div
                key={msg.id}
                onPointerDown={(e) => handleMessagePressStart(msg, e.clientX, e.clientY)}
                onPointerUp={handleMessagePressEnd}
                onPointerCancel={handleMessagePressEnd}
                onTouchStart={(e) => {
                  const t = e.touches[0];
                  handleMessagePressStart(msg, t?.clientX, t?.clientY);
                }}
                onTouchMove={(e) => {
                  const t = e.touches[0];
                  if (t) handleMessageMove(t.clientX, t.clientY);
                }}
                onTouchEnd={handleMessagePressEnd}
                onClick={() => handleMessageClick(msg)}
                initial={{ opacity: 0, x: isUser ? 25 : -25, scale: 0.95 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                className={`flex ${isUser ? 'justify-end' : 'justify-start'} select-none cursor-pointer`}
              >
                {/* User message bubble size is 50% less width (max-w-[43%]), crisp styled and time at top-right inside bubble */}
                <div
                  className={`p-2.5 px-3 rounded-xl relative transition-all duration-200 flex flex-col justify-between ${
                    isUser
                      ? 'max-w-[44%] bg-[#cbfe00] text-zinc-950 rounded-tr-none'
                      : 'max-w-[70%] bg-zinc-900 border border-zinc-805 text-zinc-100 rounded-tl-none'
                  } ${isSelected ? 'ring-2.5 ring-yellow-400 scale-[0.97] shadow-[0_0_15px_rgba(234,179,8,0.5)]' : ''}`}
                >
                  {/* Top-Right Time inside the Bubble */}
                  <div className="flex justify-end items-center mb-1 select-none opacity-60 text-[9px] font-mono leading-none">
                    <span className={isUser ? 'text-zinc-800 font-semibold' : 'text-zinc-400'}>
                      {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>

                  {/* Image Bubble rendering */}
                  {msg.image && (
                    <div className="mb-2 rounded-lg overflow-hidden border border-black/10">
                      <img
                        src={msg.image}
                        alt="Shared asset"
                        className="max-h-40 w-full object-cover"
                      />
                    </div>
                  )}

                  {/* Body Text */}
                  {msg.text && (
                    <p className="text-xs leading-relaxed font-sans break-words whitespace-pre-wrap font-medium">
                      {msg.text}
                    </p>
                  )}

                  {/* Status / retry row */}
                  {isUser && (
                    <div className="flex justify-end mt-0.5">
                      {msg.status === 'failed' ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRetryMessage(msg);
                          }}
                          className="text-[10px] font-bold text-red-600 underline-offset-2 hover:underline"
                        >
                          Retry
                        </button>
                      ) : msg.status === 'read' ? (
                        <CheckCheck className="h-3 w-3 text-emerald-700 font-bold opacity-80" />
                      ) : (
                        <Check className="h-3 w-3 text-zinc-650 opacity-80" />
                      )}
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })
        )}
        <div ref={scrollRef} className="h-2" />
      </div>

      {/* Selected Image Preview Bar above input */}
      {selectedImage && (
        <div className="bg-zinc-900 border-t border-zinc-805 p-2 flex items-center justify-between select-none">
          <div className="flex items-center gap-2">
            <FileImage className="h-4 w-4 text-[#cbfe00]" />
            <span className="text-[10px] text-zinc-400 truncate max-w-sm">Pulse Media Attachment Ready...</span>
          </div>
          <button
            onClick={() => setSelectedImage(null)}
            className="p-1 rounded-full bg-zinc-800 text-zinc-400 hover:text-white cursor-pointer"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Bottom Message Composer Input form is fixed position and non-scrollable */}
      <form
        onSubmit={handleSendMessage}
        className="p-2 px-3 bg-zinc-950 border-t border-zinc-900 flex items-center gap-2 z-30 select-none pb-4"
        id="messages-composer-form"
      >
        <button
          type="button"
          onClick={handleImagePickClick}
          className="p-2.5 bg-zinc-900 text-zinc-450 hover:text-white rounded-xl transition-colors active:scale-90 cursor-pointer"
          title="Attach Image"
          id="image-attach-btn"
        >
          <Paperclip className="h-4 w-4 text-[#cbfe00]" />
        </button>

        {/* Hidden Picker Input */}
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept="image/*"
          className="hidden"
          id="hidden-file-input"
        />

        <div className="flex-1 relative">
          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => {
              // Enter (without Shift) sends the message. Shift+Enter inserts
              // a newline. This matches standard chat keyboard behavior.
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (inputText.trim() || selectedImage) {
                  handleSendMessage();
                }
              }
            }}
            placeholder="Encrypt and send pulse..."
            rows={1}
            className="w-full bg-zinc-900 border border-zinc-850 rounded-xl py-2 px-3 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-[#cbfe00] transition-colors resize-none max-h-24"
            style={{ minHeight: '36px' }}
          />
        </div>

        {/* Send button is gray by default, turns yellow when there is text or media */}
        <button
          type="submit"
          className={`p-2.5 rounded-xl transition-all duration-200 cursor-pointer ${
            hasTextOrMedia
              ? 'bg-yellow-400 text-zinc-950 font-bold shadow-[0_0_12px_rgba(234,179,8,0.4)] active:scale-95'
              : 'bg-zinc-800 text-zinc-500'
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
