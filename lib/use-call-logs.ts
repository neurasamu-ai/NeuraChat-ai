'use client';

import { useSyncExternalStore } from 'react';
import { subscribe, getState } from './call-log-store';

export function useCallLogs() {
  return useSyncExternalStore(subscribe, getState, getState);
}
