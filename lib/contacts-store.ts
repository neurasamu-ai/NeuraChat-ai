'use client';

import { Contact, getContacts } from './db';

// Module-level contacts store shared across every screen.
// Every mutation creates a NEW snapshot object so React's
// useSyncExternalStore can detect changes by reference. Mutating a single
// shared object would make every subscriber think nothing changed.

type Listener = () => void;

interface ContactsState {
  contacts: Contact[];
  loading: boolean;
  syncing: boolean;
  loadedOnce: boolean;
  error: string | null;
}

let snapshot: ContactsState = {
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

function setState(patch: Partial<ContactsState>) {
  snapshot = { ...snapshot, ...patch };
  emit();
}

export function subscribe(l: Listener): () => void {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

export function getState(): ContactsState {
  return snapshot;
}

export function getCachedContacts(): Contact[] {
  return snapshot.contacts;
}

export async function loadContactsFromDB(): Promise<Contact[]> {
  if (snapshot.loading) return snapshot.contacts;
  setState({ loading: true });
  try {
    const rows = await getContacts();
    setState({ contacts: rows, loadedOnce: true, error: null });
    return rows;
  } catch (e: any) {
    console.error('[contacts-store] load failed', e);
    setState({ error: e?.message || String(e) });
    return snapshot.contacts;
  } finally {
    setState({ loading: false });
  }
}

export function setContacts(rows: Contact[]): void {
  setState({ contacts: rows, loadedOnce: true });
}

export function setSyncing(v: boolean): void {
  setState({ syncing: v });
}

export function isSyncing(): boolean {
  return snapshot.syncing;
}

export function hasLoadedOnce(): boolean {
  return snapshot.loadedOnce;
}

// ---- Auto-sync with throttle ----
const SYNC_INTERVAL_MS = 10 * 60 * 1000;
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

export async function bootstrapContacts(): Promise<void> {
  await loadContactsFromDB();

  const now = Date.now();
  const last = getLastSyncTs();
  const cacheEmpty = snapshot.contacts.length === 0;

  // If the cache is empty, always sync — the throttle is only useful when we
  // already have data. Otherwise a fresh install (or a bad sync that
  // returned nothing) would leave the contacts list stuck empty until the
  // 10-minute window elapses.
  if (!cacheEmpty && now - last < SYNC_INTERVAL_MS) return;
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
