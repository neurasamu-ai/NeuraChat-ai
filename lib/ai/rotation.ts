'use client';

import { getKeyForProvider, markKeyError } from './keystore';
import { ProviderKey } from './types';

// With one key per provider, "rotation" is just picking the configured key.
export async function pickKey(
  providerId: string,
  requiresKey: boolean = true
): Promise<{ key: ProviderKey } | { error: string }> {
  const k = await getKeyForProvider(providerId);
  if (!k || !k.key || !k.key.trim()) {
    if (!requiresKey) {
      // Custom / local endpoints usually need no key. Return an empty key
      // so the adapter can skip the Authorization header entirely.
      return { key: { providerId, key: '', updatedAt: Date.now() } };
    }
    return { error: `No API key configured for this provider. Add one in Settings → AI Providers.` };
  }
  return { key: k };
}

// Called when a request fails so the failure is surfaced in the settings UI.
export async function markKeyUsed(providerId: string, failed: boolean, errorMsg?: string): Promise<void> {
  if (failed && errorMsg) {
    try { await markKeyError(providerId, errorMsg); } catch {}
  }
}
