'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Camera } from 'lucide-react';
import ImageCropModal from '@/components/ImageCropModal';
import { saveContact, Contact } from '@/lib/db';
import { generateId } from '@/lib/utils';
import { getWritableAccounts, saveContactToAccount, WritableAccount } from '@/lib/neura-contacts';
import { loadContactsFromDB } from '@/lib/contacts-store';
import { useBackHandler } from '@/lib/use-back-handler';

interface Props {
  open: boolean;
  initialPhone?: string;
  initialName?: string;
  onClose: () => void;
  onSaved?: (contact: Contact) => void;
}

export default function AddContactModal({
  open,
  initialPhone = '',
  initialName = '',
  onClose,
  onSaved,
}: Props) {
  const [name, setName] = useState(initialName);
  const [phone, setPhone] = useState(initialPhone);
  const [email, setEmail] = useState('');
  const [avatar, setAvatar] = useState('');
  const [cropSrc, setCropSrc] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState('neurachat');
  const [accounts, setAccounts] = useState<WritableAccount[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setPhone(initialPhone);
      setName(initialName);
      setError('');
    }
  }, [open, initialPhone, initialName]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const list = await getWritableAccounts();
        if (!cancelled) setAccounts(list || []);
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  useBackHandler(open, onClose);

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') setCropSrc(reader.result);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!name.trim()) {
      setError('Name is required.');
      return;
    }
    const cleanPhone = phone.replace(/\\s+/g, '');
    const cleanEmail = email.trim();
    if (!cleanPhone && !cleanEmail) {
      setError('Provide at least a phone number or email.');
      return;
    }
    if (cleanPhone && !/^\\+?[0-9]{1,20}$/.test(cleanPhone)) {
      setError('Enter digits only (1-20 characters).');
      return;
    }
    if (cleanEmail && !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(cleanEmail)) {
      setError('Please input a valid email address.');
      return;
    }

    setSaving(true);
    try {
      const chosen = accounts.find((a) => a.id === selectedAccountId);
      const isNativeSave = !!chosen && chosen.id !== 'neurachat';
      let nativeRawId: string | undefined;
      let nativeContactId: string | undefined;

      if (isNativeSave) {
        const res = await saveContactToAccount({
          name: name.trim(),
          phone: cleanPhone || undefined,
          email: cleanEmail || undefined,
          accountType: chosen!.accountType,
          accountName: chosen!.accountName,
        });
        if (!res.success) {
          setError(res.error || 'Could not save to selected account.');
          setSaving(false);
          return;
        }
        nativeRawId = res.rawContactId;
        nativeContactId = res.contactId;
      }

      const stableKey = nativeContactId || generateId('contact');
      const localId = nativeContactId ? `cap-${nativeContactId}` : stableKey;

      const newContact: Contact = {
        id: localId,
        name: name.trim(),
        phone: cleanPhone,
        email: cleanEmail || undefined,
        avatar: avatar || undefined,
        favorite: false,
        sourceLabel: chosen?.label || 'NeuraChat',
        accountType: chosen?.accountType || undefined,
        accountName: chosen?.accountName || undefined,
        rawContactId: nativeRawId,
        contactId: nativeContactId,
      };

      await saveContact(newContact);
      try {
        await loadContactsFromDB();
      } catch {}

      setName('');
      setPhone('');
      setEmail('');
      setAvatar('');
      setError('');
      onClose();
      onSaved?.(newContact);
    } catch (err) {
      console.error('add contact failed', err);
      setError('Save failed. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-50 flex items-center justify-center p-6 select-none">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-sm bg-zinc-950 border border-zinc-900 rounded-3xl p-6 relative max-h-[90vh] overflow-y-auto"
            >
              <button
                onClick={onClose}
                className="absolute top-4 right-4 text-zinc-400 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>

              <h3 className="text-base font-bold font-display text-white mb-4 drop-shadow-[0_0_8px_rgba(0,212,255,0.4)]">
                Add Contact Node
              </h3>

              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <p className="text-xs text-[#FF006E] font-medium leading-none">{error}</p>
                )}

                <div className="flex flex-col items-center justify-center gap-2 mb-2">
                  <label className="text-[10px] uppercase font-mono tracking-widest text-zinc-600">
                    Contact Avatar
                  </label>
                  <div className="relative group cursor-pointer active:scale-95">
                    <div className="w-16 h-16 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-500 overflow-hidden">
                      {avatar ? (
                        <img
                          src={avatar}
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
                    value={name}
                    onChange={(e) => setName(e.target.value)}
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
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
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
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
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
                  disabled={saving}
                  className="w-full bg-[#00D4FF] hover:bg-[#00B2D6] disabled:opacity-60 text-black font-semibold text-xs py-3 rounded-xl shadow-[0_0_12px_rgba(0,212,255,0.3)] active:scale-95 transition-all mt-2 cursor-pointer"
                >
                  {saving ? 'Saving…' : 'Save Contact'}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <ImageCropModal
        open={!!cropSrc}
        src={cropSrc}
        aspect={1}
        onCancel={() => setCropSrc('')}
        onConfirm={(cropped) => {
          setAvatar(cropped);
          setCropSrc('');
        }}
      />
    </>
  );
}
