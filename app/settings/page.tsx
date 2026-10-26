'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  User,
  Smartphone,
  Info,
  ChevronRight,
  Camera,
  X,
  Sun,
  Moon,
  Laptop,
  Phone,
  MessageSquare,
  Shield as ShieldIcon,
  Ban,
  Sparkles,
  Trash2,
  Palette,
  Music,
  Lock
} from 'lucide-react';
import {
  getUserProfile,
  saveUserProfile,
  UserProfile,
} from '@/lib/db';
import Header from '@/components/Header';
import BottomNav from '@/components/BottomNav';
import { useBackHandler } from '@/lib/use-back-handler';
import ImageCropModal from '@/components/ImageCropModal';
import { BUBBLE_COLORS, DEFAULT_BUBBLE_COLOR, getBubbleColorHex, bubbleTextColor } from '@/lib/bubble-colors';
import { getBlockedContacts, unblockContact, BlockedContact } from '@/lib/db';
import { syncBlockedListToNative } from '@/lib/sms-plugin';
import AiProvidersModal from '@/components/AiProvidersModal';
import {
  getCallAccounts, getPreferredCallSimId, setPreferredCallSimId,
  isDefaultDialer, requestDefaultDialer, CallAccount,
} from '@/lib/telecom-plugin';
import {
  getActiveSubscriptions, getPreferredSimId, setPreferredSimId,
  isDefaultSmsApp, requestDefaultSmsRole, Subscription,
} from '@/lib/sms-plugin';

export default function SettingsPage() {
  // Profile
  const [profile, setProfile] = useState<UserProfile>({
    name: 'Owner',
    bio: '',
    username: 'owner',
    theme: 'system',
  });

  // Modals
  const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [isCommsOpen, setIsCommsOpen] = useState(false);
  const [callAccounts, setCallAccounts] = useState<CallAccount[]>([]);
  const [callSimId, setCallSimId] = useState<string | null>(null);
  const [smsSubs, setSmsSubs] = useState<Subscription[]>([]);
  const [smsSimId, setSmsSimId] = useState<number | null>(null);
  const [defaultSmsOk, setDefaultSmsOk] = useState<boolean>(true);
  const [defaultDialerOk, setDefaultDialerOk] = useState<boolean>(true);
  const [isBlockedOpen, setIsBlockedOpen] = useState(false);
  const [blockedList, setBlockedList] = useState<BlockedContact[]>([]);
  const [isAiProvidersOpen, setIsAiProvidersOpen] = useState(false);

  // Edit fields
  const [editName, setEditName] = useState('');
  const [editBio, setEditBio] = useState('');
  const [editUsername, setEditUsername] = useState('');
  const [editAvatar, setEditAvatar] = useState('');
  const [cropSrc, setCropSrc] = useState<string | null>(null);

  // Appearance
  const [appearance, setAppearance] = useState<'dark' | 'light' | 'system'>('system');
  const [bubbleColor, setBubbleColor] = useState<string>(DEFAULT_BUBBLE_COLOR);
  const [bubbleColorOpen, setBubbleColorOpen] = useState(false);
  const [appLockEnabled, setAppLockEnabled] = useState(false);
  const [lockBusy, setLockBusy] = useState(false);




  // Load communication settings when the modal opens.
  useEffect(() => {
    if (!isBlockedOpen) return;
    (async () => {
      try {
        const list = await getBlockedContacts();
        setBlockedList(list);
      } catch (e) {
        console.error('blocked load failed', e);
      }
    })();
  }, [isBlockedOpen]);

  useEffect(() => {
    if (!isCommsOpen) return;
    (async () => {
      try {
        const accounts = await getCallAccounts();
        setCallAccounts(accounts);
        setCallSimId(getPreferredCallSimId());

        const subs = await getActiveSubscriptions();
        setSmsSubs(subs);
        setSmsSimId(getPreferredSimId());

        setDefaultSmsOk(await isDefaultSmsApp());
        setDefaultDialerOk(await isDefaultDialer());
      } catch (e) {
        console.error('comms load failed', e);
      }
    })();
  }, [isCommsOpen]);

  useEffect(() => {
    async function loadProfile() {
      const stored = await getUserProfile();
      setProfile(stored);
      setEditName(stored.name);
      setEditBio(stored.bio || '');
      setEditUsername(stored.username || '');
      setEditAvatar(stored.avatar || '');
      setAppearance(stored.theme || 'system');
      setBubbleColor(getBubbleColorHex(stored.bubbleColor));
      setAppLockEnabled(!!stored.appLockEnabled);
    }
    const handle = setTimeout(() => {
      loadProfile();
    }, 0);
    return () => clearTimeout(handle);
  }, []);

  const triggerVibration = () => {
    if (typeof window !== 'undefined' && window.navigator && window.navigator.vibrate) {
      window.navigator.vibrate(25);
    }
  };

  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editName.trim()) return;

    triggerVibration();
    const updated: UserProfile = {
      name: editName.trim(),
      bio: editBio.trim(),
      username: editUsername.trim().toLowerCase(),
      avatar: editAvatar || undefined,
      theme: appearance,
    };

    await saveUserProfile(updated);
    setProfile(updated);
    setIsEditProfileOpen(false);
  };

  const handleAvatarSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setCropSrc(reader.result);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };


  // ---- Back-button integration ----
  useBackHandler(isAboutOpen, () => setIsAboutOpen(false));
  useBackHandler(isCommsOpen, () => setIsCommsOpen(false));

  useBackHandler(isBlockedOpen, () => setIsBlockedOpen(false));
  useBackHandler(isAiProvidersOpen, () => setIsAiProvidersOpen(false));

  useBackHandler(isEditProfileOpen, () => setIsEditProfileOpen(false));

  return (
    <>
      <Header title="Settings" />

      <main className="flex-1 p-4 overflow-y-auto space-y-4 pb-12" id="settings-main-container">

        {/* Profile Header Card */}
        <div
          onClick={() => {
            triggerVibration();
            setIsEditProfileOpen(true);
          }}
          className="flex items-center gap-4 p-4 rounded-2xl bg-gradient-to-tr from-zinc-950 to-zinc-900 border border-zinc-900 hover:border-zinc-800 transition-all cursor-pointer shadow-lg select-none"
          id="profile-header-card"
        >
          {profile.avatar ? (
            <img
              src={profile.avatar}
              alt={profile.name}
              className="w-16 h-16 rounded-full object-cover border border-[#00D4FF] shadow-[0_0_10px_rgba(0,212,255,0.3)]"
            />
          ) : (
            <div className="w-16 h-16 rounded-full bg-zinc-800 text-[#00D4FF] flex items-center justify-center font-bold text-xl uppercase border border-zinc-700">
              {profile.name.slice(0, 2).toUpperCase()}
            </div>
          )}

          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-base text-white font-display truncate">
              {profile.name}
            </h3>
            <p className="text-zinc-500 text-xs font-mono mt-0.5 truncate">
              @{profile.username || 'owner'}
            </p>
            {profile.bio && (
              <p className="text-zinc-400 text-xs truncate mt-1 leading-relaxed">
                {profile.bio}
              </p>
            )}
          </div>

          <ChevronRight className="h-4 w-4 text-zinc-500" />
        </div>

        {/* Settings list */}
        <div className="bg-zinc-950 border border-zinc-900 rounded-2xl p-1.5 space-y-0.5 divide-y divide-zinc-900 w-full select-none" id="settings-core-options-list">

          {/* Edit Profile */}
          <div
            onClick={() => {
              triggerVibration();
              setIsEditProfileOpen(true);
            }}
            className="flex items-center justify-between p-3 px-4 hover:bg-zinc-900/60 transition-colors cursor-pointer rounded-xl group"
          >
            <div className="flex items-center gap-3">
              <User className="h-4 w-4 text-[#00D4FF]" />
              <span className="text-xs font-medium text-zinc-200">Edit Profile Details</span>
            </div>
            <ChevronRight className="h-4 w-4 text-zinc-600 group-hover:text-zinc-400 transition-colors" />
          </div>

          {/* Appearance */}
          <div className="flex flex-col p-3 px-4 transition-colors rounded-xl space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Smartphone className="h-4 w-4 text-emerald-400" />
                <span className="text-xs font-medium text-zinc-200">Appearance Mode</span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 p-1 bg-zinc-900 rounded-lg">
              {[
                { id: 'dark' as const, label: 'Dark', icon: Moon },
                { id: 'light' as const, label: 'Light', icon: Sun },
                { id: 'system' as const, label: 'System', icon: Laptop },
              ].map((themeItem) => {
                const isSelected = appearance === themeItem.id;
                const Icon = themeItem.icon;
                return (
                  <button
                    key={themeItem.id}
                    onClick={async () => {
                      triggerVibration();
                      setAppearance(themeItem.id);
                      const updated = { ...profile, theme: themeItem.id };
                      setProfile(updated);
                      await saveUserProfile(updated);
                      window.dispatchEvent(new CustomEvent('neurachat-theme-change', { detail: { theme: themeItem.id } }));
                    }}
                    className={`flex items-center justify-center gap-1.5 py-1.5 rounded-md text-[10px] uppercase tracking-wider font-semibold transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-zinc-800 text-white shadow'
                        : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    <Icon className="h-3 w-3" />
                    {themeItem.label}
                  </button>
                );
              })}
            </div>
          </div>


          {/* App Lock */}
          <div className="flex items-center justify-between p-3 px-4 transition-colors rounded-xl">
            <div className="flex items-center gap-3">
              <Lock className="h-4 w-4 text-[#00D4FF]" />
              <div>
                <span className="text-xs font-medium text-zinc-200">App Lock</span>
                <p className="text-[10px] text-zinc-500 mt-0.5">
                  Lock on app launch (fingerprint / face / pattern)
                </p>
              </div>
            </div>
            <button
              onClick={async () => {
                triggerVibration();
                if (lockBusy) return;
                setLockBusy(true);
                try {
                  if (appLockEnabled) {
                    // Turning off — clear the pattern too.
                    const updated = {
                      ...profile,
                      appLockEnabled: false,
                      appLockPattern: undefined,
                    };
                    setProfile(updated);
                    setAppLockEnabled(false);
                    await saveUserProfile(updated);
                  } else {
                    // Turning on — save flag, provider will trigger setup next launch.
                    const updated = {
                      ...profile,
                      appLockEnabled: true,
                    };
                    setProfile(updated);
                    setAppLockEnabled(true);
                    await saveUserProfile(updated);
                  }
                } catch (e) {
                  console.error('App Lock toggle failed', e);
                } finally {
                  setLockBusy(false);
                }
              }}
              className={`relative w-11 h-6 rounded-full transition-colors ${
                appLockEnabled ? 'bg-[#00D4FF]' : 'bg-zinc-700'
              }`}
            >
              <span
                className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${
                  appLockEnabled ? 'left-[22px]' : 'left-0.5'
                }`}
              />
            </button>
          </div>

          {/* Bubble Color (collapsible) */}
          <div className="flex flex-col p-3 px-4 transition-colors rounded-xl">
            <button
              onClick={() => {
                triggerVibration();
                setBubbleColorOpen((v) => !v);
              }}
              className="flex items-center justify-between w-full text-left"
            >
              <div className="flex items-center gap-3">
                <Palette className="h-4 w-4 text-pink-400" />
                <span className="text-xs font-medium text-zinc-200">Bubble Color</span>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className="w-4 h-4 rounded-full border border-zinc-800"
                  style={{ backgroundColor: bubbleColor }}
                />
                <ChevronRight
                  className={`h-4 w-4 text-zinc-500 transition-transform ${bubbleColorOpen ? 'rotate-90' : ''}`}
                />
              </div>
            </button>

            {bubbleColorOpen && (
            <div className="mt-2 space-y-2">
            <p className="text-[10px] text-zinc-500 leading-snug">
              Color of your outgoing SMS bubbles across all chats.
            </p>

            <div className="grid grid-cols-4 gap-2 mt-1">
              {BUBBLE_COLORS.map((c) => {
                const isSelected = bubbleColor.toLowerCase() === c.hex.toLowerCase();
                return (
                  <button
                    key={c.id}
                    onClick={async () => {
                      triggerVibration();
                      setBubbleColor(c.hex);
                      const updated = { ...profile, bubbleColor: c.hex };
                      setProfile(updated);
                      await saveUserProfile(updated);
                      window.dispatchEvent(new CustomEvent('neurachat-bubble-color-change', { detail: { color: c.hex } }));
                    }}
                    className={`relative aspect-square rounded-2xl border-2 transition-all active:scale-90 flex items-center justify-center ${
                      isSelected ? 'border-white shadow-lg' : 'border-transparent'
                    }`}
                    style={{ backgroundColor: c.hex }}
                    title={c.name}
                  >
                    {isSelected && (
                      <svg
                        viewBox="0 0 24 24"
                        className="w-5 h-5"
                        fill="none"
                        stroke={bubbleTextColor(c.hex)}
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Preview */}
            <div className="mt-2 flex justify-end">
              <div
                className="px-3 py-2 rounded-2xl rounded-tr-sm text-xs font-medium"
                style={{
                  backgroundColor: bubbleColor,
                  color: bubbleTextColor(bubbleColor),
                }}
              >
                Preview message
              </div>
            </div>
            </div>
            )}
          </div>

          {/* App Permissions */}
          <div
            onClick={async () => {
              triggerVibration();
              try {
                const mod = await import('@/lib/settings-plugin');
                await mod.openAppSettings();
              } catch (e) {
                console.error('open settings failed', e);
              }
            }}
            className="flex items-center justify-between p-3 px-4 hover:bg-zinc-900/60 transition-colors cursor-pointer rounded-xl group"
          >
            <div className="flex items-center gap-3">
              <ShieldIcon className="h-4 w-4 text-purple-400" />
              <span className="text-xs font-medium text-zinc-200">Permissions</span>
            </div>
            <ChevronRight className="h-4 w-4 text-zinc-600 group-hover:text-zinc-400 transition-colors" />
          </div>

          {/* Calls & SMS */}
          <div
            onClick={() => {
              triggerVibration();
              setIsCommsOpen(true);
            }}
            className="flex items-center justify-between p-3 px-4 hover:bg-zinc-900/60 transition-colors cursor-pointer rounded-xl group"
          >
            <div className="flex items-center gap-3">
              <Phone className="h-4 w-4 text-[#10b981]" />
              <span className="text-xs font-medium text-zinc-200">Calls & SMS</span>
            </div>
            <ChevronRight className="h-4 w-4 text-zinc-600 group-hover:text-zinc-400 transition-colors" />
          </div>

          {/* Blocked Contacts */}
          <div
            onClick={() => {
              triggerVibration();
              setIsBlockedOpen(true);
            }}
            className="flex items-center justify-between p-3 px-4 hover:bg-zinc-900/60 transition-colors cursor-pointer rounded-xl group"
          >
            <div className="flex items-center gap-3">
              <Ban className="h-4 w-4 text-red-500" />
              <span className="text-xs font-medium text-zinc-200">Blocked Contacts</span>
            </div>
            <ChevronRight className="h-4 w-4 text-zinc-600 group-hover:text-zinc-400 transition-colors" />
          </div>

          {/* AI Providers */}
          <div
            onClick={() => {
              triggerVibration();
              setIsAiProvidersOpen(true);
            }}
            className="flex items-center justify-between p-3 px-4 hover:bg-zinc-900/60 transition-colors cursor-pointer rounded-xl group"
          >
            <div className="flex items-center gap-3">
              <Sparkles className="h-4 w-4 text-[#00D4FF]" />
              <span className="text-xs font-medium text-zinc-200">AI Providers</span>
            </div>
            <ChevronRight className="h-4 w-4 text-zinc-600 group-hover:text-zinc-400 transition-colors" />
          </div>

          {/* About */}
          <div
            onClick={() => {
              triggerVibration();
              setIsAboutOpen(true);
            }}
            className="flex items-center justify-between p-3 px-4 hover:bg-zinc-900/60 transition-colors cursor-pointer rounded-xl group"
          >
            <div className="flex items-center gap-3">
              <Info className="h-4 w-4 text-zinc-400" />
              <span className="text-xs font-medium text-zinc-200">About NeuraChat</span>
            </div>
            <ChevronRight className="h-4 w-4 text-zinc-600 group-hover:text-zinc-400 transition-colors" />
          </div>

        </div>

        {/* ========== EDIT PROFILE MODAL ========== */}
        <AnimatePresence>
          {isEditProfileOpen && (
            <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-50 flex items-center justify-center p-6 select-none">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="w-full max-w-sm bg-zinc-950 border border-zinc-900 rounded-3xl p-6 relative shadow-2xl"
              >
                <button
                  type="button"
                  onClick={() => setIsEditProfileOpen(false)}
                  className="absolute top-4 right-4 text-zinc-500 hover:text-white cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>

                <h3 className="text-base font-bold font-display text-white mb-4 drop-shadow-[0_0_8px_rgba(0,212,255,0.4)]">
                  Edit Profile
                </h3>

                <form onSubmit={handleProfileSave} className="space-y-4">
                  <div className="flex flex-col items-center justify-center gap-1">
                    <label className="text-[8px] uppercase tracking-wider text-zinc-500 font-mono">Avatar Photo</label>
                    <div className="relative group cursor-pointer">
                      <div className="w-16 h-16 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center overflow-hidden">
                        {editAvatar ? (
                          <img src={editAvatar} alt="preview" className="w-full h-full object-cover" />
                        ) : (
                          <Camera className="h-5 w-5 text-zinc-500 group-hover:text-white" />
                        )}
                      </div>
                      <input
                        type="file"
                        onChange={handleAvatarSelect}
                        accept="image/*"
                        className="absolute inset-0 opacity-0 cursor-pointer"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[9px] uppercase tracking-wider text-zinc-500 font-mono">Display Name</label>
                    <input
                      type="text"
                      required
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2 text-xs text-white focus:outline-none focus:border-[#00D4FF]"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[9px] uppercase tracking-wider text-zinc-500 font-mono">Username Handle</label>
                    <input
                      type="text"
                      required
                      value={editUsername}
                      onChange={(e) => setEditUsername(e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2 text-xs text-white focus:outline-none focus:border-[#00D4FF]"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[9px] uppercase tracking-wider text-[#FF006E] font-mono">Bio</label>
                    <textarea
                      value={editBio}
                      onChange={(e) => setEditBio(e.target.value)}
                      rows={2}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2 text-xs text-white focus:outline-none focus:border-[#FF006E] resize-none"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full bg-[#00D4FF] hover:bg-[#00B2D6] text-black font-semibold text-xs py-2.5 rounded-xl transition-all cursor-pointer"
                  >
                    Save Changes
                  </button>
                </form>
              </motion.div>
            </div>
          )}
        </AnimatePresence>


        {/* ========== CALLS & SMS MODAL ========== */}
        <AnimatePresence>
          {isCommsOpen && (
            <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-50 flex items-center justify-center p-6 select-none">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="w-full max-w-sm bg-zinc-950 border border-zinc-900 rounded-3xl p-5 relative max-h-[85vh] overflow-y-auto"
              >
                <button
                  onClick={() => setIsCommsOpen(false)}
                  className="absolute top-4 right-4 text-zinc-500 hover:text-white cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>

                <h3 className="text-base font-bold font-display text-white mb-4">
                  Calls & SMS
                </h3>

                {/* ---- Default apps ---- */}
                <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-mono mb-2">
                  Default apps
                </p>

                <div className="space-y-2 mb-5">
                  <button
                    onClick={async () => {
                      triggerVibration();
                      if (defaultSmsOk) return;
                      await requestDefaultSmsRole();
                      setTimeout(async () => {
                        setDefaultSmsOk(await isDefaultSmsApp());
                      }, 800);
                    }}
                    className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all ${
                      defaultSmsOk
                        ? 'bg-emerald-950/20 border-emerald-900/30 text-emerald-400'
                        : 'bg-zinc-900 border-zinc-800 text-white hover:bg-zinc-850 cursor-pointer active:scale-[0.98]'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <MessageSquare className="h-4 w-4" />
                      <div className="text-left">
                        <p className="text-xs font-semibold">Default SMS app</p>
                        <p className="text-[10px] text-zinc-500 mt-0.5">
                          {defaultSmsOk ? 'Set' : 'Tap to set as default'}
                        </p>
                      </div>
                    </div>
                    {defaultSmsOk && (
                      <span className="text-[9px] font-mono uppercase">Active</span>
                    )}
                  </button>

                  <button
                    onClick={async () => {
                      triggerVibration();
                      if (defaultDialerOk) return;
                      await requestDefaultDialer();
                      setTimeout(async () => {
                        setDefaultDialerOk(await isDefaultDialer());
                      }, 800);
                    }}
                    className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all ${
                      defaultDialerOk
                        ? 'bg-emerald-950/20 border-emerald-900/30 text-emerald-400'
                        : 'bg-zinc-900 border-zinc-800 text-white hover:bg-zinc-850 cursor-pointer active:scale-[0.98]'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4" />
                      <div className="text-left">
                        <p className="text-xs font-semibold">Default Phone app</p>
                        <p className="text-[10px] text-zinc-500 mt-0.5">
                          {defaultDialerOk ? 'Set' : 'Tap to set as default'}
                        </p>
                      </div>
                    </div>
                    {defaultDialerOk && (
                      <span className="text-[9px] font-mono uppercase">Active</span>
                    )}
                  </button>
                </div>

                {/* ---- Call SIM ---- */}
                <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-mono mb-2">
                  Preferred SIM for calls
                </p>

                <div className="space-y-2 mb-5">
                  {callAccounts.length === 0 ? (
                    <p className="text-[11px] text-zinc-500 px-2">
                      No call accounts detected.
                    </p>
                  ) : (
                    <>
                      <button
                        onClick={() => {
                          triggerVibration();
                          setPreferredCallSimId(null);
                          setCallSimId(null);
                        }}
                        className={`w-full flex items-center justify-between p-2.5 rounded-xl border text-xs transition-all ${
                          callSimId === null
                            ? 'bg-[#10b981]/15 border-[#10b981]/40 text-[#10b981]'
                            : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:bg-zinc-850 cursor-pointer'
                        }`}
                      >
                        <span>Always ask</span>
                        {callSimId === null && <span className="text-[9px]">✓</span>}
                      </button>
                      {callAccounts.map((acc) => (
                        <button
                          key={acc.id}
                          onClick={() => {
                            triggerVibration();
                            setPreferredCallSimId(acc.id);
                            setCallSimId(acc.id);
                          }}
                          className={`w-full flex items-center justify-between p-2.5 rounded-xl border text-xs transition-all ${
                            callSimId === acc.id
                              ? 'bg-[#10b981]/15 border-[#10b981]/40 text-[#10b981]'
                              : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:bg-zinc-850 cursor-pointer'
                          }`}
                        >
                          <span className="truncate">{acc.label}</span>
                          {callSimId === acc.id && <span className="text-[9px]">✓</span>}
                        </button>
                      ))}
                    </>
                  )}
                </div>

                {/* ---- SMS SIM ---- */}
                <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-mono mb-2">
                  Preferred SIM for SMS
                </p>

                <div className="space-y-2">
                  {smsSubs.length === 0 ? (
                    <p className="text-[11px] text-zinc-500 px-2">
                      No SIM subscriptions detected.
                    </p>
                  ) : (
                    <>
                      <button
                        onClick={() => {
                          triggerVibration();
                          setPreferredSimId(null);
                          setSmsSimId(null);
                        }}
                        className={`w-full flex items-center justify-between p-2.5 rounded-xl border text-xs transition-all ${
                          smsSimId === null
                            ? 'bg-[#00D4FF]/15 border-[#00D4FF]/40 text-[#00D4FF]'
                            : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:bg-zinc-850 cursor-pointer'
                        }`}
                      >
                        <span>Always ask</span>
                        {smsSimId === null && <span className="text-[9px]">✓</span>}
                      </button>
                      {smsSubs.map((sub) => (
                        <button
                          key={sub.subscriptionId}
                          onClick={() => {
                            triggerVibration();
                            setPreferredSimId(sub.subscriptionId);
                            setSmsSimId(sub.subscriptionId);
                          }}
                          className={`w-full flex items-center justify-between p-2.5 rounded-xl border text-xs transition-all ${
                            smsSimId === sub.subscriptionId
                              ? 'bg-[#00D4FF]/15 border-[#00D4FF]/40 text-[#00D4FF]'
                              : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:bg-zinc-850 cursor-pointer'
                          }`}
                        >
                          <span className="truncate">
                            {sub.label}
                            {sub.carrierName ? ` · ${sub.carrierName}` : ''}
                          </span>
                          {smsSimId === sub.subscriptionId && <span className="text-[9px]">✓</span>}
                        </button>
                      ))}
                    </>
                  )}
                </div>

                <button
                  onClick={() => setIsCommsOpen(false)}
                  className="w-full bg-zinc-900 text-zinc-300 font-semibold text-xs py-2.5 rounded-xl mt-5 cursor-pointer"
                >
                  Done
                </button>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* ========== BLOCKED CONTACTS MODAL ========== */}
        <AnimatePresence>
          {isBlockedOpen && (
            <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-50 flex items-center justify-center p-6 select-none">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="w-full max-w-sm bg-zinc-950 border border-zinc-900 rounded-3xl p-5 relative max-h-[80vh] overflow-y-auto"
              >
                <button
                  onClick={() => setIsBlockedOpen(false)}
                  className="absolute top-4 right-4 text-zinc-500 hover:text-white"
                >
                  <X className="h-5 w-5" />
                </button>

                <h3 className="text-base font-bold text-white mb-1">Blocked Contacts</h3>
                <p className="text-[11px] text-zinc-500 mb-4">
                  Calls and messages from these numbers are ignored.
                </p>

                {blockedList.length === 0 ? (
                  <div className="text-center py-10">
                    <Ban className="h-8 w-8 mx-auto text-zinc-600 mb-3" />
                    <p className="text-xs text-zinc-500">No blocked contacts</p>
                    <p className="text-[10px] text-zinc-600 mt-1">
                      Long-press a contact or use the options menu to block.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {blockedList.map((b) => (
                      <div
                        key={b.id}
                        className="flex items-center justify-between p-3 rounded-2xl bg-zinc-900 border border-zinc-800"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-white truncate">{b.name}</p>
                          <p className="text-[10px] text-zinc-500 font-mono truncate">
                            {b.phone}
                          </p>
                        </div>
                        <button
                          onClick={async () => {
                            triggerVibration();
                            await unblockContact(b.id);
                            const list = await getBlockedContacts();
                            setBlockedList(list);
                            try {
                              await syncBlockedListToNative(list.map((x) => x.phone));
                            } catch (e) {
                              console.error('native block sync failed', e);
                            }
                          }}
                          className="px-3 py-1.5 rounded-lg bg-[#00D4FF]/15 text-[#00D4FF] text-[10px] font-bold uppercase tracking-wider active:scale-95"
                        >
                          Unblock
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* ========== ABOUT MODAL ========== */}
        <AnimatePresence>
          {isAboutOpen && (
            <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-50 flex items-center justify-center p-6 select-none">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="w-full max-w-sm bg-zinc-950 border border-zinc-900 rounded-3xl p-6 relative text-center"
              >
                <button
                  onClick={() => setIsAboutOpen(false)}
                  className="absolute top-4 right-4 text-zinc-500 hover:text-white cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>

                <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-[#00D4FF] to-[#FF006E] flex items-center justify-center shadow-lg relative mx-auto mb-4 animate-pulse">
                  <div className="w-6 h-6 rounded bg-zinc-950/70" />
                </div>

                <h3 className="text-base font-bold font-display text-white">
                  NeuraChat
                </h3>
                <p className="text-[11px] text-pink-400 font-mono uppercase tracking-widest mt-0.5">Version 1.0.0</p>

                <p className="text-zinc-500 text-xs px-4 py-4 leading-relaxed font-sans mt-2">
                  A simple Android SMS and calling app with contacts integration.
                </p>

                <div className="text-[10px] border-t border-zinc-900 pt-4 mt-2">
                  <a
                    href="https://neurasamu.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#00D4FF] hover:underline font-mono"
                  >
                    neurasamu.com
                  </a>
                </div>

                <button
                  onClick={() => setIsAboutOpen(false)}
                  className="w-full bg-zinc-900 text-zinc-300 font-semibold text-xs py-2.5 rounded-xl mt-6 cursor-pointer"
                >
                  Close
                </button>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

      </main>

        <AiProvidersModal
          open={isAiProvidersOpen}
          onClose={() => setIsAiProvidersOpen(false)}
        />

        <ImageCropModal
          open={!!cropSrc}
          src={cropSrc || ''}
          aspect={1}
          onCancel={() => setCropSrc(null)}
          onConfirm={(cropped) => {
            setEditAvatar(cropped);
            setCropSrc(null);
          }}
        />
      <BottomNav currentTab="settings" />
    </>
  );
}
