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
  RefreshCw,
  MoreVertical,
  Mail,
  Camera,
  Trash2
} from 'lucide-react';
import {
  getContacts,
  saveContact,
  deleteContact,
  Contact
} from '@/lib/db';
import { syncDeviceContacts } from '@/lib/capacitor';
import Header from '@/components/Header';
import BottomNav from '@/components/BottomNav';
import { generateId, getCurrentTimestamp } from '@/lib/utils';

export default function ContactsPage() {
  const router = useRouter();

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [syncing, setSyncing] = useState(false);

  // Search press handling or timer state reference
  const longPressTimerRef = React.useRef<NodeJS.Timeout | null>(null);
  const isLongPressActiveRef = React.useRef(false);

  const startPress = (contact: Contact) => {
    isLongPressActiveRef.current = false;
    longPressTimerRef.current = setTimeout(() => {
      isLongPressActiveRef.current = true;
      triggerVibration();
      setActiveContact(contact);
    }, 600);
  };

  const endPress = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleContactClick = (contact: Contact) => {
    if (isLongPressActiveRef.current) {
      isLongPressActiveRef.current = false;
      return;
    }
    triggerVibration();
    router.push(`/chat-detail?phone=${encodeURIComponent(contact.phone)}&name=${encodeURIComponent(contact.name)}&avatar=${encodeURIComponent(contact.avatar || '')}`);
  };

  // Active Selected contact for Bottom Action Sheet
  const [activeContact, setActiveContact] = useState<Contact | null>(null);

  // Add Contact FAB Dialog states
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [addName, setAddName] = useState('');
  const [addPhone, setAddPhone] = useState('');
  const [addAvatar, setAddAvatar] = useState<string>('');
  const [addError, setAddError] = useState('');

  const loadContactsData = async () => {
    try {
      const data = await getContacts();
      setContacts(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const handle = setTimeout(() => {
      loadContactsData();
    }, 0);
    return () => clearTimeout(handle);
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

  // Sync Contacts handler
  const handleSync = async () => {
    triggerVibration();
    setSyncing(true);
    try {
      await syncDeviceContacts();
      const updated = await getContacts();
      setContacts(updated);
    } catch (e) {
      console.error(e);
    } finally {
      setSyncing(false);
    }
  };

  // Add Contact Form save
  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError('');

    if (!addName.trim() || !addPhone.trim()) {
      setAddError('Please fill out all fields.');
      return;
    }

    const cleanPhone = addPhone.replace(/\s+/g, '');
    if (!/^\+?[0-9]{7,15}$/.test(cleanPhone)) {
      setAddError('Please input a valid phone number (7-15 digits).');
      return;
    }

    try {
      const newContact: Contact = {
        id: generateId('contact'),
        name: addName.trim(),
        phone: cleanPhone,
        avatar: addAvatar || undefined,
        favorite: false
      };

      await saveContact(newContact);
      setAddName('');
      setAddPhone('');
      setAddAvatar('');
      setIsAddOpen(false);
      loadContactsData();
      triggerVibration();
    } catch (err) {
      setAddError('Internal database save conflict.');
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
    triggerVibration();
    await deleteContact(contactId);
    setActiveContact(null);
    loadContactsData();
  };

  // Filter list
  const filteredContacts = contacts.filter(c =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.phone.includes(searchQuery)
  );

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

  const alphabetHeaders = Object.keys(groupedContacts).sort();
  const favorites = filteredContacts.filter(c => c.favorite);

  return (
    <>
      <Header
        title="Contacts"
        rightAction={
          <button
            onClick={handleSync}
            disabled={syncing}
            className="p-2 -mr-2 text-zinc-400 hover:text-[#00D4FF] disabled:opacity-50 transition-colors cursor-pointer"
            title="Sync Contacts"
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

        {loading ? (
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
            <p className="text-zinc-600 text-[11px] px-8 leading-normal mb-4">
              Create a manual contact or trigger device sync inside the header tap.
            </p>
            <button
              onClick={handleSync}
              className="bg-[#00D4FF]/10 text-[#00D4FF] border border-[#00D4FF]/20 py-2 px-4 rounded-lg text-[11px] font-semibold hover:bg-[#00D4FF]/20 active:scale-97 transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className="h-3 w-3" />
              Sync Contacts Node
            </button>
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
                      onPointerDown={() => startPress(fav)}
                      onPointerUp={endPress}
                      onPointerLeave={endPress}
                      onPointerCancel={endPress}
                      onTouchStart={() => startPress(fav)}
                      onTouchEnd={endPress}
                      onClick={() => handleContactClick(fav)}
                      className="flex flex-col items-center flex-shrink-0 cursor-pointer text-center select-none touch-none"
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
                        onPointerDown={() => startPress(contact)}
                        onPointerUp={endPress}
                        onPointerLeave={endPress}
                        onPointerCancel={endPress}
                        onTouchStart={() => startPress(contact)}
                        onTouchEnd={endPress}
                        onClick={() => handleContactClick(contact)}
                        className="flex items-center gap-2 p-1.5 rounded-lg bg-zinc-955 border border-zinc-900/60 hover:border-zinc-805 cursor-pointer active:bg-zinc-90 w-full select-none touch-none"
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
                        <div>
                          <p className="text-white text-xs font-semibold font-sans">{contact.name}</p>
                          <p className="text-zinc-500 text-[9px] font-mono mt-0.5">{contact.phone}</p>
                        </div>
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
                  <span className="text-xs text-zinc-500 font-mono">{activeContact.phone}</span>
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
                    onClick={() => {
                      triggerVibration();
                      window.location.href = `tel:${activeContact.phone}`;
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
                      Phone Number
                    </label>
                    <input
                      type="tel"
                      required
                      placeholder="e.g. +33155551212"
                      value={addPhone}
                      onChange={(e) => setAddPhone(e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-805 rounded-xl px-4 py-2.5 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-[#00D4FF]"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full bg-[#00D4FF] hover:bg-[#00B2D6] text-black font-semibold text-xs py-3 rounded-xl shadow-[0_0_12px_rgba(0,212,255,0.3)] active:scale-95 transition-all mt-2 cursor-pointer"
                  >
                    Save Contact Node
                  </button>
                </form>
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
    </>
  );
}
