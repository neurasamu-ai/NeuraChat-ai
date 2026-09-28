'use client';

import { getDB } from '../db';
import { ApiKeyEntry, ProviderSettings } from './types';
import { PROVIDERS } from './providers';

// Keys and provider settings are stored in the existing `userProfile` object
// store (which is a generic KV store with a `userProfile` key path).
// We only keep two records: `aiKeys` (array of ApiKeyEntry) and
// `aiProviders` (array of ProviderSettings).

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

// ---- API keys ----
export async function getApiKeys(): Promise<ApiKeyEntry[]> {
  const list = await readRecord<ApiKeyEntry[]>(KEYS_KEY);
  return Array.isArray(list) ? list : [];
}

export async function addApiKey(providerId: string, label: string, key: string): Promise<ApiKeyEntry> {
  const list = await getApiKeys();
  const entry: ApiKeyEntry = {
    id: `k-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    providerId,
    label: label || 'Key',
    key: key.trim(),
    addedAt: Date.now(),
    requestCount: 0,
  };
  list.push(entry);
  await writeRecord(KEYS_KEY, list);
  return entry;
}

export async function updateApiKey(id: string, patch: Partial<ApiKeyEntry>): Promise<void> {
  const list = await getApiKeys();
  const next = list.map((k) => (k.id === id ? { ...k, ...patch } : k));
  await writeRecord(KEYS_KEY, next);
}

export async function deleteApiKey(id: string): Promise<void> {
  const list = await getApiKeys();
  await writeRecord(KEYS_KEY, list.filter((k) => k.id !== id));
}

export async function getKeysForProvider(providerId: string): Promise<ApiKeyEntry[]> {
  const list = await getApiKeys();
  return list.filter((k) => k.providerId === providerId);
}

// ---- Provider settings ----
export async function getProviderSettings(): Promise<ProviderSettings[]> {
  const list = await readRecord<ProviderSettings[]>(PROVIDERS_KEY);
  if (Array.isArray(list) && list.length) return list;
  // First run: seed a default settings entry for each provider.
  return PROVIDERS.map((p) => ({
    providerId: p.id,
    enabled: p.id === 'openai', // only OpenAI enabled out of the box
    baseUrl: undefined,
    model: undefined,
    rotation: 'round-robin' as const,
    rrCursor: 0,
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
  if (idx >= 0) {
    all[idx] = { ...all[idx], ...patch };
  } else {
    all.push({
      providerId,
      enabled: false,
      rotation: 'round-robin',
      ...patch,
    });
  }
  await saveProviderSettings(all);
}

export async function getProviderSetting(providerId: string): Promise<ProviderSettings | undefined> {
  const all = await getProviderSettings();
  return all.find((p) => p.providerId === providerId);
}
