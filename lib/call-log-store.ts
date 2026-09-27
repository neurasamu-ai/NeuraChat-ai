'use client';

import { CallLog, getCallLogs, saveCallLog, deleteCallLog } from './db';

// Global call log store. Both the native bridges (missed / answered /
// outgoing events) and the JS dialer feed into this store, so the Calls
// page sees every entry without polling.

type Listener = () => void;

interface CallLogState {
  logs: CallLog[];
  loading: boolean;
  loadedOnce: boolean;
  error: string | null;
}

let snapshot: CallLogState = {
  logs: [],
  loading: false,
  loadedOnce: false,
  error: null,
};

const listeners = new Set<Listener>();

function emit() {
  for (const l of listeners) {
    try { l(); } catch (e) { console.error('[call-log-store] listener', e); }
  }
}

function setState(patch: Partial<CallLogState>) {
  snapshot = { ...snapshot, ...patch };
  emit();
}

export function subscribe(l: Listener): () => void {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

export function getState(): CallLogState {
  return snapshot;
}

export async function loadCallLogsFromDB(): Promise<CallLog[]> {
  if (snapshot.loading) return snapshot.logs;
  setState({ loading: true });
  try {
    const rows = await getCallLogs();
    setState({ logs: rows, loadedOnce: true, error: null });
    return rows;
  } catch (e: any) {
    console.error('[call-log-store] load failed', e);
    setState({ error: e?.message || String(e) });
    return snapshot.logs;
  } finally {
    setState({ loading: false });
  }
}

// Insert a new log at the top of the in-memory list and persist it.
// Callers are responsible for their own de-dupe if needed.
export async function addCallLog(log: CallLog): Promise<void> {
  // Optimistic in-memory insert
  const next = [log, ...snapshot.logs];
  setState({ logs: next, loadedOnce: true });
  try {
    await saveCallLog(log);
  } catch (e) {
    console.error('[call-log-store] persist failed', e);
  }
}

// De-dupe helper: returns true if a similar log already exists.
export function hasSimilarLog(
  phone: string,
  type: CallLog['type'],
  timestamp: number,
  windowMs: number = 10000
): boolean {
  const target = (phone || '').replace(/\s+/g, '');
  return snapshot.logs.some((l) => {
    if (l.type !== type) return false;
    const p = (l.phone || '').replace(/\s+/g, '');
    if (p !== target) return false;
    return Math.abs((l.timestamp || 0) - timestamp) < windowMs;
  });
}

export async function removeCallLog(id: string): Promise<void> {
  setState({ logs: snapshot.logs.filter((l) => l.id !== id) });
  try {
    await deleteCallLog(id);
  } catch (e) {
    console.error('[call-log-store] delete failed', e);
  }
}
