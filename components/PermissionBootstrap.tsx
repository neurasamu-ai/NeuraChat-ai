'use client';

import { useEffect, useRef } from 'react';
import { requestAllPermissions, isSettingsPluginAvailable } from '@/lib/settings-plugin';

const ASKED_KEY = 'permission_bootstrap_done_v1';

export default function PermissionBootstrap() {
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;

    if (typeof window === 'undefined') return;
    if (!isSettingsPluginAvailable()) return;

    // Ask only once (first launch). User can still grant later via system settings.
    if (localStorage.getItem(ASKED_KEY) === '1') return;

    const timer = setTimeout(async () => {
      try {
        await requestAllPermissions();
        localStorage.setItem(ASKED_KEY, '1');
      } catch (e) {
        console.error('permission bootstrap failed', e);
      }
    }, 800); // small delay so UI is ready

    return () => clearTimeout(timer);
  }, []);

  return null;
}
