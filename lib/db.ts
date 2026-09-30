import { openDB, IDBPDatabase } from 'idb';

export interface Chat {
  id: string;
  name: string;
  phone: string;
  avatar?: string;
  lastMessage?: string;
  timestamp: number;
  unread: number;
  archived: boolean;
}

export interface Message {
  id: string;
  chatId: string;
  text: string;
  image?: string;
  sender: 'user' | 'contact';
  timestamp: number;
  status: 'sent' | 'received' | 'read' | 'failed';
}

export interface Contact {
  id: string;
  name: string;
  phone: string;
  email?: string;
  avatar?: string;
  favorite: boolean;
  accountType?: string;
  accountName?: string;
  rawContactId?: string;
  contactId?: string;
  sourceLabel?: string;
}

export interface CallLog {
  id: string;
  name: string;
  phone: string;
  type: 'incoming' | 'outgoing' | 'missed';
  timestamp: number;
  duration: number;
}

export interface BlockedContact {
  id: string;
  name: string;
  phone: string;
  blockedAt: number;
}

export interface UserProfile {
  name: string;
  avatar?: string;
  bio?: string;
  username?: string;
  theme?: 'dark' | 'light' | 'system';
}

const DB_NAME = 'neurachat_db';
const DB_VERSION = 5;

let dbPromise: Promise<IDBPDatabase> | null = null;

export function getDB() {
  if (typeof window === 'undefined') return null;
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion, _newVersion, tx) {
        // Fresh install: create stores + indexes
        if (!db.objectStoreNames.contains('chats')) {
          const chats = db.createObjectStore('chats', { keyPath: 'id' });
          chats.createIndex('timestamp', 'timestamp');
        }
        if (!db.objectStoreNames.contains('messages')) {
          const messages = db.createObjectStore('messages', { keyPath: 'id' });
          messages.createIndex('chatId', 'chatId');
          messages.createIndex('chatId_timestamp', ['chatId', 'timestamp']);
        }
        if (!db.objectStoreNames.contains('contacts')) {
          const contacts = db.createObjectStore('contacts', { keyPath: 'id' });
          contacts.createIndex('name', 'name');
          contacts.createIndex('phone', 'phone');
        }
        if (!db.objectStoreNames.contains('callLogs')) {
          const logs = db.createObjectStore('callLogs', { keyPath: 'id' });
          logs.createIndex('timestamp', 'timestamp');
        }
        if (!db.objectStoreNames.contains('userProfile')) {
          db.createObjectStore('userProfile');
        }
        if (!db.objectStoreNames.contains('blocked')) {
          const blocked = db.createObjectStore('blocked', { keyPath: 'id' });
          blocked.createIndex('phone', 'phone');
        }
        if (!db.objectStoreNames.contains('aiMessages')) {
          const ai = db.createObjectStore('aiMessages', { keyPath: 'id' });
          ai.createIndex('threadId', 'threadId');
        }
        if (!db.objectStoreNames.contains('aiThreads')) {
          const th = db.createObjectStore('aiThreads', { keyPath: 'id' });
          th.createIndex('providerId', 'providerId');
          th.createIndex('updatedAt', 'updatedAt');
        }

        // Migration v4 -> v5: add aiThreads store
        if (oldVersion >= 4 && oldVersion < 5) {
          if (!db.objectStoreNames.contains('aiThreads')) {
            const th = db.createObjectStore('aiThreads', { keyPath: 'id' });
            th.createIndex('providerId', 'providerId');
            th.createIndex('updatedAt', 'updatedAt');
          }
        }

        // Migration v3 -> v4: add aiMessages store
        if (oldVersion >= 3 && oldVersion < 4) {
          if (!db.objectStoreNames.contains('aiMessages')) {
            const ai = db.createObjectStore('aiMessages', { keyPath: 'id' });
            ai.createIndex('threadId', 'threadId');
          }
        }

        // Migration v2 -> v3: add blocked store
        if (oldVersion >= 2 && oldVersion < 3) {
          if (!db.objectStoreNames.contains('blocked')) {
            const blocked = db.createObjectStore('blocked', { keyPath: 'id' });
            blocked.createIndex('phone', 'phone');
          }
        }

        // Migration v1 -> v2: add indexes to existing stores (data preserved)
        if (oldVersion >= 1 && oldVersion < 2) {
          const chatsStore = tx.objectStore('chats');
          if (!chatsStore.indexNames.contains('timestamp')) {
            chatsStore.createIndex('timestamp', 'timestamp');
          }
          const messagesStore = tx.objectStore('messages');
          if (!messagesStore.indexNames.contains('chatId_timestamp')) {
            messagesStore.createIndex('chatId_timestamp', ['chatId', 'timestamp']);
          }
          const contactsStore = tx.objectStore('contacts');
          if (!contactsStore.indexNames.contains('name')) {
            contactsStore.createIndex('name', 'name');
          }
          if (!contactsStore.indexNames.contains('phone')) {
            contactsStore.createIndex('phone', 'phone');
          }
          const logsStore = tx.objectStore('callLogs');
          if (!logsStore.indexNames.contains('timestamp')) {
            logsStore.createIndex('timestamp', 'timestamp');
          }
        }
      },
      blocked() {
        console.warn('[db] upgrade blocked by another open connection');
      },
      blocking() {
        // A newer tab is trying to upgrade. Drop our connection so it can.
        console.warn('[db] closing connection for upgrade');
        dbPromise = null;
      },
      terminated() {
        console.error('[db] connection terminated unexpectedly');
        dbPromise = null;
      },
    }).catch((e) => {
      console.error('[db] open failed', e);
      dbPromise = null;
      throw e;
    });
  }
  return dbPromise;
}

// ============================================
// CHATS
// ============================================

export async function getChats(): Promise<Chat[]> {
  const db = await getDB();
  if (!db) return [];
  // Indexed ascending by timestamp; reverse for newest-first
  const rows = await db.getAllFromIndex('chats', 'timestamp');
  return rows.reverse();
}

export async function getRecentChats(limit: number = 50): Promise<Chat[]> {
  const db = await getDB();
  if (!db) return [];
  const tx = db.transaction('chats', 'readonly');
  const index = tx.store.index('timestamp');
  const result: Chat[] = [];
  let cursor = await index.openCursor(null, 'prev');
  while (cursor && result.length < limit) {
    result.push(cursor.value);
    cursor = await cursor.continue();
  }
  await tx.done;
  return result;
}

export async function saveChat(chat: Chat): Promise<void> {
  const db = await getDB();
  if (!db) return;
  await db.put('chats', chat);
}

export async function deleteChat(id: string): Promise<void> {
  const db = await getDB();
  if (!db) return;
  const tx = db.transaction(['chats', 'messages'], 'readwrite');
  await tx.objectStore('chats').delete(id);
  const msgStore = tx.objectStore('messages');
  const index = msgStore.index('chatId');
  let cursor = await index.openCursor(IDBKeyRange.only(id));
  while (cursor) {
    await cursor.delete();
    cursor = await cursor.continue();
  }
  await tx.done;
}

// ============================================
// MESSAGES
// ============================================

// Backward compatible: return all messages for a chat (oldest first).
export async function getMessages(chatId: string): Promise<Message[]> {
  const db = await getDB();
  if (!db) return [];
  return db.getAllFromIndex(
    'messages',
    'chatId_timestamp',
    IDBKeyRange.bound([chatId, -Infinity], [chatId, Infinity])
  );
}

// New: most recent N messages (oldest first in the returned array).
export async function getRecentMessages(
  chatId: string,
  limit: number = 100
): Promise<Message[]> {
  const db = await getDB();
  if (!db) return [];
  const tx = db.transaction('messages', 'readonly');
  const index = tx.store.index('chatId_timestamp');
  const range = IDBKeyRange.bound([chatId, -Infinity], [chatId, Infinity]);
  const result: Message[] = [];
  let cursor = await index.openCursor(range, 'prev');
  while (cursor && result.length < limit) {
    result.push(cursor.value);
    cursor = await cursor.continue();
  }
  await tx.done;
  return result.reverse();
}

// New: messages older than `before` timestamp (for scroll-up pagination).
export async function getMessagesBefore(
  chatId: string,
  before: number,
  limit: number = 50
): Promise<Message[]> {
  const db = await getDB();
  if (!db) return [];
  const tx = db.transaction('messages', 'readonly');
  const index = tx.store.index('chatId_timestamp');
  const range = IDBKeyRange.bound(
    [chatId, -Infinity],
    [chatId, before],
    false,
    true // exclusive upper bound
  );
  const result: Message[] = [];
  let cursor = await index.openCursor(range, 'prev');
  while (cursor && result.length < limit) {
    result.push(cursor.value);
    cursor = await cursor.continue();
  }
  await tx.done;
  return result.reverse();
}

export async function getMessagesCount(chatId: string): Promise<number> {
  const db = await getDB();
  if (!db) return 0;
  return db.countFromIndex(
    'messages',
    'chatId_timestamp',
    IDBKeyRange.bound([chatId, -Infinity], [chatId, Infinity])
  );
}

export async function saveMessage(message: Message): Promise<void> {
  const db = await getDB();
  if (!db) return;
  // Single atomic transaction — writes message + bumps chat last-message
  const tx = db.transaction(['messages', 'chats'], 'readwrite');
  await tx.objectStore('messages').put(message);
  const chats = tx.objectStore('chats');
  const chat = await chats.get(message.chatId);
  if (chat) {
    chat.lastMessage = message.text || '[Image]';
    chat.timestamp = message.timestamp;
    await chats.put(chat);
  }
  await tx.done;
}

export async function deleteMessage(id: string): Promise<void> {
  const db = await getDB();
  if (!db) return;
  await db.delete('messages', id);
}

// ============================================
// CONTACTS
// ============================================

export async function getContacts(): Promise<Contact[]> {
  const db = await getDB();
  if (!db) return [];
  // Already sorted alphabetically by name index
  return db.getAllFromIndex('contacts', 'name');
}

export async function getFavoriteContacts(): Promise<Contact[]> {
  const db = await getDB();
  if (!db) return [];
  // IndexedDB cannot index booleans; contacts are small, so filter in memory.
  const all = await db.getAllFromIndex('contacts', 'name');
  return all.filter((c) => c.favorite === true);
}

export async function getContactsCount(): Promise<number> {
  const db = await getDB();
  if (!db) return 0;
  return db.count('contacts');
}

export async function getContactByPhone(phone: string): Promise<Contact | null> {
  const db = await getDB();
  if (!db) return null;
  if (!phone) return null;
  const rows = await db.getAllFromIndex(
    'contacts',
    'phone',
    IDBKeyRange.only(phone)
  );
  return rows[0] || null;
}

export async function saveContact(contact: Contact): Promise<void> {
  const db = await getDB();
  if (!db) return;
  await db.put('contacts', contact);
}

// Bulk write: many contacts in one transaction. Dramatically faster than
// calling saveContact in a loop for large contact lists.
export async function saveContactsBulk(contacts: Contact[]): Promise<number> {
  if (!contacts || contacts.length === 0) return 0;
  const db = await getDB();
  if (!db) return 0;
  const tx = db.transaction('contacts', 'readwrite');
  const incomingIds = new Set(contacts.map((c) => c.id));
  let written = 0;

  // Full replace for device-synced entries (id prefix "cap-"). Any "cap-"
  // row not present in this sync is stale (e.g. legacy cap-<phone> ids)
  // and would otherwise show up as a duplicate.
  let cursor = await tx.store.openCursor();
  const stale: string[] = [];
  while (cursor) {
    const key = cursor.key as string;
    if (typeof key === 'string' && key.startsWith('cap-') && !incomingIds.has(key)) {
      stale.push(key);
    }
    cursor = await cursor.continue();
  }
  for (const id of stale) {
    await tx.store.delete(id);
  }

  for (const c of contacts) {
    await tx.store.put(c);
    written++;
  }
  await tx.done;
  return written;
}

export async function deleteContact(id: string): Promise<void> {
  const db = await getDB();
  if (!db) return;
  await db.delete('contacts', id);
}

// ============================================
// CALL LOGS
// ============================================

export async function getCallLogs(): Promise<CallLog[]> {
  const db = await getDB();
  if (!db) return [];
  const rows = await db.getAllFromIndex('callLogs', 'timestamp');
  return rows.reverse();
}

export async function getRecentCallLogs(limit: number = 100): Promise<CallLog[]> {
  const db = await getDB();
  if (!db) return [];
  const tx = db.transaction('callLogs', 'readonly');
  const index = tx.store.index('timestamp');
  const result: CallLog[] = [];
  let cursor = await index.openCursor(null, 'prev');
  while (cursor && result.length < limit) {
    result.push(cursor.value);
    cursor = await cursor.continue();
  }
  await tx.done;
  return result;
}

export async function saveCallLog(log: CallLog): Promise<void> {
  const db = await getDB();
  if (!db) return;
  await db.put('callLogs', log);
}

export async function deleteCallLog(id: string): Promise<void> {
  const db = await getDB();
  if (!db) return;
  await db.delete('callLogs', id);
}

// ============================================
// USER PROFILE
// ============================================

const DEFAULT_PROFILE: UserProfile = {
  name: 'Owner',
  bio: 'Living in the future',
  username: 'owner_neura',
  theme: 'system',
};

export async function getUserProfile(): Promise<UserProfile> {
  const db = await getDB();
  if (!db) return DEFAULT_PROFILE;
  const profile = await db.get('userProfile', 'main');
  return profile || DEFAULT_PROFILE;
}

export async function saveUserProfile(profile: UserProfile): Promise<void> {
  const db = await getDB();
  if (!db) return;
  await db.put('userProfile', profile, 'main');
}

// ============================================
// BLOCKED CONTACTS
// ============================================

export async function getBlockedContacts(): Promise<BlockedContact[]> {
  const db = await getDB();
  if (!db) return [];
  const all = await db.getAll('blocked');
  return all.sort((a, b) => b.blockedAt - a.blockedAt);
}

export async function isBlocked(phone: string): Promise<boolean> {
  if (!phone) return false;
  const db = await getDB();
  if (!db) return false;
  const digits = phone.replace(/\D/g, '');
  if (!digits) return false;
  const rows = await db.getAll('blocked');
  return rows.some((b) => {
    const bDigits = (b.phone || '').replace(/\D/g, '');
    if (!bDigits) return false;
    return bDigits === digits || digits.endsWith(bDigits) || bDigits.endsWith(digits);
  });
}

export async function blockContact(contact: { name: string; phone: string }): Promise<void> {
  const db = await getDB();
  if (!db) return;
  const phone = (contact.phone || '').replace(/\s+/g, '');
  if (!phone) return;
  const id = `blocked-${phone.replace(/\D/g, '')}`;
  await db.put('blocked', {
    id,
    name: contact.name || phone,
    phone,
    blockedAt: Date.now(),
  });
}

export async function unblockContact(id: string): Promise<void> {
  const db = await getDB();
  if (!db) return;
  await db.delete('blocked', id);
}
