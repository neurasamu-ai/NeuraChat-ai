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
