'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import {
  User,
  Phone,
  MessageSquare,
  Mail,
  Camera,
  Check,
  Edit2,
  X,
  Star,
  Globe,
  ArrowLeft
} from 'lucide-react';
import {
  getContacts,
  saveContact,
  Contact
} from '@/lib/db';
import Header from '@/components/Header';
import { generateId } from '@/lib/utils';

function ProfileContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const urlName = searchParams.get('name') || 'Neural Link';
  const urlPhone = searchParams.get('phone') || '';
  const urlAvatar = searchParams.get('avatar') || '';

  const [contact, setContact] = useState<Contact | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);

  // Form states
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editAvatar, setEditAvatar] = useState('');
  const [isFavorite, setIsFavorite] = useState(false);

  useEffect(() => {
    async function loadContact() {
      if (!urlPhone) return;
      const all = await getContacts();
      const match = all.find(c => c.phone === urlPhone);
      
      if (match) {
        setContact(match);
        setEditName(match.name);
        setEditPhone(match.phone);
        setEditAvatar(match.avatar || '');
        setIsFavorite(match.favorite);
      } else {
        // Fallback or create a temporary record if it doesn't exist
        const temp: Contact = {
          id: generateId('temp'),
          name: urlName,
          phone: urlPhone,
          avatar: urlAvatar || undefined,
          favorite: false
        };
        setContact(temp);
        setEditName(urlName);
        setEditPhone(urlPhone);
        setEditAvatar(urlAvatar);
        setIsFavorite(false);
      }
    }
    const handle = setTimeout(() => {
      loadContact();
    }, 0);
    return () => clearTimeout(handle);
  }, [urlPhone, urlName, urlAvatar]);

  const triggerVibration = () => {
    if (typeof window !== 'undefined' && window.navigator && window.navigator.vibrate) {
      window.navigator.vibrate(30);
    }
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setEditAvatar(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    if (!contact || !editName.trim() || !editPhone.trim()) return;

    triggerVibration();

    const updatedContact: Contact = {
      ...contact,
      name: editName.trim(),
      phone: editPhone.replace(/\s+/g, ''),
      avatar: editAvatar || undefined,
      favorite: isFavorite
    };

    await saveContact(updatedContact);
    setContact(updatedContact);
    setIsEditMode(false);
  };

  const handleToggleFavorite = async () => {
    if (!contact) return;
    triggerVibration();
    const nextVal = !isFavorite;
    setIsFavorite(nextVal);

    if (!isEditMode) {
      const updatedContact: Contact = {
        ...contact,
        favorite: nextVal
      };
      await saveContact(updatedContact);
      setContact(updatedContact);
    }
  };

  return (
    <div className="flex flex-col h-screen max-w-md mx-auto bg-zinc-950 text-white relative">
      
      {/* Sticky default Header with back navigation route to Contacts */}
      <Header
        title="Node Profile"
        backHref="/contacts"
        rightAction={
          <button
            onClick={handleToggleFavorite}
            className="p-1 -mr-1 rounded-full text-zinc-400 hover:text-amber-400 transition-colors cursor-pointer"
            title="Toggle Favorite"
          >
            <Star className={`h-5 w-5 ${isFavorite ? 'fill-amber-400 text-amber-400' : ''}`} />
          </button>
        }
      />

      {/* Profile Details area */}
      <main className="flex-1 p-6 overflow-y-auto space-y-6 flex flex-col items-center" id="profile-container">
        
        {/* Large Avatar container (128px) */}
        <div className="relative mb-2">
          {/* Neon colorful glowing background ring */}
          <div className="absolute -inset-1 rounded-full bg-gradient-to-tr from-[#00D4FF] to-[#FF006E] opacity-75 blur-md animate-pulse" />
          <div className="w-32 h-32 rounded-full overflow-hidden bg-zinc-900 relative border-2 border-zinc-950 z-10 flex items-center justify-center text-4xl font-extrabold text-[#00D4FF] uppercase tracking-widest shadow-2xl">
            {editAvatar ? (
              <img
                src={editAvatar}
                alt={editName}
                className="w-full h-full object-cover"
                id="profile-avatar-display"
              />
            ) : (
              editName.slice(0, 2)
            )}

            {/* Editing Camera overlay button */}
            {isEditMode && (
              <label className="absolute inset-0 bg-black/60 z-20 flex flex-col items-center justify-center gap-1 cursor-pointer transition-all">
                <Camera className="h-6 w-6 text-white stroke-[2.5]" />
                <span className="text-[9px] text-white/80 font-mono tracking-wider uppercase font-semibold">Upload Photo</span>
                <input
                  type="file"
                  onChange={handleAvatarChange}
                  accept="image/*"
                  className="hidden"
                />
              </label>
            )}
          </div>
        </div>

        {/* Name and Phone editable details block */}
        <div className="w-full text-center space-y-4 max-w-xs select-none">
          {isEditMode ? (
            <div className="space-y-3" id="profile-edit-inputs">
              <div className="space-y-1 text-left">
                <label className="text-[9px] uppercase tracking-widest text-[#00D4FF] font-mono font-bold block">Display Name</label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-802 rounded-xl py-2 px-4 text-sm text-white focus:outline-none focus:border-[#00D4FF]"
                />
              </div>

              <div className="space-y-1 text-left">
                <label className="text-[9px] uppercase tracking-widest text-[#FF006E] font-mono font-bold block">Phone Node Number</label>
                <input
                  type="tel"
                  required
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-802 rounded-xl py-2 px-4 text-sm text-white focus:outline-none focus:border-[#FF006E]"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-1" id="profile-read-labels">
              <h2 className="text-xl font-bold font-display text-white tracking-tight flex items-center justify-center gap-2">
                {editName}
                {isFavorite && (
                  <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                )}
              </h2>
              <p className="text-sm text-zinc-500 font-mono tracking-wide">{editPhone}</p>
              <div className="flex justify-center items-center gap-1.5 text-[10px] text-[#00D4FF] font-mono uppercase font-semibold mt-1">
                <Globe className="h-3 w-3" />
                Channel node active
              </div>
            </div>
          )}
        </div>

        {/* Action buttons row (Message, Call, SMS) */}
        {!isEditMode && (
          <div className="grid grid-cols-3 gap-4 w-full max-w-xs pt-4" id="profile-actions-bar">
            
            {/* 1. Message */}
            <button
              onClick={() => router.push(`/chat-detail?phone=${encodeURIComponent(editPhone)}&name=${encodeURIComponent(editName)}&avatar=${encodeURIComponent(editAvatar)}`)}
              className="flex flex-col items-center bg-zinc-900 hover:bg-zinc-850 py-3 rounded-2xl transition-all cursor-pointer group active:scale-95 border border-zinc-850"
            >
              <MessageSquare className="h-5 w-5 text-[#00D4FF] mb-1.5 group-hover:scale-105" />
              <span className="text-[10px] font-sans text-zinc-300 font-medium">Text Chat</span>
            </button>

            {/* 2. Call */}
            <button
              onClick={() => {
                triggerVibration();
                window.location.href = `tel:${editPhone}`;
              }}
              className="flex flex-col items-center bg-zinc-900 hover:bg-zinc-850 py-3 rounded-2xl transition-all cursor-pointer group active:scale-95 border border-zinc-850"
            >
              <Phone className="h-5 w-5 text-emerald-400 mb-1.5 group-hover:scale-105" />
              <span className="text-[10px] font-sans text-zinc-300 font-medium">Call Node</span>
            </button>

            {/* 3. SMS */}
            <button
              onClick={() => {
                triggerVibration();
                window.location.href = `sms:${editPhone}`;
              }}
              className="flex flex-col items-center bg-zinc-900 hover:bg-zinc-850 py-3 rounded-2xl transition-all cursor-pointer group active:scale-95 border border-zinc-850"
            >
              <Mail className="h-5 w-5 text-[#FF006E] mb-1.5 group-hover:scale-105" />
              <span className="text-[10px] font-sans text-zinc-300 font-medium">SMS Out</span>
            </button>

          </div>
        )}

        {/* Edit/Save persistent action buttons */}
        <div className="w-full max-w-xs pt-8 mt-auto" id="profile-save-controls">
          {isEditMode ? (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  triggerVibration();
                  setIsEditMode(false);
                  if (contact) {
                    setEditName(contact.name);
                    setEditPhone(contact.phone);
                    setEditAvatar(contact.avatar || '');
                  }
                }}
                className="flex-1 py-3 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white font-semibold text-xs rounded-xl border border-zinc-804 transition-all cursor-pointer active:scale-97"
              >
                Abort Changes
              </button>
              <button
                type="button"
                onClick={handleSave}
                className="flex-1 py-3 bg-gradient-to-tr from-[#FF006E] to-[#d6005c] hover:opacity-90 text-white font-semibold text-xs rounded-xl shadow-[0_0_12px_rgba(255,0,110,0.3)] transition-all cursor-pointer active:scale-97 flex items-center justify-center gap-1.5"
              >
                <Check className="h-4 w-4 stroke-[2.5]" />
                Commit Node
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                triggerVibration();
                setIsEditMode(true);
              }}
              className="w-full py-3.5 bg-zinc-900 border border-zinc-802 text-zinc-300 hover:text-white hover:border-[#00D4FF]/40 font-semibold text-xs rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-97 shadow-md"
            >
              <Edit2 className="h-3.5 w-3.5 text-[#00D4FF]" />
              Modify Connection Settings
            </button>
          )}
        </div>

      </main>
    </div>
  );
}

export default function ProfilePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-black flex items-center justify-center">
        <label className="text-zinc-500 text-xs font-mono">Opening Contact Core...</label>
      </div>
    }>
      <ProfileContent />
    </Suspense>
  );
}
