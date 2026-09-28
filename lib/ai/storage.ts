'use client';

import { getDB } from '../db';
import { ChatAttachment } from './types';

// AI chat history lives in a dedicated `aiMessages` store, indexed by
// threadId. Each provider gets its own thread so switching providers does
// not mix conversations.

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
