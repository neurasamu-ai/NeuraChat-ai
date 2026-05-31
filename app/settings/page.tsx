'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import {
  User,
  Settings,
  UserCheck,
  Smartphone,
  Eye,
  Shield,
  HardDrive,
  Info,
  ChevronRight,
  Camera,
  X,
  ToggleLeft,
  ToggleRight,
  Sun,
  Moon,
  Laptop
} from 'lucide-react';
import {
  getUserProfile,
  saveUserProfile,
  getChats,
  getMessages,
  getCallLogs,
  getContacts,
  UserProfile
} from '@/lib/db';
import Header from '@/components/Header';
import BottomNav from '@/components/BottomNav';

export default function SettingsPage() {
  const router = useRouter();

  // Profile hook
  const [profile, setProfile] = useState<UserProfile>({
    name: 'Owner',
    bio: 'Living in the future',
    username: 'owner_neura'
  });

  // Settings states
  const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);
  const [isPrivacyOpen, setIsPrivacyOpen] = useState(false);
  const [isPermissionsOpen, setIsPermissionsOpen] = useState(false);
  const [isStorageOpen, setIsStorageOpen] = useState(false);
  const [isAboutOpen, setIsAboutOpen] = useState(false);

  // Edit fields
  const [editName, setEditName] = useState('');
  const [editBio, setEditBio] = useState('');
  const [editUsername, setEditUsername] = useState('');
  const [editAvatar, setEditAvatar] = useState('');

  // General settings triggers
  const [appearance, setAppearance] = useState<'dark' | 'light' | 'system'>('dark');
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [privacyToggles, setPrivacyToggles] = useState({
    analytics: true,
    crashReports: true,
    typingSync: false
  });

  // Storage usage calculator
  const [storageUsage, setStorageUsage] = useState('1.5 MB');

  useEffect(() => {
    async function loadProfile() {
      const stored = await getUserProfile();
      setProfile(stored);
      setEditName(stored.name);
      setEditBio(stored.bio || '');
      setEditUsername(stored.username || '');
      setEditAvatar(stored.avatar || '');
      setAppearance(stored.theme || 'dark');

      // Calculate fictional storage based on logs count
      try {
        const chatsC = (await getChats()).length;
        const callC = (await getCallLogs()).length;
        const contactsC = (await getContacts()).length;
        const kb = (chatsC * 5) + (callC * 1) + (contactsC * 2) + 350; // in KB
        setStorageUsage(`${(kb / 1024).toFixed(2)} MB`);
      } catch (err) {
        console.error(err);
      }
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

  // Profile save
  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editName.trim()) return;

    triggerVibration();
    const updated: UserProfile = {
      name: editName.trim(),
      bio: editBio.trim(),
      username: editUsername.trim().toLowerCase(),
      avatar: editAvatar || undefined
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
        setEditAvatar(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleClearCache = async () => {
    triggerVibration();
    // In a production local-first app we might delete some tables, but we will simply mock clearing
    // browser cookies/assets and notify. We'll set storage to minimum.
    setStorageUsage('0.15 MB');
    setIsStorageOpen(false);
  };

  return (
    <>
      <Header title="Settings" />

      {/* Settings Container Panel */}
      <main className="flex-1 p-4 overflow-y-auto space-y-4 pb-12" id="settings-main-container">
        
        {/* Profile Header Item */}
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
              @{profile.username || 'owner_neura'}
            </p>
            {profile.bio && (
              <p className="text-zinc-405 text-xs truncate mt-1 leading-relaxed">
                {profile.bio}
              </p>
            )}
          </div>

          <ChevronRight className="h-4 w-4 text-zinc-500" />
        </div>

        {/* Card-Based Settings List */}
        <div className="bg-zinc-950 border border-zinc-900 rounded-2xl p-1.5 space-y-0.5 divide-y divide-zinc-90 w-full select-none" id="settings-core-options-list">
          
          {/* Edit Profile trigger */}
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

          {/* Appearance Toggle */}
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
                { id: 'system' as const, label: 'System', icon: Laptop }
              ].map(themeItem => {
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

          {/* Notifications Switch */}
          <div className="flex items-center justify-between p-3 px-4 transition-colors rounded-xl select-none">
            <div className="flex items-center gap-3">
              <Eye className="h-4 w-4 text-[#00D4FF]" />
              <span className="text-xs font-medium text-zinc-200">Receive Push Notifications</span>
            </div>
            <button
              onClick={() => {
                triggerVibration();
                setNotificationsEnabled(p => !p);
              }}
              className="text-zinc-400 hover:text-white cursor-pointer"
            >
              {notificationsEnabled ? (
                <ToggleRight className="h-6 w-6 text-[#00D4FF]" />
              ) : (
                <ToggleLeft className="h-6 w-6 text-zinc-650" />
              )}
            </button>
          </div>

          {/* Privacy */}
          <div
            onClick={() => {
              triggerVibration();
              setIsPrivacyOpen(true);
            }}
            className="flex items-center justify-between p-3 px-4 hover:bg-zinc-900/60 transition-colors cursor-pointer rounded-xl group"
          >
            <div className="flex items-center gap-3">
              <Shield className="h-4 w-4 text-[#FF006E]" />
              <span className="text-xs font-medium text-zinc-200">Privacy & Diagnostics</span>
            </div>
            <ChevronRight className="h-4 w-4 text-zinc-600 group-hover:text-zinc-400 transition-colors" />
          </div>

          {/* Native Permissions wrapper */}
          <div
            onClick={() => {
              triggerVibration();
              setIsPermissionsOpen(true);
            }}
            className="flex items-center justify-between p-3 px-4 hover:bg-zinc-900/60 transition-colors cursor-pointer rounded-xl group"
          >
            <div className="flex items-center gap-3">
              <UserCheck className="h-4 w-4 text-purple-400" />
              <span className="text-xs font-medium text-zinc-200">Native Platform Permissions</span>
            </div>
            <ChevronRight className="h-4 w-4 text-zinc-600 group-hover:text-zinc-400 transition-colors" />
          </div>

          {/* Storage Details */}
          <div
            onClick={() => {
              triggerVibration();
              setIsStorageOpen(true);
            }}
            className="flex items-center justify-between p-3 px-4 hover:bg-zinc-900/60 transition-colors cursor-pointer rounded-xl group"
          >
            <div className="flex items-center gap-3">
              <HardDrive className="h-4 w-4 text-[#00D4FF]" />
              <span className="text-xs font-medium text-zinc-200">Storage Usage & Cache</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-mono text-zinc-500">{storageUsage}</span>
              <ChevronRight className="h-4 w-4 text-zinc-600 group-hover:text-zinc-400 transition-colors" />
            </div>
          </div>

          {/* About Dialog */}
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

        {/* 1. EDIT PROFILE MODAL DIALOG */}
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
                  Edit Cyber Profile
                </h3>

                <form onSubmit={handleProfileSave} className="space-y-4">
                  {/* Photo Edit */}
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
                      className="w-full bg-zinc-900 border border-zinc-805 rounded-xl px-4 py-2 text-xs text-white focus:outline-none focus:border-[#00D4FF]"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[9px] uppercase tracking-wider text-zinc-500 font-mono">Username Handle</label>
                    <input
                      type="text"
                      required
                      value={editUsername}
                      onChange={(e) => setEditUsername(e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-805 rounded-xl px-4 py-2 text-xs text-white focus:outline-none focus:border-[#00D4FF]"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[9px] uppercase tracking-wider text-[#FF006E] font-mono">Bio Status</label>
                    <textarea
                      value={editBio}
                      onChange={(e) => setEditBio(e.target.value)}
                      rows={2}
                      className="w-full bg-zinc-900 border border-zinc-805 rounded-xl px-4 py-2 text-xs text-white focus:outline-none focus:border-[#FF006E] resize-none"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full bg-[#00D4FF] hover:bg-[#00B2D6] text-black font-semibold text-xs py-2.5 rounded-xl transition-all cursor-pointer"
                  >
                    Save Changes to Matrix
                  </button>
                </form>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* 3. PRIVACY & DIAGNOSTICS */}
        <AnimatePresence>
          {isPrivacyOpen && (
            <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-50 flex items-center justify-center p-6 select-none animate-fade-in">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="w-full max-w-sm bg-zinc-950 border border-zinc-900 rounded-3xl p-6 relative"
              >
                <button
                  onClick={() => setIsPrivacyOpen(false)}
                  className="absolute top-4 right-4 text-zinc-500 hover:text-white cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>

                <h3 className="text-base font-bold font-display text-white mb-4">
                  Matrix Diagnostics
                </h3>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold text-white">Anonymized Analytics</p>
                      <p className="text-[10px] text-zinc-500 max-w-[200px]">Opt-in diagnostic trace compilation to optimize hub routing latency levels.</p>
                    </div>
                    <button
                      onClick={() => setPrivacyToggles(p => ({ ...p, analytics: !p.analytics }))}
                      className="cursor-pointer"
                    >
                      {privacyToggles.analytics ? (
                        <ToggleRight className="h-6 w-6 text-[#00D4FF]" />
                      ) : (
                        <ToggleLeft className="h-6 w-6 text-zinc-700" />
                      )}
                    </button>
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold text-white">Crash Logging Telemetry</p>
                      <p className="text-[10px] text-zinc-500 max-w-[200px]">Send error stack details directly to help debugging operations.</p>
                    </div>
                    <button
                      onClick={() => setPrivacyToggles(p => ({ ...p, crashReports: !p.crashReports }))}
                      className="cursor-pointer"
                    >
                      {privacyToggles.crashReports ? (
                        <ToggleRight className="h-6 w-6 text-[#00D4FF]" />
                      ) : (
                        <ToggleLeft className="h-6 w-6 text-zinc-700" />
                      )}
                    </button>
                  </div>
                </div>

                <button
                  onClick={() => setIsPrivacyOpen(false)}
                  className="w-full bg-[#00D4FF] text-black font-semibold text-xs py-2.5 rounded-xl mt-6 cursor-pointer"
                >
                  Done
                </button>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* 4. NATIVE PLATFORM PERMISSIONS */}
        <AnimatePresence>
          {isPermissionsOpen && (
            <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-50 flex items-center justify-center p-6 select-none">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="w-full max-w-sm bg-zinc-950 border border-zinc-900 rounded-3xl p-6 relative"
              >
                <button
                  onClick={() => setIsPermissionsOpen(false)}
                  className="absolute top-4 right-4 text-zinc-500 hover:text-white cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>

                <h3 className="text-base font-bold font-display text-white mb-4 drop-shadow-[0_0_8px_rgba(0,212,255,0.4)]">
                  Platform Permissions
                </h3>

                <p className="text-zinc-500 text-xs mb-6">NeuraChat operates directly with Capacitor wrappers. Review runtime device authorization states:</p>

                <div className="space-y-4">
                  {[
                    { label: 'Camera access', desc: 'Allows image bubble captures directly inline.', ok: true },
                    { label: 'Microphone permission', desc: 'Audio call streaming pipelines on tel/video nodes.', ok: true },
                    { label: 'Addressbook Contacts Sync', desc: 'Queries list for active dial/text chats.', ok: true },
                    { label: 'Storage clearance', desc: 'Caches chat feeds logs safely inside IndexedDB.', ok: true }
                  ].map((p, idx) => (
                    <div key={idx} className="flex items-start justify-between bg-zinc-900/40 p-3 border border-zinc-900 rounded-xl">
                      <div>
                        <p className="text-xs font-semibold text-white">{p.label}</p>
                        <p className="text-[10px] text-zinc-500 mt-0.5">{p.desc}</p>
                      </div>
                      <span className="text-[10px] uppercase font-mono font-bold text-emerald-400 bg-emerald-950/20 px-2 py-0.5 rounded-md border border-emerald-900/30">
                        Granted
                      </span>
                    </div>
                  ))}
                </div>

                <button
                  onClick={() => setIsPermissionsOpen(false)}
                  className="w-full bg-[#00D4FF] text-black font-semibold text-xs py-2.5 rounded-xl mt-6 cursor-pointer"
                >
                  Confirm Platforms Access
                </button>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* 5. STORAGE CACHE CLEANUP */}
        <AnimatePresence>
          {isStorageOpen && (
            <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-50 flex items-center justify-center p-6 select-none">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="w-full max-w-sm bg-zinc-950 border border-zinc-900 rounded-3xl p-6 relative gap-4 text-center"
              >
                <button
                  onClick={() => setIsStorageOpen(false)}
                  className="absolute top-4 right-4 text-zinc-500 hover:text-white cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>

                <h3 className="text-base font-bold font-display text-white mb-2">
                  Space & Cache Config
                </h3>
                <p className="text-zinc-500 text-xs mb-6">Verify space claimed by encrypted local channels history and attachments files.</p>

                <div className="flex flex-col items-center p-6 bg-zinc-900 rounded-2xl mb-6">
                  <span className="text-[11px] text-zinc-500 uppercase tracking-wider font-mono">Current Payload</span>
                  <span className="text-3xl font-extrabold font-mono text-[#00D4FF] mt-1.5">{storageUsage}</span>
                  <span className="text-[10px] text-zinc-650 font-mono mt-1">IndexedDB storage nodes</span>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => setIsStorageOpen(false)}
                    className="flex-1 bg-zinc-900 text-zinc-400 font-semibold text-xs py-2.5 rounded-xl cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleClearCache}
                    className="flex-1 bg-gradient-to-tr from-[#FF006E] to-[#b3004d] text-white font-semibold text-xs py-2.5 rounded-xl shadow-[0_0_10px_rgba(255,0,110,0.3)] cursor-pointer"
                  >
                    Wipe Logs Cache
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* 6. ABOUT NEURACHAT */}
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
                  NeuraChat Hub
                </h3>
                <p className="text-[11px] text-pink-400 font-mono uppercase tracking-widest mt-0.5">Version 8.0.0 Stable</p>

                <p className="text-zinc-500 text-xs px-4 py-4 leading-relaxed font-sans mt-2">
                  A high-speed, secure, localized communication portal designed with electric neon styling, client-side IndexedDB databases, and synchronized native device plugins compiled by NeuraSystems Ltd.
                </p>

                <div className="text-[10px] text-zinc-700 font-mono border-t border-zinc-900 pt-4 mt-2">
                  © 2026 NeuraSystems. All neural pathways protected.
                </div>

                <button
                  onClick={() => setIsAboutOpen(false)}
                  className="w-full bg-zinc-900 text-zinc-300 font-semibold text-xs py-2.5 rounded-xl mt-6 cursor-pointer"
                >
                  Dismiss About Log
                </button>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

      </main>

      <BottomNav currentTab="settings" />
    </>
  );
}
