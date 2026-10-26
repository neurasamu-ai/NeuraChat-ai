'use client';

import { Chat, getChats, saveChat, deleteChat } from './db';

// Global chats store. SMS bridge, status bridge, and user actions all
// write into here, so the Chats list and chat detail stay in sync.

type Listener = () => void;

interface ChatsState {
  chats: Chat[];
  loading: boolean;
  loadedOnce: boolean;
  error: string | null;
}

let snapshot: ChatsState = {
  chats: [],
  loading: false,
  loadedOnce: false,
  error: null,
};

const listeners = new Set<Listener>();

function emit() {
  for (const l of listeners) {
    try { l(); } catch (e) { console.error('[chats-store] listener', e); }
  }
}

function setState(patch: Partial<ChatsState>) {
  snapshot = { ...snapshot, ...patch };
  emit();
}

// ---- Batch mode ----
// While batching, upsertChat only writes to IndexedDB and queues the
// in-memory update. This avoids N renders when the SMS bridge drains
// dozens of messages on app launch.
let isBatching = false;
const batchedChats = new Map<string, Chat>();

export function beginBatch(): void {
  isBatching = true;
  batchedChats.clear();
}

export function commitBatch(): void {
  if (batchedChats.size > 0) {
    let next = [...snapshot.chats];
    for (const chat of batchedChats.values()) {
      const idx = next.findIndex((c) => c.id === chat.id);
      if (idx >= 0) next[idx] = { ...next[idx], ...chat };
      else next = [chat, ...next];
    }
    next.sort((a, b) => b.timestamp - a.timestamp);
    setState({ chats: next, loadedOnce: true });
  }
  batchedChats.clear();
  isBatching = false;
}

export function subscribe(l: Listener): () => void {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

export function getState(): ChatsState {
  return snapshot;
}

export async function loadChatsFromDB(): Promise<Chat[]> {
  if (snapshot.loading) return snapshot.chats;
  setState({ loading: true });
  try {
    const rows = await getChats();
    setState({ chats: rows, loadedOnce: true, error: null });
    return rows;
  } catch (e: any) {
    console.error('[chats-store] load failed', e);
    setState({ error: e?.message || String(e) });
    return snapshot.chats;
  } finally {
    setState({ loading: false });
  }
}

// Insert or update a chat; keeps the list sorted by timestamp desc.
export async function upsertChat(chat: Chat): Promise<void> {
  const existing = snapshot.chats.find((c) => c.id === chat.id);
  const merged = existing ? { ...existing, ...chat } : chat;

  // Persist to IndexedDB first, always.
  try {
    await saveChat(merged);
  } catch (e) {
    console.error('[chats-store] persist failed', e);
  }

  // Batch mode: queue the in-memory update, no re-render yet.
  if (isBatching) {
    const pending = batchedChats.get(chat.id);
    batchedChats.set(chat.id, pending ? { ...pending, ...chat } : chat);
    return;
  }

  // Normal mode: update in-memory snapshot + re-render.
  let next: Chat[];
  if (existing) {
    next = snapshot.chats.map((c) => (c.id === chat.id ? { ...c, ...chat } : c));
  } else {
    next = [merged, ...snapshot.chats];
  }
  next.sort((a, b) => b.timestamp - a.timestamp);
  setState({ chats: next, loadedOnce: true });
}

export async function removeChat(id: string): Promise<void> {
  setState({ chats: snapshot.chats.filter((c) => c.id !== id) });
  try {
    await deleteChat(id);
  } catch (e) {
    console.error('[chats-store] delete failed', e);
  }
}

// Update the last-message preview without touching unread counters.
export function touchChatPreview(id: string, lastMessage: string, timestamp: number): void {
  const next = snapshot.chats.map((c) =>
    c.id === id ? { ...c, lastMessage, timestamp } : c
  );
  next.sort((a, b) => b.timestamp - a.timestamp);
  setState({ chats: next });
}

// Clear unread for a chat (used when the user opens it).
export function markChatRead(id: string): void {
  const next = snapshot.chats.map((c) => (c.id === id ? { ...c, unread: 0 } : c));
  setState({ chats: next });
}

export async function persistChatRead(id: string): Promise<void> {
  const chat = snapshot.chats.find((c) => c.id === id);
  if (!chat) return;
  try {
    await saveChat({ ...chat, unread: 0 });
  } catch (e) {
    console.error('[chats-store] persist read failed', e);
  }
}
