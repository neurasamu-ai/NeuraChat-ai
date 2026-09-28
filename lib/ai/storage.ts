'use client';

import { getDB } from '../db';
import { ChatAttachment } from './types';

// AI chat storage:
//   aiThreads  -> conversation metadata (id, providerId, title, timestamps)
//   aiMessages -> messages indexed by threadId

export interface AiThread {
  id: string;
  providerId: string;
  title: string;
  createdAt: number;
  updatedAt: number;
}

export interface AiMessage {
  id: string;
  threadId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  attachments?: ChatAttachment[];
  timestamp: number;
  providerId?: string;
  model?: string;
  error?: string;
}

// ---------- Threads ----------
export async function listThreads(providerId?: string): Promise<AiThread[]> {
  const db = await getDB();
  if (!db) return [];
  try {
    const all = (await db.getAll('aiThreads')) as AiThread[];
    const filtered = providerId ? all.filter((t) => t.providerId === providerId) : all;
    return filtered.sort((a, b) => b.updatedAt - a.updatedAt);
  } catch (e) {
    console.warn('[ai-storage] listThreads failed', e);
    return [];
  }
}

export async function getThread(id: string): Promise<AiThread | null> {
  const db = await getDB();
  if (!db) return null;
  try {
    return (await db.get('aiThreads', id)) || null;
  } catch {
    return null;
  }
}

export async function upsertThread(thread: AiThread): Promise<void> {
  const db = await getDB();
  if (!db) return;
  try {
    await db.put('aiThreads', thread);
  } catch (e) {
    console.warn('[ai-storage] upsertThread failed', e);
  }
}

export async function deleteThread(id: string): Promise<void> {
  const db = await getDB();
  if (!db) return;
  try {
    // Delete messages first
    const tx = db.transaction('aiMessages', 'readwrite');
    const index = tx.store.index('threadId');
    let cursor = await index.openCursor(IDBKeyRange.only(id));
    while (cursor) {
      await cursor.delete();
      cursor = await cursor.continue();
    }
    await tx.done;
    // Then the thread
    await db.delete('aiThreads', id);
  } catch (e) {
    console.warn('[ai-storage] deleteThread failed', e);
  }
}

// ---------- Messages ----------
export async function loadAiMessages(threadId: string): Promise<AiMessage[]> {
  const db = await getDB();
  if (!db) return [];
  try {
    const rows = await db.getAllFromIndex('aiMessages', 'threadId', threadId);
    return (rows as AiMessage[]).sort((a, b) => a.timestamp - b.timestamp);
  } catch (e) {
    console.warn('[ai-storage] load failed', e);
    return [];
  }
}

export async function saveAiMessage(msg: AiMessage): Promise<void> {
  const db = await getDB();
  if (!db) return;
  try {
    await db.put('aiMessages', msg);
  } catch (e) {
    console.warn('[ai-storage] save failed', e);
  }
}

export async function deleteAiMessage(id: string): Promise<void> {
  const db = await getDB();
  if (!db) return;
  try {
    await db.delete('aiMessages', id);
  } catch {}
}

export async function clearAiMessages(threadId: string): Promise<void> {
  const db = await getDB();
  if (!db) return;
  try {
    const tx = db.transaction('aiMessages', 'readwrite');
    const index = tx.store.index('threadId');
    let cursor = await index.openCursor(IDBKeyRange.only(threadId));
    while (cursor) {
      await cursor.delete();
      cursor = await cursor.continue();
    }
    await tx.done;
  } catch (e) {
    console.warn('[ai-storage] clear failed', e);
  }
}

// Derive a short title from the first user message.
export function titleFromContent(text: string): string {
  const t = (text || '').trim().replace(/\s+/g, ' ');
  if (!t) return 'New chat';
  return t.length > 40 ? t.slice(0, 40) + '…' : t;
}
