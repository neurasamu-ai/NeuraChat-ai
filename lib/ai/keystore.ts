'use client';

import { getDB } from '../db';
import { ProviderKey, ProviderSettings } from './types';
import { PROVIDERS } from './providers';

// Persisted in the existing userProfile KV store:
//   aiKeys      -> ProviderKey[]   (one entry per provider)
//   aiProviders -> ProviderSettings[]

const KEYS_KEY = 'aiKeys';
const PROVIDERS_KEY = 'aiProviders';

async function readRecord<T>(key: string): Promise<T | null> {
  const db = await getDB();
  if (!db) return null;
  try {
    const v = await db.get('userProfile', key);
    return (v as T) || null;
  } catch (e) {
    console.error('[keystore] read failed', key, e);
    return null;
  }
}

async function writeRecord<T>(key: string, value: T): Promise<void> {
  const db = await getDB();
  if (!db) return;
  try {
    await db.put('userProfile', value, key);
  } catch (e) {
    console.error('[keystore] write failed', key, e);
  }
}

// ---- API keys (one per provider) ----
export async function getKeys(): Promise<ProviderKey[]> {
  const list = await readRecord<ProviderKey[]>(KEYS_KEY);
  return Array.isArray(list) ? list : [];
}

export async function getKeyForProvider(providerId: string): Promise<ProviderKey | undefined> {
  const list = await getKeys();
  return list.find((k) => k.providerId === providerId);
}

export async function setKeyForProvider(providerId: string, key: string): Promise<void> {
  const list = await getKeys();
  const next = list.filter((k) => k.providerId !== providerId);
  next.push({ providerId, key: key.trim(), updatedAt: Date.now() });
  await writeRecord(KEYS_KEY, next);
}

export async function clearKeyForProvider(providerId: string): Promise<void> {
  const list = await getKeys();
  await writeRecord(KEYS_KEY, list.filter((k) => k.providerId !== providerId));
}

export async function markKeyError(providerId: string, errorMsg: string): Promise<void> {
  const list = await getKeys();
  const next = list.map((k) =>
    k.providerId === providerId ? { ...k, lastError: errorMsg, updatedAt: Date.now() } : k
  );
  await writeRecord(KEYS_KEY, next);
}

// ---- Provider settings ----
export async function getProviderSettings(): Promise<ProviderSettings[]> {
  const list = await readRecord<ProviderSettings[]>(PROVIDERS_KEY);
  if (Array.isArray(list) && list.length) {
    // Ensure every provider has an entry (new providers added later).
    const map = new Map(list.map((s) => [s.providerId, s]));
    for (const p of PROVIDERS) {
      if (!map.has(p.id)) {
        map.set(p.id, { providerId: p.id, enabled: false });
      }
    }
    return Array.from(map.values());
  }
  return PROVIDERS.map((p) => ({
    providerId: p.id,
    enabled: false,
  }));
}

export async function saveProviderSettings(settings: ProviderSettings[]): Promise<void> {
  await writeRecord(PROVIDERS_KEY, settings);
}

export async function updateProviderSettings(
  providerId: string,
  patch: Partial<ProviderSettings>
): Promise<void> {
  const all = await getProviderSettings();
  const idx = all.findIndex((p) => p.providerId === providerId);
  if (idx >= 0) all[idx] = { ...all[idx], ...patch };
  else all.push({ providerId, enabled: false, ...patch });
  await saveProviderSettings(all);
}

export async function getProviderSetting(providerId: string): Promise<ProviderSettings | undefined> {
  const all = await getProviderSettings();
  return all.find((p) => p.providerId === providerId);
}
