'use client';

import { useSyncExternalStore } from 'react';
import { subscribe, getState } from './contacts-store';

// Subscribe to the global contacts store. Using useSyncExternalStore keeps
// the list stable across tab switches and avoids re-fetch storms.
export function useContacts() {
  return useSyncExternalStore(
    subscribe,
    getState,
    getState // server snapshot
  );
}
