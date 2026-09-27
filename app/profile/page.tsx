'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import {
  Phone,
  MessageSquare,
  Mail,
  Camera,
  Check,
  Pencil,
  X,
  Star,
  Share2,
  Ban,
  Trash2,
} from 'lucide-react';
import {
  getContacts,
  saveContact,
  deleteContact,
  getBlockedContacts,
  blockContact,
  unblockContact,
  Contact,
} from '@/lib/db';
import { syncBlockedListToNative } from '@/lib/sms-plugin';
import { updateContactNative, deleteRawContact } from '@/lib/neura-contacts';
import { dispatchCall } from '@/lib/telecom-plugin';
import Header from '@/components/Header';
import { generateId } from '@/lib/utils';
import { useBackHandler } from '@/lib/use-back-handler';

function ProfileContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const urlName = searchParams.get('name') || 'Unknown';
  const urlPhone = searchParams.get('phone') || '';
  const urlAvatar = searchParams.get('avatar') || '';

  const [contact, setContact] = useState<Contact | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);

  // Editable fields
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editAvatar, setEditAvatar] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [isFavorite, setIsFavorite] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Load contact
  useEffect(() => {
    async function loadContact() {
      try {
        const all = await getContacts();
        const match = urlPhone
          ? all.find((c) => c.phone === urlPhone)
          : all.find((c) => c.name === urlName);
        if (match) {
          setContact(match);
          setEditName(match.name);
          setEditPhone(match.phone);
          setEditAvatar(match.avatar || '');
          setEditEmail(match.email || '');
          setIsFavorite(match.favorite);
        } else {
          setContact({
            id: generateId('temp'),
            name: urlName,
            phone: urlPhone,
            avatar: urlAvatar || undefined,
            favorite: false,
          });
          setEditName(urlName);
          setEditPhone(urlPhone);
          setEditAvatar(urlAvatar);
          setIsFavorite(false);
        }
        // Block status
        const blocked = await getBlockedContacts();
        const digits = (urlPhone || '').replace(/\D/g, '');
        setIsBlocked(
          blocked.some((b) => {
            const bd = (b.phone || '').replace(/\D/g, '');
            return bd && digits && (bd === digits || bd.endsWith(digits) || digits.endsWith(bd));
          })
        );
      } catch (e) {
        console.error('loadContact failed', e);
      }
    }
    loadContact();
  }, [urlPhone, urlName, urlAvatar]);

  const triggerVibration = () => {
    if (typeof window !== 'undefined' && navigator.vibrate) navigator.vibrate(30);
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') setEditAvatar(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    if (!contact || !editName.trim() || !editPhone.trim()) return;
    triggerVibration();

    const newName = editName.trim();
    const newPhone = editPhone.replace(/\s+/g, '');
    const newEmail = editEmail.trim();

    // If this contact came from the device / Google / SIM, update it at the
    // source first. Only update the local record after the native write
    // succeeds (or there is no native source to write to).
    if (contact.rawContactId && (contact.accountType || contact.accountName)) {
      try {
        const res = await updateContactNative({
          rawContactId: contact.rawContactId,
          name: newName,
          phone: newPhone,
          email: newEmail || undefined,
        });
        if (!res.success) {
          console.warn('System-level update failed:', res.error);
        }
      } catch (e) {
        console.error('updateContactNative threw', e);
      }
    }

    const updated: Contact = {
      ...contact,
      name: newName,
      phone: newPhone,
      email: newEmail || undefined,
      avatar: editAvatar || undefined,
      favorite: isFavorite,
    };
    await saveContact(updated);
    setContact(updated);
    setIsEditMode(false);
  };

  const handleToggleFavorite = async () => {
    if (!contact || isEditMode) return;
    triggerVibration();
    const next = !isFavorite;
    setIsFavorite(next);
    const updated = { ...contact, favorite: next };
    await saveContact(updated);
    setContact(updated);
  };

  const handleToggleBlock = async () => {
    if (!contact) return;
    triggerVibration();
    try {
      if (isBlocked) {
        await unblockContact(`blocked-${(contact.phone || '').replace(/\D/g, '')}`);
        setIsBlocked(false);
      } else {
        await blockContact({ name: contact.name, phone: contact.phone });
        setIsBlocked(true);
      }
      const list = await getBlockedContacts();
      await syncBlockedListToNative(list.map((x) => x.phone));
    } catch (e) {
      console.error('toggleBlock failed', e);
    }
  };

  const handleDelete = async () => {
    if (!contact) return;
    triggerVibration();
    try {
      // If this contact lives in the system provider, remove it there too.
      if (contact.rawContactId) {
        try {
          const ok = await deleteRawContact(contact.rawContactId);
          if (!ok) {
            console.warn('System-level delete returned false');
          }
        } catch (e) {
          console.error('deleteRawContact failed', e);
        }
      }
      await deleteContact(contact.id);
      router.back();
    } catch (e) {
      console.error('delete failed', e);
    }
  };

  const handleCall = async () => {
    if (!editPhone) return;
    triggerVibration();
    await dispatchCall(editPhone);
  };

  const handleSms = () => {
    if (!editPhone) return;
    triggerVibration();
    router.push(
      `/chat-detail?phone=${encodeURIComponent(editPhone)}&name=${encodeURIComponent(editName)}&avatar=${encodeURIComponent(editAvatar)}`
    );
  };

  const handleShare = async () => {
    if (!editPhone) return;
    triggerVibration();
    const text = `${editName}\n${editPhone}`;
    try {
      if (typeof navigator !== 'undefined' && (navigator as any).share) {
        await (navigator as any).share({ title: editName, text });
      } else if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(text);
      }
    } catch (e) {
      console.error('share failed', e);
    }
  };

  // Back exits edit mode first
  useBackHandler(confirmDelete, () => setConfirmDelete(false));
  useBackHandler(isEditMode, () => {
    setIsEditMode(false);
    if (contact) {
      setEditName(contact.name);
      setEditPhone(contact.phone);
      setEditAvatar(contact.avatar || '');
      setEditEmail(contact.email || '');
    }
  });

  return (
    <div className="flex flex-col h-screen w-full md:max-w-md md:mx-auto bg-zinc-950 text-white relative">
      <Header
        title={isEditMode ? 'Edit Contact' : 'Contact'}
        onBack={() => {
          if (isEditMode) {
            setIsEditMode(false);
            if (contact) {
              setEditName(contact.name);
              setEditPhone(contact.phone);
              setEditAvatar(contact.avatar || '');
              setEditEmail(contact.email || '');
            }
          } else {
            router.back();
          }
        }}
        rightAction={
          <div className="flex items-center gap-1">
            {!isEditMode && (
              <button
                onClick={() => {
                  triggerVibration();
                  setIsEditMode(true);
                }}
                className="p-2 rounded-full text-zinc-400 hover:text-[#00D4FF] transition-colors"
                title="Edit"
              >
                <Pencil className="h-5 w-5" />
              </button>
            )}
            {!isEditMode && (
              <button
                onClick={handleToggleFavorite}
                className="p-2 rounded-full text-zinc-400 hover:text-amber-400 transition-colors"
                title="Favorite"
              >
                <Star className={`h-5 w-5 ${isFavorite ? 'fill-amber-400 text-amber-400' : ''}`} />
              </button>
            )}
          </div>
        }
      />

      <main className="flex-1 p-6 overflow-y-auto space-y-6 flex flex-col items-center">
        {/* Avatar */}
        <div className="relative mb-2">
          <div className="absolute -inset-1 rounded-full bg-gradient-to-tr from-[#00D4FF] to-[#FF006E] opacity-70 blur-md" />
          <div className="w-32 h-32 rounded-full overflow-hidden bg-zinc-900 relative border-2 border-zinc-950 z-10 flex items-center justify-center text-4xl font-extrabold text-[#00D4FF] uppercase tracking-widest shadow-2xl">
            {editAvatar ? (
              <img src={editAvatar} alt={editName} className="w-full h-full object-cover" />
            ) : (
              editName.slice(0, 2)
            )}
            {isEditMode && (
              <label className="absolute inset-0 bg-black/60 z-20 flex flex-col items-center justify-center gap-1 cursor-pointer">
                <Camera className="h-6 w-6 text-white" />
                <span className="text-[9px] text-white/80 font-mono uppercase font-semibold">
                  Change Photo
                </span>
                <input type="file" onChange={handleAvatarChange} accept="image/*" className="hidden" />
              </label>
            )}
          </div>
        </div>

        {/* Name / phone / email */}
        <div className="w-full max-w-xs space-y-4">
          {isEditMode ? (
            <div className="space-y-3">
              <div>
                <label className="text-[9px] uppercase tracking-widest text-[#00D4FF] font-mono font-bold block mb-1">
                  Name
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl py-2.5 px-4 text-sm text-white focus:outline-none focus:border-[#00D4FF]"
                />
              </div>
              <div>
                <label className="text-[9px] uppercase tracking-widest text-[#FF006E] font-mono font-bold block mb-1">
                  Phone
                </label>
                <input
                  type="tel"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl py-2.5 px-4 text-sm text-white focus:outline-none focus:border-[#FF006E]"
                />
              </div>
              <div>
                <label className="text-[9px] uppercase tracking-widest text-zinc-500 font-mono font-bold block mb-1">
                  Email (optional)
                </label>
                <input
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl py-2.5 px-4 text-sm text-white focus:outline-none focus:border-zinc-600"
                />
              </div>
            </div>
          ) : (
            <div className="text-center space-y-1">
              <h2 className="text-2xl font-bold text-white flex items-center justify-center gap-2">
                {editName}
                {isFavorite && <Star className="h-4 w-4 fill-amber-400 text-amber-400" />}
              </h2>
              {editPhone && (
                <p className="text-sm text-zinc-400 font-mono tracking-wide">{editPhone}</p>
              )}
              {editEmail && (
                <p className="text-xs text-[#00D4FF] font-mono truncate">{editEmail}</p>
              )}
              {isBlocked && (
                <div className="inline-flex items-center gap-1.5 mt-2 px-2.5 py-1 rounded-full bg-red-950/30 border border-red-900/40">
                  <Ban className="h-3 w-3 text-red-400" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-red-400">
                    Blocked
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Actions row */}
        {!isEditMode && (
          <div className="grid grid-cols-4 gap-3 w-full max-w-sm pt-2">
            <button
              onClick={handleSms}
              className="flex flex-col items-center bg-zinc-900 hover:bg-zinc-850 py-3 rounded-2xl border border-zinc-850 active:scale-95 transition-all"
            >
              <MessageSquare className="h-5 w-5 text-[#00D4FF] mb-1.5" />
              <span className="text-[10px] text-zinc-300 font-medium">Message</span>
            </button>
            <button
              onClick={handleCall}
              className="flex flex-col items-center bg-zinc-900 hover:bg-zinc-850 py-3 rounded-2xl border border-zinc-850 active:scale-95 transition-all"
            >
              <Phone className="h-5 w-5 text-emerald-400 mb-1.5" />
              <span className="text-[10px] text-zinc-300 font-medium">Call</span>
            </button>
            <button
              onClick={handleShare}
              className="flex flex-col items-center bg-zinc-900 hover:bg-zinc-850 py-3 rounded-2xl border border-zinc-850 active:scale-95 transition-all"
            >
              <Share2 className="h-5 w-5 text-purple-400 mb-1.5" />
              <span className="text-[10px] text-zinc-300 font-medium">Share</span>
            </button>
            <button
              onClick={handleToggleBlock}
              className={`flex flex-col items-center py-3 rounded-2xl border active:scale-95 transition-all ${
                isBlocked
                  ? 'bg-emerald-950/20 border-emerald-900/40'
                  : 'bg-red-950/20 border-red-900/30'
              }`}
            >
              <Ban className={`h-5 w-5 mb-1.5 ${isBlocked ? 'text-emerald-400' : 'text-red-400'}`} />
              <span className={`text-[10px] font-medium ${isBlocked ? 'text-emerald-400' : 'text-red-400'}`}>
                {isBlocked ? 'Unblock' : 'Block'}
              </span>
            </button>
          </div>
        )}

        {/* Save / Cancel + Delete */}
        <div className="w-full max-w-sm pt-6 mt-auto">
          {isEditMode ? (
            <div className="flex gap-2">
              <button
                onClick={() => {
                  triggerVibration();
                  setIsEditMode(false);
                  if (contact) {
                    setEditName(contact.name);
                    setEditPhone(contact.phone);
                    setEditAvatar(contact.avatar || '');
                    setEditEmail(contact.email || '');
                  }
                }}
                className="flex-1 py-3 bg-zinc-900 text-zinc-400 font-semibold text-xs rounded-xl border border-zinc-800 active:scale-97"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="flex-1 py-3 bg-gradient-to-tr from-[#FF006E] to-[#d6005c] text-white font-semibold text-xs rounded-xl shadow-lg active:scale-97 flex items-center justify-center gap-1.5"
              >
                <Check className="h-4 w-4" />
                Save
              </button>
            </div>
          ) : (
            <button
              onClick={() => {
                triggerVibration();
                setConfirmDelete(true);
              }}
              className="w-full py-3 bg-red-950/10 border border-red-900/20 text-red-400 font-semibold text-xs rounded-xl active:scale-97 flex items-center justify-center gap-2"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete Contact
            </button>
          )}
        </div>
        {/* Delete confirmation modal */}
        <AnimatePresence>
          {confirmDelete && contact && (
            <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-6">
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="w-full max-w-sm bg-zinc-950 border border-zinc-900 rounded-3xl p-6"
              >
                <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-red-950/30 border border-red-900/40 flex items-center justify-center">
                  <Trash2 className="h-6 w-6 text-red-400" />
                </div>
                <h3 className="text-base font-bold text-white text-center mb-1">
                  Delete Contact?
                </h3>
                <p className="text-xs text-zinc-400 text-center mb-5">
                  &ldquo;{contact.name}&rdquo; will be removed.
                  {contact.rawContactId
                    ? ' This contact lives in your device / Google / SIM account and will be removed from there too.'
                    : ''}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setConfirmDelete(false)}
                    className="flex-1 py-3 bg-zinc-900 text-zinc-300 font-semibold text-xs rounded-xl active:scale-97"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={async () => {
                      setConfirmDelete(false);
                      await handleDelete();
                    }}
                    className="flex-1 py-3 bg-red-600 hover:bg-red-500 text-white font-semibold text-xs rounded-xl active:scale-97"
                  >
                    Delete
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

export default function ProfilePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-black flex items-center justify-center">
          <label className="text-zinc-500 text-xs font-mono">Loading contact…</label>
        </div>
      }
    >
      <ProfileContent />
    </Suspense>
  );
}
