'use client';

import { useSyncExternalStore } from 'react';
import { getCallThemeId, subscribeCallTheme, getCallTheme, CallTheme } from './call-themes';

// External store wrapper so every subscriber sees the same current id.
let currentId = 'neon';
if (typeof window !== 'undefined') {
  currentId = getCallThemeId();
}

const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) {
    try { l(); } catch {}
  }
}

// Subscribe to theme change events the first time anyone calls this hook.
if (typeof window !== 'undefined') {
  subscribeCallTheme((id) => {
    if (id === currentId) return;
    currentId = id;
    emit();
  });
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function getSnapshot() {
  return currentId;
}

export function useCallTheme(): CallTheme {
  const id = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return getCallTheme(id);
}
