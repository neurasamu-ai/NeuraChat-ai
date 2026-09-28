'use client';

import { getKeyForProvider, markKeyError } from './keystore';
import { ProviderKey } from './types';

// With one key per provider, "rotation" is just picking the configured key.
export async function pickKey(providerId: string): Promise<{ key: ProviderKey } | { error: string }> {
  const k = await getKeyForProvider(providerId);
  if (!k) {
    return { error: `No API key configured for this provider. Add one in Settings → AI Providers.` };
  }
  if (!k.key || !k.key.trim()) {
    return { error: `API key is empty. Re-add it in Settings → AI Providers.` };
  }
  return { key: k };
}

// Called when a request fails so the failure is surfaced in the settings UI.
export async function markKeyUsed(providerId: string, failed: boolean, errorMsg?: string): Promise<void> {
  if (failed && errorMsg) {
    try { await markKeyError(providerId, errorMsg); } catch {}
  }
}
