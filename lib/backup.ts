'use client';

import { registerPlugin, Capacitor } from '@capacitor/core';
import {
  Contact, Chat, Message, CallLog, BlockedContact, UserProfile,
  getContacts, getChats, getMessages, getCallLogs, getBlockedContacts,
  getUserProfile, saveContactsBulk, saveChat, saveMessage, saveCallLog,
  saveContact, blockContact, saveUserProfile, getDB,
} from './db';

interface BackupPluginType {
  writeBackup(options: { filename: string; content: string }): Promise<{ ok: boolean; path?: string }>;
  listBackups(): Promise<{ backups: Array<{ filename: string; modified: number; size: number }> }>;
  readBackup(options: { filename: string }): Promise<{ content: string }>;
  writeAutoBackup(options: { filename: string; content: string }): Promise<{ ok: boolean; path?: string }>;
  listAutoBackups(): Promise<{ backups: Array<{ filename: string; modified: number; size: number }> }>;
  readAutoBackup(options: { filename: string }): Promise<{ content: string }>;
}

const BackupPlugin = registerPlugin<BackupPluginType>('BackupPlugin');

export function isBackupAvailable(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (Capacitor.getPlatform() !== 'android') return false;
    try {
      if (Capacitor.isPluginAvailable('BackupPlugin')) return true;
    } catch {}
    try {
      if (Capacitor.isNativePlatform()) return true;
    } catch {}
    return false;
  } catch {
    return false;
  }
}

const AUTO_BACKUP_FILENAME = 'neurachat-auto-backup.json';
const BACKUP_VERSION = 1;

interface BackupPayload {
  version: number;
  createdAt: number;
  contacts: Contact[];
  chats: Chat[];
  messages: Message[];
  callLogs: CallLog[];
  blocked: BlockedContact[];
  profile: UserProfile;
}

// Gather every store worth keeping into one payload.
async function collectPayload(): Promise<BackupPayload> {
  const [contacts, chats, callLogs, blocked, profile] = await Promise.all([
    getContacts(),
    getChats(),
    getCallLogs(),
    getBlockedContacts(),
    getUserProfile(),
  ]);

  // Messages are per-chat; iterate all chats.
  const allMessages: Message[] = [];
  for (const c of chats) {
    try {
      const msgs = await getMessages(c.id);
      allMessages.push(...msgs);
    } catch (e) {
      console.warn('[backup] messages for', c.id, 'failed', e);
    }
  }

  return {
    version: BACKUP_VERSION,
    createdAt: Date.now(),
    contacts,
    chats,
    messages: allMessages,
    callLogs,
    blocked,
    profile,
  };
}

// Write the payload to Downloads/NeuraChat/<filename>
async function writeBackupFile(filename: string, payload: BackupPayload): Promise<{ ok: boolean; path?: string; error?: string }> {
  if (!isBackupAvailable()) {
    return { ok: false, error: 'Backup is not available on this platform' };
  }
  try {
    const content = JSON.stringify(payload);
    const res = await BackupPlugin.writeBackup({ filename, content });
    return { ok: !!res.ok, path: res.path };
  } catch (e: any) {
    console.error('[backup] write failed', e);
    return { ok: false, error: e?.message || String(e) };
  }
}

// Manual backup — names the file with a timestamp so multiple copies are kept.
export async function runBackup(): Promise<{ ok: boolean; path?: string; error?: string }> {
  const payload = await collectPayload();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `neurachat-backup-${stamp}.json`;
  return writeBackupFile(filename, payload);
}

// Auto backup — private folder (hidden from file manager), one rolling
// file overwritten every run. API keys are intentionally excluded.
export async function runAutoBackup(): Promise<{ ok: boolean; path?: string; error?: string }> {
  if (!isBackupAvailable()) return { ok: false, error: 'Not available' };
  try {
    const payload = await collectPayload();
    const content = JSON.stringify(payload);
    const res = await BackupPlugin.writeAutoBackup({
      filename: AUTO_BACKUP_FILENAME,
      content,
    });
    return { ok: !!res.ok, path: res.path };
  } catch (e: any) {
    console.error('[backup] auto write failed', e);
    return { ok: false, error: e?.message || String(e) };
  }
}

export async function listBackups(): Promise<Array<{ filename: string; modified: number; size: number }>> {
  if (!isBackupAvailable()) return [];
  try {
    const res = await BackupPlugin.listBackups();
    return res.backups || [];
  } catch (e) {
    console.error('[backup] list failed', e);
    return [];
  }
}

// Restore: apply a parsed payload back into IndexedDB.
async function applyPayload(payload: BackupPayload): Promise<{ contacts: number; chats: number; messages: number; callLogs: number }> {
  let contacts = 0, chats = 0, messages = 0, callLogs = 0;

  if (payload.contacts?.length) {
    contacts = await saveContactsBulk(payload.contacts);
  }
  if (payload.chats?.length) {
    for (const c of payload.chats) {
      await saveChat(c);
      chats++;
    }
  }
  if (payload.messages?.length) {
    for (const m of payload.messages) {
      await saveMessage(m);
      messages++;
    }
  }
  if (payload.callLogs?.length) {
    for (const l of payload.callLogs) {
      await saveCallLog(l);
      callLogs++;
    }
  }
  if (payload.blocked?.length) {
    for (const b of payload.blocked) {
      await blockContact({ name: b.name, phone: b.phone });
    }
    try {
      const { syncBlockedListToNative } = await import('./sms-plugin');
      await syncBlockedListToNative(payload.blocked.map((b) => b.phone));
    } catch {}
  }
  if (payload.profile) {
    await saveUserProfile(payload.profile);
  }

  // Refresh the stores so UI updates.
  try {
    const { loadContactsFromDB } = await import('./contacts-store');
    await loadContactsFromDB();
  } catch {}
  try {
    const { loadChatsFromDB } = await import('./chats-store');
    await loadChatsFromDB();
  } catch {}
  try {
    const { loadCallLogsFromDB } = await import('./call-log-store');
    await loadCallLogsFromDB();
  } catch {}

  return { contacts, chats, messages, callLogs };
}

export async function restoreFromFile(filename: string): Promise<{ ok: boolean; error?: string; stats?: any }> {
  if (!isBackupAvailable()) return { ok: false, error: 'Not available' };
  try {
    const res = await BackupPlugin.readBackup({ filename });
    if (!res.content) return { ok: false, error: 'Empty file' };
    const payload: BackupPayload = JSON.parse(res.content);
    if (!payload || typeof payload !== 'object') return { ok: false, error: 'Invalid payload' };
    const stats = await applyPayload(payload);
    return { ok: true, stats };
  } catch (e: any) {
    console.error('[backup] restore failed', e);
    return { ok: false, error: e?.message || String(e) };
  }
}

// Check whether an auto backup exists (used on first launch after reinstall).
export async function findAutoBackup(): Promise<{ filename: string; modified: number } | null> {
  if (!isBackupAvailable()) return null;
  try {
    const res = await BackupPlugin.listAutoBackups();
    const found = (res.backups || []).find((b) => b.filename === AUTO_BACKUP_FILENAME);
    return found ? { filename: found.filename, modified: found.modified } : null;
  } catch (e) {
    console.error('[backup] findAutoBackup failed', e);
    return null;
  }
}

// Manual backups in Downloads — used by the settings "Existing backups"
// list (only manual, user-created files).
export async function findManualBackups() {
  return listBackups();
}

// Restore a private auto-backup file.
export async function restoreFromAutoBackup(): Promise<{ ok: boolean; error?: string; stats?: any }> {
  if (!isBackupAvailable()) return { ok: false, error: 'Not available' };
  try {
    const found = await findAutoBackup();
    if (!found) return { ok: false, error: 'No auto backup' };
    const res = await BackupPlugin.readAutoBackup({ filename: found.filename });
    if (!res.content) return { ok: false, error: 'Empty file' };
    const payload: BackupPayload = JSON.parse(res.content);
    const stats = await applyPayload(payload);
    return { ok: true, stats };
  } catch (e: any) {
    console.error('[backup] restore auto failed', e);
    return { ok: false, error: e?.message || String(e) };
  }
}

// Wipe local data so the user can start clean before restoring.
export async function wipeAllLocalData(): Promise<void> {
  const db = await getDB();
  if (!db) return;
  const stores = ['chats', 'messages', 'contacts', 'callLogs', 'userProfile'];
  for (const name of stores) {
    if (db.objectStoreNames.contains(name)) {
      const tx = db.transaction(name, 'readwrite');
      await tx.store.clear();
      await tx.done;
    }
  }
}
