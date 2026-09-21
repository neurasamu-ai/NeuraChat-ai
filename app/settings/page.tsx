'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  User,
  Smartphone,
  UserCheck,
  Eye,
  HardDrive,
  Info,
  ChevronRight,
  Camera,
  X,
  Sun,
  Moon,
  Laptop,
  ExternalLink,
} from 'lucide-react';
import {
  getUserProfile,
  saveUserProfile,
  UserProfile,
  getDB,
} from '@/lib/db';
import Header from '@/components/Header';
import BottomNav from '@/components/BottomNav';
import {
  openAppSettings,
  openNotificationSettings,
  checkAllPermissions,
} from '@/lib/settings-plugin';

type PermissionsState = {
  camera: boolean;
  microphone: boolean;
  contacts: boolean;
  sms: boolean;
  phone: boolean;
  callLog: boolean;
  notifications: boolean;
};

export default function SettingsPage() {
  // Profile
  const [profile, setProfile] = useState<UserProfile>({
    name: 'Owner',
    bio: '',
    username: 'owner',
    theme: 'dark',
  });

  // Modals
  const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);
  const [isPermissionsOpen, setIsPermissionsOpen] = useState(false);
  const [isStorageOpen, setIsStorageOpen] = useState(false);
  const [isAboutOpen, setIsAboutOpen] = useState(false);

  // Edit fields
  const [editName, setEditName] = useState('');
  const [editBio, setEditBio] = useState('');
  const [editUsername, setEditUsername] = useState('');
  const [editAvatar, setEditAvatar] = useState('');

  // Appearance
  const [appearance, setAppearance] = useState<'dark' | 'light' | 'system'>('dark');

  // Real permissions
  const [permissions, setPermissions] = useState<PermissionsState>({
    camera: false,
    microphone: false,
    contacts: false,
    sms: false,
    phone: false,
    callLog: false,
    notifications: false,
  });

  // Real storage
  const [storageBytes, setStorageBytes] = useState<number>(0);
  const [storageQuota, setStorageQuota] = useState<number>(0);

  const formatBytes = (bytes: number): string => {
    if (!bytes || bytes <= 0) return '0 KB';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  const loadStorageEstimate = async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate) {
        const est = await navigator.storage.estimate();
        setStorageBytes(est.usage || 0);
        setStorageQuota(est.quota || 0);
      }
    } catch (e) {
      console.error('storage estimate failed', e);
    }
  };

  const loadPermissions = async () => {
    try {
      const p = await checkAllPermissions();
      setPermissions(p);
    } catch (e) {
      console.error('permission check failed', e);
    }
  };

  useEffect(() => {
    async function loadProfile() {
      const stored = await getUserProfile();
      setProfile(stored);
      setEditName(stored.name);
      setEditBio(stored.bio || '');
      setEditUsername(stored.username || '');
      setEditAvatar(stored.avatar || '');
      setAppearance(stored.theme || 'dark');
    }
    const handle = setTimeout(() => {
      loadProfile();
      loadStorageEstimate();
      loadPermissions();
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
        setEditAvatar(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleClearCache = async () => {
    triggerVibration();
    try {
      // Delete our IndexedDB database (chats, messages, contacts, call logs, profile)
      const db = await getDB();
      if (db) {
        const stores = ['chats', 'messages', 'contacts', 'callLogs', 'userProfile'];
        for (const name of stores) {
          if (db.objectStoreNames.contains(name)) {
            const tx = db.transaction(name, 'readwrite');
            await tx.store.clear();
            await tx.done;
          }
        }
      }
      // Also clear browser Cache Storage if available
      if (typeof caches !== 'undefined') {
        const keys = await caches.keys();
        for (const k of keys) {
          await caches.delete(k);
        }
      }
      await loadStorageEstimate();
      setIsStorageOpen(false);
    } catch (e) {
      console.error('clear cache failed', e);
    }
  };

  const permissionRows: { key: keyof PermissionsState; label: string; desc: string }[] = [
    { key: 'sms', label: 'SMS access', desc: 'Send, receive, and read text messages.' },
    { key: 'phone', label: 'Phone access', desc: 'Place and manage calls.' },
    { key: 'callLog', label: 'Call log', desc: 'Read and write call history.' },
    { key: 'contacts', label: 'Contacts', desc: 'Read and sync device contacts.' },
    { key: 'camera', label: 'Camera', desc: 'Attach photos in chats.' },
    { key: 'microphone', label: 'Microphone', desc: 'Record audio in calls.' },
    { key: 'notifications', label: 'Notifications', desc: 'Show message and call alerts.' },
  ];

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

          {/* Notifications — opens system notification settings */}
          <div
            onClick={() => {
              triggerVibration();
              openNotificationSettings();
            }}
            className="flex items-center justify-between p-3 px-4 hover:bg-zinc-900/60 transition-colors cursor-pointer rounded-xl group"
          >
            <div className="flex items-center gap-3">
              <Eye className="h-4 w-4 text-[#00D4FF]" />
              <span className="text-xs font-medium text-zinc-200">Notification Settings</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className={`text-[10px] font-mono ${permissions.notifications ? 'text-emerald-400' : 'text-zinc-500'}`}>
                {permissions.notifications ? 'On' : 'Off'}
              </span>
              <ExternalLink className="h-3.5 w-3.5 text-zinc-500 group-hover:text-zinc-300" />
            </div>
          </div>

          {/* Native Permissions */}
          <div
            onClick={() => {
              triggerVibration();
              loadPermissions();
              setIsPermissionsOpen(true);
            }}
            className="flex items-center justify-between p-3 px-4 hover:bg-zinc-900/60 transition-colors cursor-pointer rounded-xl group"
          >
            <div className="flex items-center gap-3">
              <UserCheck className="h-4 w-4 text-purple-400" />
              <span className="text-xs font-medium text-zinc-200">App Permissions</span>
            </div>
            <ChevronRight className="h-4 w-4 text-zinc-600 group-hover:text-zinc-400 transition-colors" />
          </div>

          {/* Storage */}
          <div
            onClick={() => {
              triggerVibration();
              loadStorageEstimate();
              setIsStorageOpen(true);
            }}
            className="flex items-center justify-between p-3 px-4 hover:bg-zinc-900/60 transition-colors cursor-pointer rounded-xl group"
          >
            <div className="flex items-center gap-3">
              <HardDrive className="h-4 w-4 text-[#00D4FF]" />
              <span className="text-xs font-medium text-zinc-200">Storage Usage & Cache</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-mono text-zinc-500">{formatBytes(storageBytes)}</span>
              <ChevronRight className="h-4 w-4 text-zinc-600 group-hover:text-zinc-400 transition-colors" />
            </div>
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

        {/* ========== PERMISSIONS MODAL ========== */}
        <AnimatePresence>
          {isPermissionsOpen && (
            <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-50 flex items-center justify-center p-6 select-none">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="w-full max-w-sm bg-zinc-950 border border-zinc-900 rounded-3xl p-6 relative max-h-[80vh] overflow-y-auto"
              >
                <button
                  onClick={() => setIsPermissionsOpen(false)}
                  className="absolute top-4 right-4 text-zinc-500 hover:text-white cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>

                <h3 className="text-base font-bold font-display text-white mb-2 drop-shadow-[0_0_8px_rgba(0,212,255,0.4)]">
                  App Permissions
                </h3>
                <p className="text-zinc-500 text-[10px] mb-4">Current status of system permissions this app needs.</p>

                <div className="space-y-3">
                  {permissionRows.map((p) => {
                    const granted = permissions[p.key];
                    return (
                      <div key={p.key} className="flex items-start justify-between bg-zinc-900/40 p-3 border border-zinc-900 rounded-xl">
                        <div className="pr-3">
                          <p className="text-xs font-semibold text-white">{p.label}</p>
                          <p className="text-[10px] text-zinc-500 mt-0.5">{p.desc}</p>
                        </div>
                        <span className={`text-[10px] uppercase font-mono font-bold px-2 py-0.5 rounded-md border ${
                          granted
                            ? 'text-emerald-400 bg-emerald-950/20 border-emerald-900/30'
                            : 'text-rose-400 bg-rose-950/20 border-rose-900/30'
                        }`}>
                          {granted ? 'Granted' : 'Denied'}
                        </span>
                      </div>
                    );
                  })}
                </div>

                <button
                  onClick={() => {
                    triggerVibration();
                    openAppSettings();
                  }}
                  className="w-full bg-[#00D4FF] hover:bg-[#00B2D6] text-black font-semibold text-xs py-2.5 rounded-xl mt-5 cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Open System Settings
                </button>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* ========== STORAGE MODAL ========== */}
        <AnimatePresence>
          {isStorageOpen && (
            <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-50 flex items-center justify-center p-6 select-none">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="w-full max-w-sm bg-zinc-950 border border-zinc-900 rounded-3xl p-6 relative text-center"
              >
                <button
                  onClick={() => setIsStorageOpen(false)}
                  className="absolute top-4 right-4 text-zinc-500 hover:text-white cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>

                <h3 className="text-base font-bold font-display text-white mb-2">
                  Storage & Cache
                </h3>
                <p className="text-zinc-500 text-xs mb-6">Local storage used by this app.</p>

                <div className="flex flex-col items-center p-6 bg-zinc-900 rounded-2xl mb-4">
                  <span className="text-[11px] text-zinc-500 uppercase tracking-wider font-mono">Currently Used</span>
                  <span className="text-3xl font-extrabold font-mono text-[#00D4FF] mt-1.5">{formatBytes(storageBytes)}</span>
                  {storageQuota > 0 && (
                    <span className="text-[10px] text-zinc-600 font-mono mt-1">
                      of {formatBytes(storageQuota)} available
                    </span>
                  )}
                </div>

                <p className="text-[10px] text-rose-400 bg-rose-950/20 border border-rose-900/30 rounded-lg p-2 mb-4">
                  Warning: This will delete all chats, messages, contacts, call logs, and your profile.
                </p>

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
                    Clear All Data
                  </button>
                </div>
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

                <div className="text-[10px] text-zinc-700 font-mono border-t border-zinc-900 pt-4 mt-2">
                  com.neurasamu.build.chat
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

      <BottomNav currentTab="settings" />
    </>
  );
}
