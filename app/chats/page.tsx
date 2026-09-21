'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import {
  Search,
  MessageSquare,
  Plus,
  Trash2,
  Archive,
  CheckSquare,
  X,
  UserPlus,
  RefreshCw,
  CheckCheck,
} from 'lucide-react';
import {
  getChats,
  saveChat,
  deleteChat,
  getContacts,
  saveContact,
  Contact,
  Chat,
} from '@/lib/db';
import { syncDeviceContacts } from '@/lib/capacitor';
import Header from '@/components/Header';
import BottomNav from '@/components/BottomNav';
import { generateId, getCurrentTimestamp } from '@/lib/utils';

export default function ChatsPage() {
  const router = useRouter();
  const [chats, setChats] = useState<Chat[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Selection mode states
  const [selectedChatIds, setSelectedChatIds] = useState<string[]>([]);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const pressTimer = useRef<NodeJS.Timeout | null>(null);

  // New Chat Dialog States
  const [isNewChatOpen, setIsNewChatOpen] = useState(false);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactSearch, setContactSearch] = useState('');
  const [syncingContacts, setSyncingContacts] = useState(false);

  // Manual Contact Add States
  const [isManualAddOpen, setIsManualAddOpen] = useState(false);
  const [manualName, setManualName] = useState('');
  const [manualPhone, setManualPhone] = useState('');
  const [manualError, setManualError] = useState('');

  // Fetch chats and update
  const loadChatsData = async () => {
    try {
      const data = await getChats();
      setChats(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const handle = setTimeout(() => {
      loadChatsData();
    }, 0);
    return () => clearTimeout(handle);
  }, []);

  // Format date helper
  const formatTime = (ts: number) => {
    const date = new Date(ts);
    const now = new Date();
    if (date.toDateString() === now.toDateString()) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  // Safe Haptic feedback wrapping
  const triggerVibration = () => {
    if (typeof window !== 'undefined' && window.navigator && window.navigator.vibrate) {
      window.navigator.vibrate(50);
    }
  };

  // Start Selection Long Press Handlers
  const handlePressStart = (chatId: string) => {
    if (isSelectionMode) return;
    pressTimer.current = setTimeout(() => {
      triggerVibration();
      setIsSelectionMode(true);
      setSelectedChatIds([chatId]);
    }, 600); // 600ms long press
  };

  const handlePressEnd = () => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  };

  const handleChatTap = (chat: Chat) => {
    if (isSelectionMode) {
      triggerVibration();
      if (selectedChatIds.includes(chat.id)) {
        const updated = selectedChatIds.filter(id => id !== chat.id);
        setSelectedChatIds(updated);
        if (updated.length === 0) {
          setIsSelectionMode(false);
        }
      } else {
        setSelectedChatIds([...selectedChatIds, chat.id]);
      }
    } else {
      router.push(`/chat-detail?phone=${encodeURIComponent(chat.phone)}&name=${encodeURIComponent(chat.name)}&avatar=${encodeURIComponent(chat.avatar || '')}`);
    }
  };

  // Toolbar actions
  const handleDeleteSelected = async () => {
    triggerVibration();
    for (const id of selectedChatIds) {
      await deleteChat(id);
    }
    setSelectedChatIds([]);
    setIsSelectionMode(false);
    loadChatsData();
  };

  const handleArchiveSelected = async () => {
    triggerVibration();
    for (const id of selectedChatIds) {
      const match = chats.find(c => c.id === id);
      if (match) {
        match.archived = !match.archived;
        await saveChat(match);
      }
    }
    setSelectedChatIds([]);
    setIsSelectionMode(false);
    loadChatsData();
  };

  const handleMarkReadSelected = async () => {
    triggerVibration();
    for (const id of selectedChatIds) {
      const match = chats.find(c => c.id === id);
      if (match) {
        match.unread = 0;
        await saveChat(match);
      }
    }
    setSelectedChatIds([]);
    setIsSelectionMode(false);
    loadChatsData();
  };

  // Contacts sync & add functions
  const openNewChat = async () => {
    setIsNewChatOpen(true);
    setSyncingContacts(true);
    try {
      const stored = await getContacts();
      setContacts(stored);
    } catch (e) {
      console.error(e);
    } finally {
      setSyncingContacts(false);
    }
  };

  const handleSyncContacts = async () => {
    setSyncingContacts(true);
    try {
      const synced = await syncDeviceContacts();
      const latest = await getContacts();
      setContacts(latest);
    } catch (e) {
      console.error(e);
    } finally {
      setSyncingContacts(false);
    }
  };

  const handleSelectContactForChat = async (contact: Contact) => {
    setIsNewChatOpen(false);
    // Open or create chat
    const existingChatId = `chat-${contact.phone}`;
    const newChat: Chat = {
      id: existingChatId,
      name: contact.name,
      phone: contact.phone,
      avatar: contact.avatar || '',
      lastMessage: '',
      timestamp: getCurrentTimestamp(),
      unread: 0,
      archived: false
    };
    await saveChat(newChat);
    router.push(`/chat-detail?phone=${encodeURIComponent(contact.phone)}&name=${encodeURIComponent(contact.name)}&avatar=${encodeURIComponent(contact.avatar || '')}`);
  };

  const handleAddManualContact = async (e: React.FormEvent) => {
    e.preventDefault();
    setManualError('');
    if (!manualName.trim() || !manualPhone.trim()) {
      setManualError('Name and phone are required.');
      return;
    }
    const cleanPhone = manualPhone.replace(/\s+/g, '');
    if (!/^\+?[0-9]{7,15}$/.test(cleanPhone)) {
      setManualError('Enter a valid phone number (7-15 digits).');
      return;
    }

    try {
      const newContact: Contact = {
        id: generateId('contact'),
        name: manualName.trim(),
        phone: cleanPhone,
        favorite: false
      };
      await saveContact(newContact);
      setContacts(await getContacts());
      setIsManualAddOpen(false);
      setManualName('');
      setManualPhone('');
      handleSelectContactForChat(newContact);
    } catch (err) {
      setManualError('Failed to save contact.');
    }
  };

  // Search filtering
  const filteredChats = chats.filter(chat =>
    chat.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (chat.lastMessage || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredContacts = contacts.filter(c =>
    c.name.toLowerCase().includes(contactSearch.toLowerCase()) ||
    c.phone.includes(contactSearch)
  );

  return (
    <>
      {/* Top Header */}
      {isSelectionMode ? (
        <header className="sticky top-0 left-0 right-0 h-16 bg-[#00D4FF] text-black flex items-center px-4 justify-between z-40 shadow-[0_0_15px_rgba(0,212,255,0.7)]">
          <div className="flex items-center gap-3 font-semibold font-display">
            <button
              onClick={() => {
                setSelectedChatIds([]);
                setIsSelectionMode(false);
              }}
              className="p-1 rounded-full hover:bg-black/10 cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
            <span>{selectedChatIds.length} Selected</span>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={handleMarkReadSelected}
              title="Mark as Read"
              className="p-1 rounded hover:bg-black/10 cursor-pointer"
            >
              <CheckSquare className="h-5 w-5" />
            </button>
            <button
              onClick={handleArchiveSelected}
              title="Archive"
              className="p-1 rounded hover:bg-black/10 cursor-pointer"
            >
              <Archive className="h-5 w-5" />
            </button>
            <button
              onClick={handleDeleteSelected}
              title="Delete"
              className="p-1 rounded hover:bg-black/10 cursor-pointer"
            >
              <Trash2 className="h-5 w-5 animate-bounce" />
            </button>
          </div>
        </header>
      ) : (
        <Header title="Chats" />
      )}

      {/* Main Content Area */}
      <main className="flex-1 p-4 overflow-y-auto" id="chats-main-container">
        {/* Search Bar */}
        <div className="flex gap-2.5 mb-4 items-center">
          <div className="relative flex-1" id="chat-search-bar">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
            <input
              type="text"
              placeholder="Search chats..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl py-2 px-9 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-[#00D4FF] focus:ring-1 focus:ring-[#00D4FF]/30 transition-all"
            />
          </div>
        </div>

        {loading ? (
          // Skeleton Loading
          <div className="space-y-3" id="chats-skeleton">
            {[1, 2, 3].map((n) => (
              <div key={n} className="flex gap-4 p-3 bg-zinc-950 border border-zinc-900 rounded-xl animate-pulse">
                <div className="w-12 h-12 bg-zinc-850 rounded-full" />
                <div className="flex-1 space-y-2 py-1">
                  <div className="h-4 bg-zinc-850 rounded w-1/3" />
                  <div className="h-3 bg-zinc-850 rounded w-2/3" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredChats.length === 0 ? (
          /* Empty State */
          <div className="flex flex-col items-center justify-center py-16 text-center select-none" id="chats-empty-state">
            <div className="w-16 h-16 bg-gradient-to-tr from-[#00D4FF]/10 to-[#FF006E]/10 rounded-full border border-zinc-800 flex items-center justify-center mb-4 text-zinc-600">
              <MessageSquare className="h-8 w-8 text-zinc-500" />
            </div>
            <p className="text-zinc-400 font-semibold text-sm font-display mb-1">
              No conversations active
            </p>
            <p className="text-zinc-600 text-xs px-6 max-w-xs leading-normal">
              Tap the (+) neon channel below to start your first conversation.
            </p>
          </div>
        ) : (
          /* Chat List */
          <div className="space-y-2" id="chats-list">
            <AnimatePresence>
              {filteredChats.map((chat) => {
                const isSelected = selectedChatIds.includes(chat.id);
                return (
                  <motion.div
                    key={chat.id}
                    layoutId={`chat-item-${chat.id}`}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    onPointerDown={() => handlePressStart(chat.id)}
                    onPointerUp={handlePressEnd}
                    onPointerCancel={handlePressEnd}
                    onTouchStart={() => handlePressStart(chat.id)}
                    onTouchEnd={handlePressEnd}
                    onClick={() => handleChatTap(chat)}
                    className={`flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer relative select-none ${
                      isSelected
                        ? 'bg-zinc-900 border-[#00D4FF] scale-98 shadow-[0_0_10px_rgba(0,212,255,0.2)]'
                        : 'bg-zinc-950 border-zinc-900 hover:border-zinc-800 active:bg-zinc-900/40'
                    }`}
                  >
                    {/* Selected Badge Ring Overlay */}
                    {isSelected && (
                      <div className="absolute top-2 right-2 w-4 h-4 rounded-full bg-[#00D4FF] flex items-center justify-center shadow-lg">
                        <CheckCheck className="h-2.5 w-2.5 text-black" />
                      </div>
                    )}

                    {/* Avatar with initials or placeholder */}
                    <div className="relative">
                      <div className="w-12 h-12 rounded-full overflow-hidden bg-gradient-to-tr from-zinc-800 to-zinc-900 border border-zinc-800 flex items-center justify-center text-[#00D4FF] font-semibold text-lg font-display uppercase tracking-wider relative shadow-inner">
                        {chat.name.slice(0, 2)}
                      </div>
                      <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-zinc-950" />
                    </div>

                    {/* Chat Description Blocks */}
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-baseline mb-0.5">
                        <h3 className="font-semibold text-sm truncate text-white font-sans">
                          {chat.name}
                        </h3>
                        <span className="text-[10px] text-zinc-500 font-mono">
                          {formatTime(chat.timestamp)}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-400 truncate max-w-sm pointer-events-none">
                        {chat.lastMessage || 'Channel established. Say hello!'}
                      </p>
                    </div>

                    {/* Unread & Action Indicators */}
                    {chat.unread > 0 && !isSelected && (
                      <div className="min-w-5 h-5 px-1.5 rounded-full bg-[#FF006E] text-white text-[10px] font-bold flex items-center justify-center shadow-md animate-pulse">
                        {chat.unread}
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}

        {/* NEW CHAT DIALOG OVERLAY (Single tab: Contacts list) */}
        <AnimatePresence>
          {isNewChatOpen && (
            <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-end justify-center select-none">
              <motion.div
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 220 }}
                className="w-full max-w-md bg-zinc-950 border-t border-zinc-900 rounded-t-3xl p-6 pb-8 max-h-[85vh] flex flex-col justify-between"
                id="new-chat-modal"
              >
                <div>
                  {/* Modal Header */}
                  <div className="flex justify-between items-center mb-4">
                    <h2 className="text-lg font-bold font-display text-white drop-shadow-[0_0_6px_rgba(0,212,255,0.3)]">
                      New Chat
                    </h2>
                    <button
                      onClick={() => setIsNewChatOpen(false)}
                      className="p-1 rounded-full bg-zinc-900 text-zinc-400 hover:text-white cursor-pointer"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>

                  {/* Manual Contact option at top & Sync Buttons */}
                  <div className="flex gap-2 mb-4">
                    <button
                      onClick={() => setIsManualAddOpen(true)}
                      className="flex-1 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-300 text-xs py-2.5 px-3 rounded-xl flex items-center justify-center gap-2 font-medium active:scale-97 transition-all cursor-pointer"
                    >
                      <UserPlus className="h-4 w-4 text-[#00D4FF]" />
                      Add Manual Contact
                    </button>

                    <button
                      onClick={handleSyncContacts}
                      disabled={syncingContacts}
                      className="flex-1 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-300 text-xs py-2.5 px-3 rounded-xl flex items-center justify-center gap-2 font-medium active:scale-97 transition-all disabled:opacity-50 cursor-pointer"
                    >
                      <RefreshCw className={`h-4 w-4 text-[#FF006E] ${syncingContacts ? 'animate-spin' : ''}`} />
                      Sync Phone Contacts
                    </button>
                  </div>

                  {/* Search filter */}
                  <div className="relative mb-3">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                    <input
                      type="text"
                      placeholder="Search contacts..."
                      value={contactSearch}
                      onChange={(e) => setContactSearch(e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-xl py-2 px-9 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-[#00D4FF]"
                    />
                  </div>
                </div>

                {/* Contacts List container */}
                <div className="flex-1 overflow-y-auto pr-1 select-none py-1 no-scrollbar space-y-1.5 h-64">
                  {syncingContacts ? (
                    <div className="flex flex-col items-center justify-center h-32 py-12 gap-3">
                      <div className="w-8 h-8 rounded-full border-2 border-t-transparent border-[#00D4FF] animate-spin" />
                      <span className="text-zinc-500 text-xs font-mono">Syncing phone contacts...</span>
                    </div>
                  ) : filteredContacts.length === 0 ? (
                    <div className="text-center py-10">
                      <p className="text-zinc-500 text-xs font-sans">No indexed contacts match your check.</p>
                    </div>
                  ) : (
                    filteredContacts.map((contact) => (
                      <div
                        key={contact.id}
                        onClick={() => handleSelectContactForChat(contact)}
                        className="flex items-center gap-3 p-2.5 rounded-xl bg-zinc-900/40 hover:bg-zinc-900 border border-transparent hover:border-zinc-800 transition-all cursor-pointer active:scale-98"
                      >
                        <div className="w-10 h-10 rounded-full bg-zinc-800 text-[#00D4FF] flex items-center justify-center font-bold text-sm">
                          {contact.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-white text-xs font-semibold">{contact.name}</p>
                          <p className="text-zinc-500 text-[11px] font-mono">{contact.phone}</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* MANUAL CONTACT INPUT OVERLAY */}
        <AnimatePresence>
          {isManualAddOpen && (
            <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-50 flex items-center justify-center p-6 select-none">
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="w-full max-w-sm bg-zinc-950 border border-zinc-900 rounded-3xl p-6 relative"
              >
                <button
                  onClick={() => setIsManualAddOpen(false)}
                  className="absolute top-4 right-4 text-zinc-400 hover:text-white"
                >
                  <X className="h-5 w-5" />
                </button>

                <h3 className="text-base font-bold font-display text-white mb-4 drop-shadow-[0_0_8px_rgba(255,0,110,0.4)]">
                  Add Manual Contact
                </h3>

                <form onSubmit={handleAddManualContact} className="space-y-4">
                  {manualError && (
                    <p className="text-xs text-[#FF006E] font-medium leading-none">{manualError}</p>
                  )}

                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-mono block">
                      Display Name
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Nicola Tesla"
                      value={manualName}
                      onChange={(e) => setManualName(e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-850 rounded-xl px-4 py-2.5 text-xs text-white placeholder-zinc-650 focus:outline-none focus:border-[#00D4FF]"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-mono block">
                      Phone Number
                    </label>
                    <input
                      type="tel"
                      required
                      placeholder="e.g. +14155551234"
                      value={manualPhone}
                      onChange={(e) => setManualPhone(e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-850 rounded-xl px-4 py-2.5 text-xs text-white placeholder-zinc-650 focus:outline-none focus:border-[#FF006E]"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full bg-[#00D4FF] hover:bg-[#00B2D6] text-black font-semibold text-xs py-3 rounded-xl shadow-[0_0_12px_rgba(0,212,255,0.3)] active:scale-95 transition-all mt-2 cursor-pointer"
                  >
                    Confirm Contact Sync
                  </button>
                </form>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

      </main>

      {/* FAB To Open Contacts Menu - Now outside scroll container & positioned absolute */}
      <button
        onClick={openNewChat}
        className="absolute bottom-24 right-5 w-14 h-14 bg-gradient-to-tr from-[#00D4FF] to-[#008BBF] text-black rounded-full flex items-center justify-center shadow-[0_0_15px_rgba(0,212,255,0.4)] hover:shadow-[0_0_20px_rgba(0,212,255,0.6)] cursor-pointer hover:scale-105 active:scale-95 transition-all z-40"
        aria-label="New Chat"
        id="new-chat-fab"
      >
        <Plus className="h-6 w-6 stroke-[3]" />
      </button>

      {/* Bottom Main Tab Bar */}
      <BottomNav currentTab="chats" />
    </>
  );
}
