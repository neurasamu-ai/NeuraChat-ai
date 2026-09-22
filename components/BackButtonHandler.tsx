'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Capacitor } from '@capacitor/core';

const ROOT_TABS = ['/chats', '/calls', '/contacts', '/settings'];

export default function BackButtonHandler() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (Capacitor.getPlatform() !== 'android') return;

    let listenerHandle: any = null;

    const setup = async () => {
      try {
        const { App } = await import('@capacitor/app');
        listenerHandle = await App.addListener('backButton', ({ canGoBack }) => {
          if (ROOT_TABS.includes(pathname)) {
            App.minimizeApp();
          } else if (canGoBack && window.history.length > 1) {
            router.back();
          } else {
            router.push('/calls');
          }
        });
      } catch (e) {
        console.error('[BackButton] setup failed', e);
      }
    };

    setup();

    return () => {
      if (listenerHandle && listenerHandle.remove) {
        listenerHandle.remove();
      }
    };
  }, [pathname, router]);

  return null;
}
