'use client';

import { Contact, getContacts } from './db';

// Module-level contacts store shared across every screen. Pages subscribe
// with useContacts() so unmount/mount of a tab never resets the list and
// sync work runs once per app session, not once per mount.

type Listener = () => void;

interface ContactsState {
  contacts: Contact[];
  loading: boolean;
  syncing: boolean;
  loadedOnce: boolean;
  error: string | null;
}

const state: ContactsState = {
  contacts: [],
  loading: false,
  syncing: false,
  loadedOnce: false,
  error: null,
};

const listeners = new Set<Listener>();

function emit() {
  for (const l of listeners) {
    try { l(); } catch (e) { console.error('[contacts-store] listener', e); }
  }
}

export function subscribe(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function getState(): ContactsState {
  return state;
}

// Direct cache read (SSR safe).
export function getCachedContacts(): Contact[] {
  return state.contacts;
}

// Full refresh: reads IndexedDB into the store. Also serves as the initial
// load for a cold start.
export async function loadContactsFromDB(): Promise<Contact[]> {
  if (state.loading) return state.contacts;
  state.loading = true;
  emit();
  try {
    const rows = await getContacts();
    state.contacts = rows;
    state.loadedOnce = true;
    state.error = null;
    return rows;
  } catch (e: any) {
    console.error('[contacts-store] load failed', e);
    state.error = e?.message || String(e);
    return state.contacts;
  } finally {
    state.loading = false;
    emit();
  }
}

// Called by sync code when new contacts arrive (bulk). No DB read.
export function setContacts(rows: Contact[]): void {
  state.contacts = rows;
  state.loadedOnce = true;
  emit();
}

export function setSyncing(v: boolean): void {
  state.syncing = v;
  emit();
}

export function isSyncing(): boolean {
  return state.syncing;
}

export function hasLoadedOnce(): boolean {
  return state.loadedOnce;
}


// ---- Auto-sync with throttle ----
//
// Runs a native sync at most once every SYNC_INTERVAL_MS. Called on app
// start and on foreground so contacts stay fresh without hammering the
// device on every mount.

const SYNC_INTERVAL_MS = 10 * 60 * 1000; // 10 min
const LAST_SYNC_KEY = 'contacts_last_sync_ts';

let syncPromise: Promise<void> | null = null;

function getLastSyncTs(): number {
  if (typeof window === 'undefined') return 0;
  try {
    const v = localStorage.getItem(LAST_SYNC_KEY);
    return v ? parseInt(v, 10) || 0 : 0;
  } catch {
    return 0;
  }
}

function setLastSyncTs(ts: number): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LAST_SYNC_KEY, String(ts));
  } catch {}
}

// Ensure the cache is shown immediately, then kick a native sync in the
// background if it is due. Returns as soon as the cache read completes.
export async function bootstrapContacts(): Promise<void> {
  // 1. Show cached data instantly.
  await loadContactsFromDB();

  // 2. Kick a background sync if due.
  const now = Date.now();
  const last = getLastSyncTs();
  if (now - last < SYNC_INTERVAL_MS) return;

  // De-dupe parallel calls.
  if (syncPromise) return syncPromise;

  syncPromise = (async () => {
    try {
      const { syncDeviceContacts } = await import('./capacitor');
      setSyncing(true);
      await syncDeviceContacts();
      setLastSyncTs(Date.now());
    } catch (e) {
      console.error('[contacts-store] background sync failed', e);
    } finally {
      setSyncing(false);
      syncPromise = null;
    }
  })();

  return syncPromise;
}

// Force a sync regardless of the throttle (manual refresh button).
export async function forceSyncContacts(): Promise<void> {
  if (syncPromise) return syncPromise;
  syncPromise = (async () => {
    try {
      const { syncDeviceContacts } = await import('./capacitor');
      setSyncing(true);
      await syncDeviceContacts();
      setLastSyncTs(Date.now());
    } catch (e) {
      console.error('[contacts-store] forced sync failed', e);
    } finally {
      setSyncing(false);
      syncPromise = null;
    }
  })();
  return syncPromise;
}
