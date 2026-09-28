'use client';

import { ApiKeyEntry, ProviderSettings } from './types';
import { getKeysForProvider, getProviderSetting, updateApiKey, updateProviderSettings } from './keystore';

// Pick the next key for a provider based on the configured rotation.
// `excludeIds` lets us skip keys that already failed during the current
// request (fallback chain) without hammering the same key repeatedly.
export async function pickKey(
  providerId: string,
  excludeIds: string[] = []
): Promise<{ key: ApiKeyEntry; settings: ProviderSettings } | { error: string }> {
  const settings = (await getProviderSetting(providerId)) || {
    providerId,
    enabled: false,
    rotation: 'round-robin' as const,
  };

  const all = await getKeysForProvider(providerId);
  const usable = all.filter((k) => !excludeIds.includes(k.id));

  if (usable.length === 0) {
    if (all.length === 0) {
      return { error: `No API key configured for ${providerId}. Add one in Settings → AI Providers.` };
    }
    return { error: `All keys for ${providerId} failed. Check them in Settings → AI Providers.` };
  }

  if (settings.rotation === 'fallback') {
    // Always try the oldest (first added) key first.
    usable.sort((a, b) => a.addedAt - b.addedAt);
    return { key: usable[0], settings };
  }

  // Round-robin: pick the next key based on the cursor.
  const cursor = (settings.rrCursor ?? 0) % all.length;
  // Find the first usable key at or after the cursor.
  let chosen: ApiKeyEntry | null = null;
  for (let offset = 0; offset < all.length; offset++) {
    const cand = all[(cursor + offset) % all.length];
    if (!excludeIds.includes(cand.id)) {
      chosen = cand;
      break;
    }
  }
  if (!chosen) chosen = usable[0];

  return { key: chosen, settings };
}

// After a key was used, advance the round-robin cursor if needed.
export async function markKeyUsed(providerId: string, keyId: string, failed: boolean, errorMsg?: string): Promise<void> {
  try {
    await updateApiKey(keyId, {
      lastUsed: Date.now(),
      lastError: failed ? (errorMsg || 'failed') : undefined,
    });
  } catch {}

  try {
    const settings = await getProviderSetting(providerId);
    if (!settings) return;
    const all = await getKeysForProvider(providerId);
    const idx = all.findIndex((k) => k.id === keyId);
    if (idx >= 0) {
      await updateProviderSettings(providerId, { rrCursor: (idx + 1) % Math.max(1, all.length) });
    }
  } catch {}
}
