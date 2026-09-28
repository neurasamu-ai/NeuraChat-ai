'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import {
  Users,
  Search,
  Plus,
  Star,
  MessageSquare,
  Phone,
  Settings,
  X,
  UserPlus,
  MoreVertical,
  Mail,
  Camera,
  Trash2,
  Info,
  RefreshCw,
  Ban
} from 'lucide-react';
import {
  saveContact,
  deleteContact,
  Contact
} from '@/lib/db';
import Header from '@/components/Header';
import BottomNav from '@/components/BottomNav';
import { generateId, getCurrentTimestamp } from '@/lib/utils';
import { useBackHandler } from '@/lib/use-back-handler';
import { normalizePhone } from '@/lib/phone';
import { getWritableAccounts, saveContactToAccount, deleteRawContact, WritableAccount } from '@/lib/neura-contacts';
import CallSimPicker from '@/components/CallSimPicker';
import { useSimCall } from '@/hooks/use-sim-call';
import { blockContact, isBlocked, unblockContact, getBlockedContacts } from '@/lib/db';
import { syncBlockedListToNative } from '@/lib/sms-plugin';
import { useContacts } from '@/lib/use-contacts';
import { bootstrapContacts, forceSyncContacts, loadContactsFromDB } from '@/lib/contacts-store';

export default function ContactsPage() {
  const router = useRouter();

  const contactsStore = useContacts();
  const contacts = contactsStore.contacts;
  const storeLoading = contactsStore.loading && !contactsStore.loadedOnce;
  const [syncing, setSyncing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Search press handling or timer state reference
  const longPressTimerRef = React.useRef<NodeJS.Timeout | null>(null);
  const isLongPressActiveRef = React.useRef(false);

  const touchStartPosRef = React.useRef<{ x: number; y: number } | null>(null);
  const movedRef = React.useRef(false);
  const SWIPE_THRESHOLD = 8; // px

  const cancelLongPress = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const startPress = (contact: Contact, clientX?: number, clientY?: number) => {
    isLongPressActiveRef.current = false;
    movedRef.current = false;
    if (typeof clientX === 'number' && typeof clientY === 'number') {
      touchStartPosRef.current = { x: clientX, y: clientY };
    }
    cancelLongPress();
    longPressTimerRef.current = setTimeout(() => {
      isLongPressActiveRef.current = true;
      triggerVibration();
      setActiveContact(contact);
    }, 600);
  };

  const movePress = (clientX: number, clientY: number) => {
    if (!touchStartPosRef.current) return;
    const dx = Math.abs(clientX - touchStartPosRef.current.x);
    const dy = Math.abs(clientY - touchStartPosRef.current.y);
    if (dx > SWIPE_THRESHOLD || dy > SWIPE_THRESHOLD) {
      movedRef.current = true;
      cancelLongPress();
    }
  };

  // Only cancels the long-press timer. Does NOT clear start position,
  // because pointerleave fires during scroll and would otherwise lose it.
  const endPress = (clientX?: number, clientY?: number) => {
    cancelLongPress();
    if (
      touchStartPosRef.current &&
      typeof clientX === 'number' &&
      typeof clientY === 'number'
    ) {
      const dx = Math.abs(clientX - touchStartPosRef.current.x);
      const dy = Math.abs(clientY - touchStartPosRef.current.y);
      if (dx > SWIPE_THRESHOLD || dy > SWIPE_THRESHOLD) {
        movedRef.current = true;
      }
    }
  };

  const handleContactClick = (contact: Contact) => {
    const wasMoved = movedRef.current;
    const wasLongPress = isLongPressActiveRef.current;
    // reset for next interaction
    movedRef.current = false;
    isLongPressActiveRef.current = false;
    touchStartPosRef.current = null;

    if (wasMoved || wasLongPress) return;

    triggerVibration();
    // Tap opens the unified contact card (profile page) where the user can
    // message, call, share, block, or edit. Long press opens the quick sheet.
    router.push(
      `/profile?phone=${encodeURIComponent(contact.phone || '')}&name=${encodeURIComponent(contact.name)}&avatar=${encodeURIComponent(contact.avatar || '')}`
    );
  };

  // Active Selected contact for Bottom Action Sheet
  const [activeContact, setActiveContact] = useState<Contact | null>(null);

  // Add Contact FAB Dialog states
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [addName, setAddName] = useState('');
  const [addPhone, setAddPhone] = useState('');
  const [addEmail, setAddEmail] = useState('');
  const [accounts, setAccounts] = useState<WritableAccount[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<Contact | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [activeIsBlocked, setActiveIsBlocked] = useState(false);

  // SIM-picker-aware calling.
  const simCall = useSimCall();
  const [selectedAccountId, setSelectedAccountId] = useState<string>('neurachat');
  const [addAvatar, setAddAvatar] = useState<string>('');
  const [addError, setAddError] = useState('');

  const loadContactsData = async () => {
    try {
      await loadContactsFromDB();
    } catch (e) {
      console.error(e);
    }
  };

  // Manual "Load Contacts" button: forces a full sync from the device.
  const handleReloadContacts = async () => {
    triggerVibration();
    setSyncing(true);
    try {
      await forceSyncContacts();
      await loadContactsFromDB();
    } catch (e) {
      console.error('reload failed', e);
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const list = await getWritableAccounts();
        if (list.length > 0) {
          setAccounts(list);
          if (!list.some(a => a.id === 'neurachat')) {
            setSelectedAccountId(list[0].id);
          }
        }
      } catch (e) {
        console.error('accounts load failed', e);
      }
    })();
  }, []);

  // Reload accounts whenever the Add Contact dialog is opened.
  // The plugin may have been unavailable at first mount (permission prompt
  // still pending); by the time the user opens the dialog it is ready.
  useEffect(() => {
    if (!isAddOpen) return;
    (async () => {
      try {
        const list = await getWritableAccounts();
        console.log('[contacts] accounts on open:', list);
        if (list.length > 0) setAccounts(list);
      } catch (e) {
        console.error('accounts reload failed', e);
      }
    })();
  }, [isAddOpen]);

  // Reload whenever the app comes back to foreground (covers the case where
  // the user granted contacts permission in system settings or the first
  // sync finished while the app was backgrounded).
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        // Reads from the cache instantly; a sync runs only if the throttle
        // window has elapsed since the last successful sync.
        bootstrapContacts().catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Cache first (instant), then a throttled background sync if due.
        await bootstrapContacts();
      } catch (e) {
        console.error('bootstrap failed', e);
      }
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const handle = setTimeout(() => {
      if (typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search);
        if (params.get('add') === 'true') {
          const phone = params.get('phone') || '';
          setAddPhone(phone);
          setIsAddOpen(true);
          window.history.replaceState({}, '', window.location.pathname);
        }
      }
    }, 50);
    return () => clearTimeout(handle);
  }, []);

  const triggerVibration = () => {
    if (typeof window !== 'undefined' && window.navigator && window.navigator.vibrate) {
      window.navigator.vibrate(25);
    }
  };

  // Add Contact Form save
  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError('');

    if (!addName.trim()) {
      setAddError('Name is required.');
      return;
    }

    const cleanPhone = addPhone.replace(/\s+/g, '');
    const cleanEmail = addEmail.trim();

    if (!cleanPhone && !cleanEmail) {
      setAddError('Provide at least a phone number or email.');
      return;
    }

    if (cleanPhone && !/^\+?[0-9]{7,15}$/.test(cleanPhone)) {
      setAddError('Please input a valid phone number (7-15 digits).');
      return;
    }

    if (cleanEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setAddError('Please input a valid email address.');
      return;
    }

    try {
      const chosen = accounts.find(a => a.id === selectedAccountId);
      const isNativeSave = !!chosen && chosen.id !== 'neurachat';

      let nativeRawId: string | undefined;
      let nativeContactId: string | undefined;

      // Save to a real Android account (Device / Google / SIM)
      if (isNativeSave) {
        const res = await saveContactToAccount({
          name: addName.trim(),
          phone: cleanPhone || undefined,
          email: cleanEmail || undefined,
          accountType: chosen!.accountType,
          accountName: chosen!.accountName,
        });
        if (!res.success) {
          // Show the real error and don't pretend to save.
          setAddError(res.error || 'Could not save to selected account.');
          return;
        }
        nativeRawId = res.rawContactId;
        nativeContactId = res.contactId;
      }

      // Local record — use the same stable id the sync produces so a later
      // re-sync updates this row instead of creating a duplicate.
      const stableKey = nativeContactId || generateId('contact');
      const localId = nativeContactId ? `cap-${nativeContactId}` : stableKey;

      const newContact: Contact = {
        id: localId,
        name: addName.trim(),
        phone: cleanPhone,
        email: cleanEmail || undefined,
        avatar: addAvatar || undefined,
        favorite: false,
        sourceLabel: chosen?.label || 'NeuraChat',
        accountType: chosen?.accountType || undefined,
        accountName: chosen?.accountName || undefined,
        rawContactId: nativeRawId,
        contactId: nativeContactId,
      };

      await saveContact(newContact);
      setAddName('');
      setAddPhone('');
      setAddEmail('');
      setAddAvatar('');
      setIsAddOpen(false);
      loadContactsData();
      triggerVibration();
    } catch (err) {
      console.error('add contact failed', err);
      setAddError('Save failed. Please try again.');
    }
  };

  // Handle Photo picker in Add dialog
  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setAddAvatar(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  // Toggle favorite on contact within active sheet
  const handleToggleFavorite = async (contact: Contact) => {
    triggerVibration();
    const updated: Contact = {
      ...contact,
      favorite: !contact.favorite
    };
    await saveContact(updated);
    setActiveContact(updated);
    loadContactsData();
  };

  // Remove contact entirely from active sheet context
  const handleRemoveContact = async (contactId: string) => {
    // Open confirmation instead of instant delete
    const target = contacts.find(c => c.id === contactId) || null;
    if (target) setDeleteTarget(target);
  };

  const performDelete = async (scope: 'local' | 'both') => {
    if (!deleteTarget) return;
    setDeleting(true);
    triggerVibration();
    try {
      // Delete from Android Contacts if requested and we have a rawContactId
      if (scope === 'both' && deleteTarget.rawContactId) {
        const ok = await deleteRawContact(deleteTarget.rawContactId);
        if (!ok) {
          console.warn('Device delete returned false');
        }
      }
      // Always remove from local app db
      await deleteContact(deleteTarget.id);
      setDeleteTarget(null);
      setActiveContact(null);
      loadContactsData();
    } catch (e) {
      console.error('delete failed', e);
    } finally {
      setDeleting(false);
    }
  };

  // Filter list
  const filteredContacts = contacts.filter(c => {
    const q = searchQuery.toLowerCase();
    const qDigits = searchQuery.replace(/\D/g, '');
    if (c.name.toLowerCase().includes(q)) return true;
    if ((c.email || '').toLowerCase().includes(q)) return true;
    if (qDigits) {
      const nPhone = normalizePhone(c.phone);
      const nQuery = normalizePhone(searchQuery);
      if (nPhone && nQuery && nPhone.includes(nQuery)) return true;
      if (c.phone.replace(/\D/g, '').includes(qDigits)) return true;
    }
    return false;
  });

  // Group rest alphabetically
  const groupedContacts: { [key: string]: Contact[] } = {};
  filteredContacts.forEach(c => {
    const firstLetter = c.name.slice(0, 1).toUpperCase();
    const key = /[A-Z]/.test(firstLetter) ? firstLetter : '#';
    if (!groupedContacts[key]) {
      groupedContacts[key] = [];
    }
    groupedContacts[key].push(c);
  });

  // Reflect block status whenever the action sheet opens.
  useEffect(() => {
    if (!activeContact) {
      setActiveIsBlocked(false);
      return;
    }
    (async () => {
      try {
        const blocked = await isBlocked(activeContact.phone);
        setActiveIsBlocked(blocked);
      } catch (e) {
        console.error('isBlocked failed', e);
      }
    })();
  }, [activeContact]);

  // ---- Back-button integration ----
  useBackHandler(isAddOpen, () => setIsAddOpen(false));
  useBackHandler(!!activeContact, () => setActiveContact(null));
  useBackHandler(!!deleteTarget, () => setDeleteTarget(null));

  const alphabetHeaders = Object.keys(groupedContacts).sort();
  const favorites = filteredContacts.filter(c => c.favorite);

  return (
    <>
      <Header
        title="Contacts"
        rightAction={
          <button
            onClick={handleReloadContacts}
            disabled={syncing}
            className="p-2 -mr-2 rounded-full text-zinc-400 hover:text-[#00D4FF] disabled:opacity-50 transition-colors cursor-pointer"
            title="Reload contacts"
            id="contacts-reload-btn"
          >
            <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin text-[#00D4FF]' : ''}`} />
          </button>
        }
      />

      {/* Main Panel */}
      <main className="flex-1 p-3 overflow-y-auto" id="contacts-main-container">
        {/* Search Input */}
        <div className="relative mb-3.5" id="contacts-search-field">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
          <input
            type="text"
            placeholder="Search contacts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-805 rounded-lg py-1.5 px-8 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-[#00D4FF] focus:ring-1 focus:ring-[#00D4FF]/30 transition-all font-sans"
          />
        </div>

        {storeLoading || (contactsStore.syncing && contacts.length === 0) ? (
          <div className="space-y-2.5" id="contacts-skeleton">
            {[1, 2, 3].map(n => (
              <div key={n} className="flex gap-3 p-2 bg-zinc-950 border border-zinc-900 rounded-lg animate-pulse">
                <div className="w-8 h-8 bg-zinc-850 rounded-full" />
                <div className="flex-1 space-y-1.5 py-1">
                  <div className="h-3 bg-zinc-850 rounded w-1/4" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredContacts.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center py-14 text-center select-none" id="contacts-empty-state">
            <div className="w-12 h-12 bg-zinc-900 border border-zinc-805 rounded-full flex items-center justify-center mb-3 text-zinc-600">
              <Users className="h-6 w-6 text-zinc-500" />
            </div>
            <p className="text-zinc-400 font-semibold text-xs font-display mb-1">
              No contacts saved
            </p>
            <p className="text-zinc-600 text-[11px] px-8 leading-normal mb-2">
              Your phone contacts appear here automatically once contacts permission is granted.
            </p>
            <p className="text-zinc-600 text-[11px] px-8 leading-normal">
              You can also add a contact manually.
            </p>

          </div>
        ) : (
          <div className="space-y-4" id="contacts-feed">
            {/* FAVORITES HEADER SECTION */}
            {favorites.length > 0 && (
              <div className="space-y-1.5" id="contacts-favorites-row">
                <div className="flex items-center gap-1.5 text-zinc-500 text-[9px] tracking-widest uppercase font-mono font-bold">
                  <Star className="h-2.5 w-2.5 fill-amber-400 text-amber-400" />
                  Favorites
                </div>
                <div className="flex gap-3 overflow-x-auto pb-1.5 no-scrollbar">
                  {favorites.map(fav => (
                    <div
                      key={fav.id}
                      onPointerDown={(e) => startPress(fav, e.clientX, e.clientY)}
                      onPointerUp={(e) => endPress(e.clientX, e.clientY)}
                      onPointerCancel={(e) => endPress(e.clientX, e.clientY)}
                      onTouchStart={(e) => {
                        const t = e.touches[0];
                        startPress(fav, t?.clientX, t?.clientY);
                      }}
                      onTouchMove={(e) => {
                        const t = e.touches[0];
                        if (t) movePress(t.clientX, t.clientY);
                      }}
                      onTouchEnd={(e) => {
                        const t = e.changedTouches[0];
                        endPress(t?.clientX, t?.clientY);
                      }}
                      onClick={() => handleContactClick(fav)}
                      className="flex flex-col items-center flex-shrink-0 cursor-pointer text-center select-none touch-pan-y"
                    >
                      <div className="w-9 h-9 rounded-full border-2 border-amber-400/50 p-0.5 relative mb-1">
                        {fav.avatar ? (
                          <img
                            src={fav.avatar}
                            alt={fav.name}
                            className="w-full h-full rounded-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full rounded-full bg-zinc-800 text-[#00D4FF] flex items-center justify-center font-bold text-xs">
                            {fav.name.slice(0, 2).toUpperCase()}
                          </div>
                        )}
                        <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-amber-400 rounded-full border border-zinc-950 flex items-center justify-center">
                          <Star className="h-1 w-1 fill-black text-black" />
                        </span>
                      </div>
                      <span className="text-[10px] text-zinc-300 font-medium font-sans truncate max-w-[52px]">
                        {fav.name.split(' ')[0]}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ALPHABETICAL SECTIONS Rest of list */}
            <div className="space-y-3.5" id="contacts-alphabetical-groups">
              {alphabetHeaders.map(letter => (
                <div key={letter} className="space-y-1">
                  <div className="text-[#FF006E] text-[10px] font-bold font-mono tracking-wider bg-zinc-950 sticky top-0 py-0.5 border-b border-zinc-900/40">
                    {letter}
                  </div>
                  <div className="space-y-0.5">
                    {groupedContacts[letter].map(contact => (
                      <div
                        key={contact.id}
                        onPointerDown={(e) => startPress(contact, e.clientX, e.clientY)}
                        onPointerUp={(e) => endPress(e.clientX, e.clientY)}
                        onPointerCancel={(e) => endPress(e.clientX, e.clientY)}
                        onTouchStart={(e) => {
                          const t = e.touches[0];
                          startPress(contact, t?.clientX, t?.clientY);
                        }}
                        onTouchMove={(e) => {
                          const t = e.touches[0];
                          if (t) movePress(t.clientX, t.clientY);
                        }}
                        onTouchEnd={(e) => {
                          const t = e.changedTouches[0];
                          endPress(t?.clientX, t?.clientY);
                        }}
                        onClick={() => handleContactClick(contact)}
                        className="flex items-center gap-2 p-1.5 pr-1 rounded-lg bg-zinc-955 border border-zinc-900/60 hover:border-zinc-805 cursor-pointer active:bg-zinc-90 w-full select-none touch-pan-y"
                      >
                        {contact.avatar ? (
                          <img
                            src={contact.avatar}
                            alt={contact.name}
                            className="w-7.5 h-7.5 rounded-full object-cover border border-zinc-800"
                          />
                        ) : (
                          <div className="w-7.5 h-7.5 rounded-full bg-zinc-800 text-[#00D4FF] flex items-center justify-center font-bold text-xs uppercase">
                            {contact.name.slice(0, 2)}
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-white text-xs font-semibold font-sans truncate">{contact.name}</p>
                          <p className="text-zinc-500 text-[9px] font-mono mt-0.5 truncate">{contact.phone || 'No number'}</p>
                          {contact.email && (
                            <p className="text-[#00D4FF] text-[9px] font-mono mt-0.5 truncate">{contact.email}</p>
                          )}
                          {contact.sourceLabel && (
                            <p className="text-zinc-600 text-[8px] font-mono mt-0.5 truncate">
                              {contact.sourceLabel}
                            </p>
                          )}
                        </div>
                        {contact.phone && (
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                triggerVibration();
                                router.push(`/chat-detail?phone=${encodeURIComponent(contact.phone)}&name=${encodeURIComponent(contact.name)}&avatar=${encodeURIComponent(contact.avatar || '')}`);
                              }}
                              onPointerDown={(e) => e.stopPropagation()}
                              className="w-9 h-9 flex items-center justify-center rounded-lg bg-[#00D4FF]/10 text-[#00D4FF] hover:bg-[#00D4FF]/20 active:scale-90 transition-all"
                              title="SMS"
                            >
                              <MessageSquare className="h-4 w-4" />
                            </button>
                            <button
                              onClick={async (e) => {
                                e.stopPropagation();
                                triggerVibration();
                                await simCall.startCall(contact.phone);
                              }}
                              onPointerDown={(e) => e.stopPropagation()}
                              className="w-9 h-9 flex items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 active:scale-90 transition-all"
                              title="Call"
                            >
                              <Phone className="h-4 w-4" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                triggerVibration();
                                setActiveContact(contact);
                              }}
                              onPointerDown={(e) => e.stopPropagation()}
                              className="w-9 h-9 flex items-center justify-center rounded-lg bg-zinc-800/60 text-zinc-300 hover:bg-zinc-800 active:scale-90 transition-all"
                              title="Details"
                            >
                              <Info className="h-4 w-4" />
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ADD MANUAL CONTACT TRIGGER FAB */}
        

        {/* BOTTOM ACTION SHEET DIALOG ON CONTACT CLICK */}
        <AnimatePresence>
          {activeContact && (
            <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-end justify-center select-none">
              <motion.div
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 220 }}
                className="w-full max-w-md bg-zinc-950 border-t border-zinc-900 rounded-t-3xl p-6 pb-8 flex flex-col items-center"
                id="contact-action-sheet"
              >
                {/* Drag handle or closer */}
                <button
                  onClick={() => setActiveContact(null)}
                  className="absolute top-4 right-4 p-1 rounded-full bg-zinc-900 text-zinc-500 hover:text-white cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>

                {/* Main Avatar profile badge */}
                <div className="flex flex-col items-center text-center mt-3 mb-6">
                  {activeContact.avatar ? (
                    <img
                      src={activeContact.avatar}
                      alt={activeContact.name}
                      className="w-16 h-16 rounded-full object-cover mb-2 border border-zinc-802 shadow-md"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-full bg-zinc-800 text-[#00D4FF] flex items-center justify-center font-bold text-xl uppercase mb-2">
                      {activeContact.name.slice(0, 2)}
                    </div>
                  )}
                  <h3 className="text-base font-bold text-white font-display mb-0.5">{activeContact.name}</h3>
                  {activeContact.phone && (
                    <span className="text-xs text-zinc-500 font-mono">{activeContact.phone}</span>
                  )}
                  {activeContact.email && (
                    <span className="text-xs text-[#00D4FF] font-mono mt-0.5">{activeContact.email}</span>
                  )}
                </div>

                {/* Direct Action Core Rows */}
                <div className="grid grid-cols-4 gap-4 w-full px-4 mb-6">
                  <button
                    onClick={() => {
                      setActiveContact(null);
                      router.push(`/chat-detail?phone=${encodeURIComponent(activeContact.phone)}&name=${encodeURIComponent(activeContact.name)}&avatar=${encodeURIComponent(activeContact.avatar || '')}`);
                    }}
                    className="flex flex-col items-center bg-zinc-900 hover:bg-zinc-850 p-3 rounded-2xl transition-colors cursor-pointer group active:scale-95"
                  >
                    <MessageSquare className="h-5 w-5 text-[#00D4FF] mb-1.5 group-hover:scale-105" />
                    <span className="text-[10px] font-sans text-zinc-300 font-medium">Message</span>
                  </button>

                  <button
                    onClick={async () => {
                      triggerVibration();
                      await simCall.startCall(activeContact.phone);
                    }}
                    className="flex flex-col items-center bg-zinc-900 hover:bg-zinc-850 p-3 rounded-2xl transition-colors cursor-pointer group active:scale-95"
                  >
                    <Phone className="h-5 w-5 text-emerald-400 mb-1.5 group-hover:scale-105" />
                    <span className="text-[10px] font-sans text-zinc-300 font-medium">Voice</span>
                  </button>

                  <button
                    onClick={() => {
                      triggerVibration();
                      window.location.href = `sms:${activeContact.phone}`;
                    }}
                    className="flex flex-col items-center bg-zinc-900 hover:bg-zinc-850 p-3 rounded-2xl transition-colors cursor-pointer group active:scale-95"
                  >
                    <Mail className="h-5 w-5 text-[#FF006E] mb-1.5 group-hover:scale-105" />
                    <span className="text-[10px] font-sans text-zinc-300 font-medium">SMS</span>
                  </button>

                  <button
                    onClick={() => {
                      setActiveContact(null);
                      router.push(`/profile?name=${encodeURIComponent(activeContact.name)}&phone=${encodeURIComponent(activeContact.phone)}&avatar=${encodeURIComponent(activeContact.avatar || '')}`);
                    }}
                    className="flex flex-col items-center bg-zinc-900 hover:bg-zinc-850 p-3 rounded-2xl transition-colors cursor-pointer group active:scale-95"
                  >
                    <Settings className="h-5 w-5 text-zinc-400 mb-1.5 group-hover:scale-105" />
                    <span className="text-[10px] font-sans text-zinc-300 font-medium">Profile</span>
                  </button>
                </div>

                {/* Additional Context Toggle Actions */}
                <div className="w-full space-y-2 px-4">
                  <button
                    onClick={() => handleToggleFavorite(activeContact)}
                    className="w-full bg-zinc-900 border border-zinc-802 py-2.5 px-4 rounded-xl flex items-center justify-between hover:bg-zinc-850 transition-colors cursor-pointer"
                  >
                    <span className="text-xs font-sans text-white font-medium">
                      {activeContact.favorite ? 'Remove from Favorites' : 'Add to Favorites'}
                    </span>
                    <Star className={`h-4 w-4 ${activeContact.favorite ? 'fill-amber-400 text-amber-400' : 'text-zinc-500'}`} />
                  </button>

                  <button
                    onClick={async () => {
                      triggerVibration();
                      if (!activeContact) return;
                      if (activeIsBlocked) {
                        await unblockContact(`blocked-${(activeContact.phone || '').replace(/\D/g, '')}`);
                        setActiveIsBlocked(false);
                      } else {
                        await blockContact({ name: activeContact.name, phone: activeContact.phone });
                        setActiveIsBlocked(true);
                      }
                      // Push the updated block list to native so SMS / calls
                      // from this number are dropped immediately.
                      try {
                        const list = await getBlockedContacts();
                        await syncBlockedListToNative(list.map((x) => x.phone));
                      } catch (e) {
                        console.error('native block sync failed', e);
                      }
                    }}
                    className={`w-full border py-2.5 px-4 rounded-xl flex items-center justify-between transition-colors cursor-pointer ${
                      activeIsBlocked
                        ? 'bg-emerald-950/10 border-emerald-900/30 hover:bg-emerald-900/10 text-emerald-400'
                        : 'bg-red-950/10 border-red-900/20 hover:bg-red-900/10 text-red-400'
                    }`}
                  >
                    <span className="text-xs font-sans font-medium">
                      {activeIsBlocked ? 'Unblock Contact' : 'Block Contact'}
                    </span>
                    <Ban className="h-4 w-4" />
                  </button>

                  <button
                    onClick={() => handleRemoveContact(activeContact.id)}
                    className="w-full bg-red-950/10 border border-red-900/20 py-2.5 px-4 rounded-xl flex items-center justify-between hover:bg-red-900/10 transition-colors cursor-pointer text-red-400"
                  >
                    <span className="text-xs font-sans font-medium">Delete Contact Node</span>
                    <Trash2 className="h-4 w-4 text-red-400" />
                  </button>
                </div>

              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* ADD MANUAL CONTACT NEW MODAL FORM */}
        <AnimatePresence>
          {isAddOpen && (
            <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-50 flex items-center justify-center p-6 select-none">
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="w-full max-w-sm bg-zinc-950 border border-zinc-900 rounded-3xl p-6 relative"
              >
                <button
                  onClick={() => setIsAddOpen(false)}
                  className="absolute top-4 right-4 text-zinc-400 hover:text-white"
                >
                  <X className="h-5 w-5" />
                </button>

                <h3 className="text-base font-bold font-display text-white mb-4 drop-shadow-[0_0_8px_rgba(0,212,255,0.4)]">
                  Add Contact Node
                </h3>

                <form onSubmit={handleAddSubmit} className="space-y-4">
                  {addError && (
                    <p className="text-xs text-[#FF006E] font-medium leading-none">{addError}</p>
                  )}

                  {/* Optional File Photo Picker */}
                  <div className="flex flex-col items-center justify-center gap-2 mb-2">
                    <label className="text-[10px] uppercase font-mono tracking-widest text-zinc-600">
                      Contact Avatar
                    </label>
                    <div className="relative group cursor-pointer active:scale-95">
                      <div className="w-16 h-16 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-500 overflow-hidden">
                        {addAvatar ? (
                          <img
                            src={addAvatar}
                            alt="avatar preview"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <Camera className="h-6 w-6 text-zinc-600 group-hover:text-zinc-400 transition-colors" />
                        )}
                      </div>
                      <input
                        type="file"
                        onChange={handlePhotoSelect}
                        accept="image/*"
                        className="absolute inset-0 opacity-0 cursor-pointer"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-mono block">
                      Name
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Marie Curie"
                      value={addName}
                      onChange={(e) => setAddName(e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-805 rounded-xl px-4 py-2.5 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-[#00D4FF]"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-mono block">
                      Phone Number <span className="text-zinc-600">(optional if email set)</span>
                    </label>
                    <input
                      type="tel"
                      placeholder="e.g. +33155551212"
                      value={addPhone}
                      onChange={(e) => setAddPhone(e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-805 rounded-xl px-4 py-2.5 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-[#00D4FF]"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-mono block">
                      Email <span className="text-zinc-600">(optional)</span>
                    </label>
                    <input
                      type="email"
                      placeholder="e.g. marie@example.com"
                      value={addEmail}
                      onChange={(e) => setAddEmail(e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-805 rounded-xl px-4 py-2.5 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-[#00D4FF]"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-mono block">
                      Save to
                    </label>
                    <select
                      value={selectedAccountId}
                      onChange={(e) => setSelectedAccountId(e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-805 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-[#00D4FF] cursor-pointer"
                    >
                      {accounts.length === 0 ? (
                        <option value="neurachat">NeuraChat</option>
                      ) : (
                        accounts.map((acc) => (
                          <option key={acc.id} value={acc.id}>
                            {acc.label}
                          </option>
                        ))
                      )}
                    </select>
                  </div>

                  <button
                    type="submit"
                    className="w-full bg-[#00D4FF] hover:bg-[#00B2D6] text-black font-semibold text-xs py-3 rounded-xl shadow-[0_0_12px_rgba(0,212,255,0.3)] active:scale-95 transition-all mt-2 cursor-pointer"
                  >
                    Save Contact
                  </button>
                </form>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
        {/* DELETE CONFIRMATION MODAL */}
        <AnimatePresence>
          {deleteTarget && (
            <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-50 flex items-center justify-center p-6 select-none">
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="w-full max-w-sm bg-zinc-950 border border-zinc-900 rounded-3xl p-6 relative"
              >
                <button
                  onClick={() => setDeleteTarget(null)}
                  className="absolute top-4 right-4 text-zinc-400 hover:text-white"
                >
                  <X className="h-5 w-5" />
                </button>

                <h3 className="text-base font-bold font-display text-white mb-1">
                  Delete Contact
                </h3>
                <p className="text-xs text-zinc-500 mb-4">
                  {deleteTarget.name}
                  {deleteTarget.sourceLabel ? ` · ${deleteTarget.sourceLabel}` : ''}
                </p>

                <p className="text-[11px] text-zinc-400 mb-4 leading-relaxed">
                  Choose what to delete. Deleting from the device/account source
                  will remove the contact from your phone as well.
                </p>

                <div className="space-y-2">
                  <button
                    onClick={() => performDelete('local')}
                    disabled={deleting}
                    className="w-full bg-zinc-900 border border-zinc-800 hover:bg-zinc-850 text-white text-xs py-2.5 rounded-xl cursor-pointer disabled:opacity-50"
                  >
                    Remove from NeuraChat only
                  </button>

                  {deleteTarget.rawContactId ? (
                    <button
                      onClick={() => performDelete('both')}
                      disabled={deleting}
                      className="w-full bg-red-950/30 border border-red-900/40 hover:bg-red-900/30 text-red-400 text-xs py-2.5 rounded-xl cursor-pointer disabled:opacity-50"
                    >
                      Delete from {deleteTarget.sourceLabel || 'device'}
                    </button>
                  ) : (
                    <p className="text-[10px] text-zinc-600 text-center pt-1">
                      Device delete unavailable for this contact.
                    </p>
                  )}

                  <button
                    onClick={() => setDeleteTarget(null)}
                    disabled={deleting}
                    className="w-full bg-zinc-900 text-zinc-400 text-xs py-2.5 rounded-xl cursor-pointer disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </main>

      <button
          onClick={() => {
            triggerVibration();
            setIsAddOpen(true);
          }}
          className="absolute bottom-22 right-4 w-10 h-10 bg-gradient-to-tr from-[#00D4FF] to-[#008BBF] text-black rounded-full flex items-center justify-center shadow-[0_0_12px_rgba(0,212,255,0.4)] hover:shadow-[0_0_16px_rgba(0,212,255,0.6)] cursor-pointer hover:scale-105 active:scale-95 transition-all z-40"
          aria-label="Add Contact"
          id="add-contact-fab"
        >
          <Plus className="h-4 w-4 stroke-[3]" />
        </button>

      <BottomNav currentTab="contacts" />

      {/* SIM picker for calls */}
      <CallSimPicker
        isOpen={simCall.pickerOpen}
        accounts={simCall.accounts}
        remember={simCall.remember}
        onRememberChange={simCall.setRemember}
        onPick={simCall.pick}
        onCancel={simCall.cancel}
      />
    </>
  );
}
