'use client';

import { useEffect, useRef } from 'react';
import {
  checkAllPermissions,
  requestAllPermissions,
  isSettingsPluginAvailable,
} from '@/lib/settings-plugin';

export default function PermissionBootstrap() {
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    if (typeof window === 'undefined') return;
    if (!isSettingsPluginAvailable()) {
      console.log('[PermBootstrap] SettingsPlugin not available');
      return;
    }

    let cancelled = false;

    const run = async (attempt = 0) => {
      if (cancelled) return;
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, 1500));
      }
      if (cancelled) return;

      try {
        const perms = await checkAllPermissions();
        console.log('[PermBootstrap] current:', perms);

        const anyMissing = Object.values(perms).some((v) => v === false);
        if (!anyMissing) {
          console.log('[PermBootstrap] all granted');
          return;
        }

        console.log('[PermBootstrap] requesting missing permissions...');
        await requestAllPermissions();
        console.log('[PermBootstrap] request done');
      } catch (e) {
        console.error('[PermBootstrap] error', e);
        if (attempt < 2 && !cancelled) {
          run(attempt + 1);
        }
      }
    };

    // First attempt after bridge is likely ready
    const t = setTimeout(() => run(0), 1500);

    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, []);

  return null;
}
