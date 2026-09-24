'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getPendingNavigation } from '@/lib/sms-plugin';

// Reads the pending navigation requested by a notification tap
// (open chat with X, or open call log) and routes the webview accordingly.
export default function NotificationNavigator() {
  const router = useRouter();

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let cancelled = false;

    const check = async () => {
      try {
        const nav = await getPendingNavigation();
        if (cancelled) return;
        if (nav.type === 'open_chat' && nav.phone) {
          const q = new URLSearchParams({
            phone: nav.phone,
            name: nav.name || nav.phone,
            avatar: '',
          });
          router.push(`/chat-detail?${q.toString()}`);
        } else if (nav.type === 'open_call_log') {
          router.push('/calls');
        }
      } catch (e) {
        console.error('[NotificationNavigator] failed', e);
      }
    };

    // Give the bridge time to be ready, then poll briefly.
    const t = setTimeout(check, 600);
    const interval = setInterval(check, 2500);

    return () => {
      cancelled = true;
      clearTimeout(t);
      clearInterval(interval);
    };
  }, [router]);

  return null;
}
