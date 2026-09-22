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
  status: 'sent' | 'received' | 'read';
}

export interface Contact {
  id: string;
  name: string;
  phone: string;
  email?: string;
  avatar?: string;
  favorite: boolean;
}

export interface CallLog {
  id: string;
  name: string;
  phone: string;
  type: 'incoming' | 'outgoing' | 'missed';
  timestamp: number;
  duration: number; // in seconds
}

export interface UserProfile {
  name: string;
  avatar?: string;
  bio?: string;
  username?: string;
  theme?: 'dark' | 'light' | 'system';
}

let dbPromise: Promise<IDBPDatabase> | null = null;

export function getDB() {
  if (typeof window === 'undefined') return null;
  if (!dbPromise) {
    dbPromise = openDB('neurachat_db', 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('chats')) {
          db.createObjectStore('chats', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('messages')) {
          const messageStore = db.createObjectStore('messages', { keyPath: 'id' });
          messageStore.createIndex('chatId', 'chatId');
        }
        if (!db.objectStoreNames.contains('contacts')) {
          db.createObjectStore('contacts', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('callLogs')) {
          db.createObjectStore('callLogs', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('userProfile')) {
          db.createObjectStore('userProfile');
        }
      },
    });
  }
  return dbPromise;
}

// CHATS OPERATIONS
export async function getChats(): Promise<Chat[]> {
  const db = await getDB();
  if (!db) return [];
  const chats = await db.getAll('chats');
  return chats.sort((a, b) => b.timestamp - a.timestamp);
}

export async function saveChat(chat: Chat): Promise<void> {
  const db = await getDB();
  if (!db) return;
  await db.put('chats', chat);
}

export async function deleteChat(id: string): Promise<void> {
  const db = await getDB();
  if (!db) return;
  await db.delete('chats', id);
  // Also delete associated messages
  const tx = db.transaction('messages', 'readwrite');
  const index = tx.store.index('chatId');
  let cursor = await index.openCursor(IDBKeyRange.only(id));
  while (cursor) {
    await cursor.delete();
    cursor = await cursor.continue();
  }
  await tx.done;
}

// MESSAGES OPERATIONS
export async function getMessages(chatId: string): Promise<Message[]> {
  const db = await getDB();
  if (!db) return [];
  const messages: Message[] = [];
  const tx = db.transaction('messages', 'readonly');
  const index = tx.store.index('chatId');
  let cursor = await index.openCursor(IDBKeyRange.only(chatId));
  while (cursor) {
    messages.push(cursor.value);
    cursor = await cursor.continue();
  }
  return messages.sort((a, b) => a.timestamp - b.timestamp);
}

export async function saveMessage(message: Message): Promise<void> {
  const db = await getDB();
  if (!db) return;
  await db.put('messages', message);

  // Update chat's last message and timestamp
  const chat = await db.get('chats', message.chatId);
  if (chat) {
    chat.lastMessage = message.text || '[Image]';
    chat.timestamp = message.timestamp;
    await db.put('chats', chat);
  }
}

export async function deleteMessage(id: string): Promise<void> {
  const db = await getDB();
  if (!db) return;
  await db.delete('messages', id);
}

// CONTACTS OPERATIONS
export async function getContacts(): Promise<Contact[]> {
  const db = await getDB();
  if (!db) return [];
  const contacts = await db.getAll('contacts');
  return contacts.sort((a, b) => a.name.localeCompare(b.name));
}

export async function saveContact(contact: Contact): Promise<void> {
  const db = await getDB();
  if (!db) return;
  await db.put('contacts', contact);
}

export async function deleteContact(id: string): Promise<void> {
  const db = await getDB();
  if (!db) return;
  await db.delete('contacts', id);
}

// CALL LOGS OPERATIONS
export async function getCallLogs(): Promise<CallLog[]> {
  const db = await getDB();
  if (!db) return [];
  const logs = await db.getAll('callLogs');
  return logs.sort((a, b) => b.timestamp - a.timestamp);
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

// USER PROFILE OPERATIONS
export async function getUserProfile(): Promise<UserProfile> {
  const db = await getDB();
  if (!db) return { name: 'Owner', bio: 'Living in the future', username: 'owner_neura', theme: 'system' };
  const profile = await db.get('userProfile', 'main');
  return profile || { name: 'Owner', bio: 'Living in the future', username: 'owner_neura', theme: 'system' };
}

export async function saveUserProfile(profile: UserProfile): Promise<void> {
  const db = await getDB();
  if (!db) return;
  await db.put('userProfile', profile, 'main');
}

