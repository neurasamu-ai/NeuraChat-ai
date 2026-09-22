'use client';

import { useEffect } from 'react';
import { pushBackHandler } from './back-stack';

// Register a back handler while `active` is true. The handler must return
// true if it consumed the back event (i.e. closed the modal).
export function useBackHandler(active: boolean, onBack: () => void) {
  useEffect(() => {
    if (!active) return;
    const remove = pushBackHandler(() => {
      onBack();
      return true;
    });
    return remove;
  }, [active, onBack]);
}
