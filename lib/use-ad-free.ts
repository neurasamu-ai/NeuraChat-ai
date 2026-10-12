'use client';

import { useEffect, useState } from 'react';
import { AD_FREE_STORAGE_KEY } from './ad-config';

// Returns whether ads should be suppressed right now. Listens to a custom
// window event so any screen can react to a fresh reward without a reload.
export function isAdFreeNow(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const v = window.localStorage.getItem(AD_FREE_STORAGE_KEY);
    if (!v) return false;
    const until = parseInt(v, 10);
    return Number.isFinite(until) && until > Date.now();
  } catch {
    return false;
  }
}

// Adds the reward window on top of any time still remaining, so a user
// who watches two ads back to back gets 4h instead of being reset to 2h.
export function grantAdFree(hours: number): void {
  if (typeof window === 'undefined') return;
  try {
    const current = adFreeUntil();
    const base = current > Date.now() ? current : Date.now();
    const until = base + hours * 60 * 60 * 1000;
    window.localStorage.setItem(AD_FREE_STORAGE_KEY, String(until));
    window.dispatchEvent(new CustomEvent('neura-ad-free-changed'));
  } catch {}
}

export function clearAdFree(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(AD_FREE_STORAGE_KEY);
    window.dispatchEvent(new CustomEvent('neura-ad-free-changed'));
  } catch {}
}

export function adFreeUntil(): number {
  if (typeof window === 'undefined') return 0;
  try {
    const v = window.localStorage.getItem(AD_FREE_STORAGE_KEY);
    return v ? parseInt(v, 10) || 0 : 0;
  } catch {
    return 0;
  }
}

export function useAdFree(): boolean {
  const [free, setFree] = useState<boolean>(false);
  useEffect(() => {
    const update = () => setFree(isAdFreeNow());
    update();
    const handler = () => update();
    window.addEventListener('neura-ad-free-changed', handler);
    // Also poll every 60s so the flag clears automatically when it expires.
    const t = setInterval(update, 60_000);
    return () => {
      window.removeEventListener('neura-ad-free-changed', handler);
      clearInterval(t);
    };
  }, []);
  return free;
}
