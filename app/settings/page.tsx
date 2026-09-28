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
  Database,
  Palette,
  Sparkles,
  Trash2
} from 'lucide-react';
import {
  getUserProfile,
  saveUserProfile,
  UserProfile,
} from '@/lib/db';
import Header from '@/components/Header';
import BottomNav from '@/components/BottomNav';
import { useBackHandler } from '@/lib/use-back-handler';
import { getBlockedContacts, unblockContact, BlockedContact } from '@/lib/db';
import { syncBlockedListToNative } from '@/lib/sms-plugin';
import { runBackup, listBackups, restoreFromFile } from '@/lib/backup';
import { CALL_THEMES, getCallThemeId, setCallThemeId } from '@/lib/call-themes';
import { PROVIDERS, getProvider } from '@/lib/ai/providers';
import { getKeys, getKeyForProvider, setKeyForProvider, clearKeyForProvider, getProviderSettings, updateProviderSettings } from '@/lib/ai/keystore';
import { ProviderKey, ProviderSettings } from '@/lib/ai/types';
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
  const [isBackupOpen, setIsBackupOpen] = useState(false);
  const [backupList, setBackupList] = useState<Array<{ filename: string; modified: number; size: number }>>([]);
  const [backupBusy, setBackupBusy] = useState(false);
  const [backupMessage, setBackupMessage] = useState('');
  const [isCallThemeOpen, setIsCallThemeOpen] = useState(false);
  const [selectedCallTheme, setSelectedCallTheme] = useState('neon');
  const [isAiProvidersOpen, setIsAiProvidersOpen] = useState(false);
  const [aiSettings, setAiSettings] = useState<ProviderSettings[]>([]);
  const [aiKeys, setAiKeys] = useState<ProviderKey[]>([]);
  const [editingProvider, setEditingProvider] = useState<string | null>(null);
  const [editBaseUrl, setEditBaseUrl] = useState('');
  const [editModel, setEditModel] = useState('');
  const [editApiKey, setEditApiKey] = useState('');
  const [aiMessage, setAiMessage] = useState('');

  // Edit fields
  const [editName, setEditName] = useState('');
  const [editBio, setEditBio] = useState('');
  const [editUsername, setEditUsername] = useState('');
  const [editAvatar, setEditAvatar] = useState('');

  // Appearance
  const [appearance, setAppearance] = useState<'dark' | 'light' | 'system'>('system');




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
        setEditAvatar(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };


  // ---- Back-button integration ----
  useBackHandler(isAboutOpen, () => setIsAboutOpen(false));
  useBackHandler(isCommsOpen, () => setIsCommsOpen(false));
  useBackHandler(isBlockedOpen, () => setIsBlockedOpen(false));
  useBackHandler(isBackupOpen, () => setIsBackupOpen(false));
  useBackHandler(isCallThemeOpen, () => setIsCallThemeOpen(false));
  useBackHandler(isAiProvidersOpen, () => setIsAiProvidersOpen(false));
  useBackHandler(!!editingProvider, () => setEditingProvider(null));

  const loadAiState = async () => {
    try {
      const [settings, keys] = await Promise.all([getProviderSettings(), getKeys()]);
      setAiSettings(settings);
      setAiKeys(keys);
    } catch (e) {
      console.error('loadAiState failed', e);
    }
  };

  useEffect(() => {
    if (!isAiProvidersOpen) return;
    loadAiState();
  }, [isAiProvidersOpen]);

  const toggleProviderEnabled = async (providerId: string) => {
    triggerVibration();
    const cur = aiSettings.find((s) => s.providerId === providerId);
    await updateProviderSettings(providerId, { enabled: !cur?.enabled });
    await loadAiState();
  };

  const openProviderEditor = async (providerId: string) => {
    triggerVibration();
    const def = getProvider(providerId);
    const cur = aiSettings.find((s) => s.providerId === providerId);
    const existingKey = await getKeyForProvider(providerId);
    setEditBaseUrl(cur?.baseUrl || def?.defaultBaseUrl || '');
    setEditModel(cur?.model || '');
    setEditApiKey(existingKey?.key || '');
    setEditingProvider(providerId);
    setAiMessage('');
  };

  const saveProviderEdits = async () => {
    if (!editingProvider) return;
    triggerVibration();
    setAiMessage('');
    try {
      await updateProviderSettings(editingProvider, {
        baseUrl: editBaseUrl.trim() || undefined,
        model: editModel.trim() || undefined,
      });
      if (editApiKey.trim()) {
        await setKeyForProvider(editingProvider, editApiKey.trim());
      } else {
        await clearKeyForProvider(editingProvider);
      }
      setAiMessage('Saved');
      await loadAiState();
    } catch (e: any) {
      setAiMessage('Save failed: ' + (e?.message || 'unknown'));
    }
  };

  const canSaveProvider = !!editingProvider
    && editBaseUrl.trim().length > 0
    && editModel.trim().length > 0
    && editApiKey.trim().length > 0;


  useEffect(() => {
    if (!isCallThemeOpen) return;
    setSelectedCallTheme(getCallThemeId());
  }, [isCallThemeOpen]);

  const applyCallTheme = (id: string) => {
    triggerVibration();
    setCallThemeId(id);
    setSelectedCallTheme(id);
  };

  useEffect(() => {
    if (!isBackupOpen) return;
    (async () => {
      try {
        const list = await listBackups();
        setBackupList(list);
      } catch (e) {
        console.error('list backups failed', e);
      }
    })();
  }, [isBackupOpen]);

  const handleCreateBackup = async () => {
    triggerVibration();
    setBackupBusy(true);
    setBackupMessage('');
    try {
      const res = await runBackup();
      if (res.ok) {
        setBackupMessage(`Saved to ${res.path || 'Downloads/NeuraChat'}`);
        const list = await listBackups();
        setBackupList(list);
      } else {
        setBackupMessage('Backup failed: ' + (res.error || 'unknown'));
      }
    } catch (e: any) {
      setBackupMessage('Backup failed: ' + (e?.message || 'unknown'));
    } finally {
      setBackupBusy(false);
    }
  };

  const handleRestore = async (filename: string) => {
    triggerVibration();
    setBackupBusy(true);
    setBackupMessage('');
    try {
      const res = await restoreFromFile(filename);
      if (res.ok) {
        setBackupMessage(`Restored ${res.stats?.contacts || 0} contacts, ${res.stats?.chats || 0} chats, ${res.stats?.messages || 0} messages`);
      } else {
        setBackupMessage('Restore failed: ' + (res.error || 'unknown'));
      }
    } catch (e: any) {
      setBackupMessage('Restore failed: ' + (e?.message || 'unknown'));
    } finally {
      setBackupBusy(false);
    }
  };
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

          {/* Call UI Themes */}
          <div
            onClick={() => {
              triggerVibration();
              setIsCallThemeOpen(true);
            }}
            className="flex items-center justify-between p-3 px-4 hover:bg-zinc-900/60 transition-colors cursor-pointer rounded-xl group"
          >
            <div className="flex items-center gap-3">
              <Palette className="h-4 w-4 text-[#FF006E]" />
              <span className="text-xs font-medium text-zinc-200">Call UI Themes</span>
            </div>
            <ChevronRight className="h-4 w-4 text-zinc-600 group-hover:text-zinc-400 transition-colors" />
          </div>

          {/* Backup & Restore */}
          <div
            onClick={() => {
              triggerVibration();
              setIsBackupOpen(true);
            }}
            className="flex items-center justify-between p-3 px-4 hover:bg-zinc-900/60 transition-colors cursor-pointer rounded-xl group"
          >
            <div className="flex items-center gap-3">
              <Database className="h-4 w-4 text-[#00D4FF]" />
              <span className="text-xs font-medium text-zinc-200">Backup & Restore</span>
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

        {/* ========== AI PROVIDERS MODAL ========== */}
        <AnimatePresence>
          {isAiProvidersOpen && (
            <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-50 flex items-center justify-center p-6 select-none">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="w-full max-w-sm bg-zinc-950 border border-zinc-900 rounded-3xl p-5 relative max-h-[85vh] overflow-y-auto"
              >
                <button
                  onClick={() => setIsAiProvidersOpen(false)}
                  className="absolute top-4 right-4 text-zinc-500 hover:text-white"
                >
                  <X className="h-5 w-5" />
                </button>

                <h3 className="text-base font-bold text-white mb-1">AI Providers</h3>
                <p className="text-[11px] text-zinc-500 mb-4 leading-relaxed">
                  Turn on the providers you use and add at least one API key.
                  The chat only shows enabled providers.
                </p>

                <div className="space-y-2">
                  {PROVIDERS.map((p) => {
                    const setting = aiSettings.find((x) => x.providerId === p.id);
                    const enabled = !!setting?.enabled;
                    const keyCount = aiKeys.filter((k) => k.providerId === p.id).length;
                    return (
                      <div
                        key={p.id}
                        className="rounded-2xl bg-zinc-900 border border-zinc-800 p-3"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold text-white truncate">
                              {p.name}
                            </p>
                            <p className="text-[10px] text-zinc-500 truncate mt-0.5">
                              {keyCount} key{keyCount === 1 ? '' : 's'}
                              {setting?.model ? ` · ${setting.model}` : ''}
                            </p>
                          </div>
                          <button
                            onClick={() => toggleProviderEnabled(p.id)}
                            className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider active:scale-95 ${
                              enabled
                                ? 'bg-[#00D4FF]/20 text-[#00D4FF]'
                                : 'bg-zinc-800 text-zinc-400'
                            }`}
                          >
                            {enabled ? 'On' : 'Off'}
                          </button>
                        </div>
                        <button
                          onClick={() => openProviderEditor(p.id)}
                          className="w-full mt-2 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-300 text-[10px] font-bold uppercase tracking-wider active:scale-95"
                        >
                          Manage keys & model
                        </button>
                      </div>
                    );
                  })}
                </div>

                <button
                  onClick={() => setIsAiProvidersOpen(false)}
                  className="w-full bg-zinc-900 text-zinc-300 font-semibold text-xs py-2.5 rounded-xl mt-5 cursor-pointer"
                >
                  Done
                </button>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* ========== PROVIDER EDITOR MODAL ========== */}
        <AnimatePresence>
          {editingProvider && (() => {
            const p = getProvider(editingProvider);
            return (
              <div className="fixed inset-0 bg-black/92 backdrop-blur-md z-[60] flex items-center justify-center p-6 select-none">
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="w-full max-w-sm bg-zinc-950 border border-zinc-900 rounded-3xl p-5 relative max-h-[88vh] overflow-y-auto"
                >
                  <button
                    onClick={() => setEditingProvider(null)}
                    className="absolute top-4 right-4 text-zinc-500 hover:text-white"
                  >
                    <X className="h-5 w-5" />
                  </button>

                  <h3 className="text-base font-bold text-white mb-1">
                    {p?.name || editingProvider}
                  </h3>
                  {p?.description && (
                    <p className="text-[10px] text-zinc-500 mb-4">{p.description}</p>
                  )}

                  {/* Base URL */}
                  <div className="mb-3">
                    <label className="text-[9px] uppercase tracking-widest text-zinc-500 font-mono font-bold block mb-1">
                      Base URL
                    </label>
                    <input
                      type="text"
                      value={editBaseUrl}
                      onChange={(e) => setEditBaseUrl(e.target.value)}
                      placeholder={p?.defaultBaseUrl || 'https://api.example.com/v1'}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-[#00D4FF]"
                    />
                  </div>

                  {/* Model name (custom) */}
                  <div className="mb-3">
                    <label className="text-[9px] uppercase tracking-widest text-zinc-500 font-mono font-bold block mb-1">
                      Model name
                    </label>
                    <input
                      type="text"
                      value={editModel}
                      onChange={(e) => setEditModel(e.target.value)}
                      placeholder={p?.defaultModelHint || 'model-id (type anything)'}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-[#00D4FF]"
                    />
                    <p className="text-[9px] text-zinc-600 mt-1 leading-snug">
                      Type the exact model id. No fixed list — any model the
                      provider supports works.
                    </p>
                  </div>

                  {/* API key */}
                  <div className="mb-4">
                    <label className="text-[9px] uppercase tracking-widest text-zinc-500 font-mono font-bold block mb-1">
                      API key
                    </label>
                    <input
                      type="password"
                      value={editApiKey}
                      onChange={(e) => setEditApiKey(e.target.value)}
                      placeholder="sk-…  (stored locally, never leaves the device except to the provider)"
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-[#00D4FF]"
                    />
                  </div>

                  <button
                    onClick={saveProviderEdits}
                    disabled={!canSaveProvider}
                    className="w-full py-2.5 rounded-xl bg-[#00D4FF] text-black font-bold text-xs uppercase tracking-wider active:scale-97 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Save
                  </button>

                  {!canSaveProvider && (
                    <p className="text-[10px] text-zinc-500 text-center mt-2">
                      Fill all three fields to enable Save.
                    </p>
                  )}

                  {aiMessage && (
                    <p className="text-[11px] text-zinc-300 bg-zinc-900 border border-zinc-800 rounded-xl p-2.5 mt-3 leading-snug">
                      {aiMessage}
                    </p>
                  )}
                </motion.div>
              </div>
            );
          })()}
        </AnimatePresence>

        {/* ========== CALL UI THEMES MODAL ========== */}
        <AnimatePresence>
          {isCallThemeOpen && (
            <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-50 flex items-center justify-center p-6 select-none">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="w-full max-w-md bg-zinc-950 border border-zinc-900 rounded-3xl p-5 relative max-h-[85vh] overflow-y-auto"
              >
                <button
                  onClick={() => setIsCallThemeOpen(false)}
                  className="absolute top-4 right-4 text-zinc-500 hover:text-white z-10"
                >
                  <X className="h-5 w-5" />
                </button>

                <h3 className="text-base font-bold text-white mb-1">Call UI Themes</h3>
                <p className="text-[11px] text-zinc-500 mb-4 leading-relaxed">
                  Pick a theme for the in-call screen. Independent of your
                  app&apos;s light / dark appearance.
                </p>

                <div className="grid grid-cols-2 gap-3">
                  {CALL_THEMES.map((t) => {
                    const selected = selectedCallTheme === t.id;
                    return (
                      <button
                        key={t.id}
                        onClick={() => applyCallTheme(t.id)}
                        className="rounded-2xl overflow-hidden border transition-all active:scale-[0.98] relative"
                        style={{
                          borderColor: selected ? t.ctrlActiveBorder : t.ctrlBorder,
                          boxShadow: selected ? `0 0 0 2px ${t.ctrlActiveBorder}` : 'none',
                        }}
                      >
                        {/* Mini preview */}
                        <div
                          className="aspect-[9/12] p-2.5 flex flex-col items-center justify-start relative overflow-hidden"
                          style={{ background: t.bg }}
                        >
                          {/* glows */}
                          <div className="absolute -top-12 left-1/2 -translate-x-1/2 w-32 h-32 rounded-full blur-2xl pointer-events-none"
                            style={{ background: t.glowTop }} />
                          <div className="absolute -bottom-12 left-1/2 -translate-x-1/2 w-32 h-32 rounded-full blur-2xl pointer-events-none"
                            style={{ background: t.glowBottom }} />

                          <p className="text-[6px] uppercase tracking-[0.2em] font-mono mb-1.5 z-10"
                            style={{ color: t.labelColor }}>
                            In call
                          </p>

                          {/* Avatar */}
                          <div className="relative mb-1.5 z-10">
                            <div
                              className="absolute -inset-1 rounded-full blur-md"
                              style={{ background: t.haloColor }}
                            />
                            <div
                              className="relative w-8 h-8 rounded-full flex items-center justify-center font-bold text-[10px]"
                              style={{
                                background: t.avatarBg,
                                border: `1px solid ${t.avatarBorder}`,
                                color: t.avatarText,
                              }}
                            >
                              AM
                            </div>
                          </div>

                          <p className="text-[8px] font-bold truncate z-10"
                            style={{ color: t.nameColor }}>
                            Amir
                          </p>
                          <p className="text-[5px] font-mono z-10"
                            style={{ color: t.statusColor }}>
                            00:42
                          </p>

                          {/* Mini controls */}
                          <div className="grid grid-cols-3 gap-0.5 mt-2 w-full z-10">
                            {[0, 1, 2].map(i => (
                              <div
                                key={i}
                                className="h-3 rounded-md"
                                style={{
                                  background: i === 0 ? t.ctrlActiveBg : t.ctrlBg,
                                  border: `0.5px solid ${i === 0 ? t.ctrlActiveBorder : t.ctrlBorder}`,
                                }}
                              />
                            ))}
                          </div>

                          {/* End button */}
                          <div
                            className="w-6 h-6 rounded-full mt-1.5 z-10"
                            style={{
                              background: t.endBg,
                              boxShadow: `0 0 8px ${t.endShadow}`,
                            }}
                          />
                        </div>

                        {/* Label */}
                        <div className="bg-zinc-900 px-2 py-1.5 text-left">
                          <p className="text-[10px] font-semibold text-white truncate">
                            {t.name}
                          </p>
                          {selected && (
                            <p className="text-[9px] font-bold uppercase tracking-wider mt-0.5"
                              style={{ color: t.ctrlActiveBorder }}>
                              ✓ Applied
                            </p>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>

                <button
                  onClick={() => setIsCallThemeOpen(false)}
                  className="w-full bg-zinc-900 text-zinc-300 font-semibold text-xs py-2.5 rounded-xl mt-5 cursor-pointer"
                >
                  Done
                </button>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* ========== BACKUP & RESTORE MODAL ========== */}
        <AnimatePresence>
          {isBackupOpen && (
            <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-50 flex items-center justify-center p-6 select-none">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="w-full max-w-sm bg-zinc-950 border border-zinc-900 rounded-3xl p-5 relative max-h-[85vh] overflow-y-auto"
              >
                <button
                  onClick={() => setIsBackupOpen(false)}
                  className="absolute top-4 right-4 text-zinc-500 hover:text-white"
                >
                  <X className="h-5 w-5" />
                </button>

                <h3 className="text-base font-bold text-white mb-1">Backup & Restore</h3>
                <p className="text-[11px] text-zinc-500 mb-4 leading-relaxed">
                  Backups are saved to <span className="font-mono text-zinc-400">Downloads/NeuraChat/</span> as JSON.
                  An automatic backup runs a few minutes after each app start and
                  when you send the app to the background.
                </p>

                <button
                  onClick={handleCreateBackup}
                  disabled={backupBusy}
                  className="w-full py-3 rounded-2xl bg-[#00D4FF] text-black font-bold text-xs uppercase tracking-wider active:scale-97 disabled:opacity-50 mb-3"
                >
                  {backupBusy ? 'Working…' : 'Create backup now'}
                </button>

                {backupMessage && (
                  <div className="text-[11px] text-zinc-300 bg-zinc-900 border border-zinc-800 rounded-xl p-2.5 mb-4 leading-snug">
                    {backupMessage}
                  </div>
                )}

                <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-mono mb-2">
                  Existing backups
                </p>

                {backupList.length === 0 ? (
                  <p className="text-[11px] text-zinc-600 py-4 text-center">
                    No backups found yet.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {backupList.map((b) => (
                      <div
                        key={b.filename}
                        className="flex items-center justify-between p-2.5 rounded-xl bg-zinc-900 border border-zinc-800"
                      >
                        <div className="min-w-0 flex-1 mr-2">
                          <p className="text-[11px] text-white font-mono truncate">{b.filename}</p>
                          <p className="text-[9px] text-zinc-500 mt-0.5">
                            {new Date(b.modified).toLocaleString()} · {(b.size / 1024).toFixed(1)} KB
                          </p>
                        </div>
                        <button
                          onClick={() => handleRestore(b.filename)}
                          disabled={backupBusy}
                          className="px-3 py-1.5 rounded-lg bg-emerald-500/15 text-emerald-400 text-[10px] font-bold uppercase tracking-wider active:scale-95 disabled:opacity-50 shrink-0"
                        >
                          Restore
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <button
                  onClick={() => setIsBackupOpen(false)}
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

      <BottomNav currentTab="settings" />
    </>
  );
}
