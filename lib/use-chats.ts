'use client';

import { useSyncExternalStore } from 'react';
import { subscribe, getState } from './chats-store';

export function useChats() {
  return useSyncExternalStore(subscribe, getState, getState);
}
