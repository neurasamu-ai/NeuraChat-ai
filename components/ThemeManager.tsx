'use client';

import { useEffect } from 'react';
import { getUserProfile } from '@/lib/db';

export default function ThemeManager() {
  useEffect(() => {
    const applyTheme = (theme: 'dark' | 'light' | 'system') => {
      const root = document.documentElement;
      if (theme === 'light') {
        root.classList.add('light');
        root.classList.remove('dark');
      } else if (theme === 'dark') {
        root.classList.add('dark');
        root.classList.remove('light');
      } else {
        // System
        if (typeof window !== 'undefined') {
          const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
          if (systemPrefersDark) {
            root.classList.add('dark');
            root.classList.remove('light');
          } else {
            root.classList.add('light');
            root.classList.remove('dark');
          }
        }
      }
    };

    // Load initial theme from DB profile
    const initTheme = async () => {
      try {
        const profile = await getUserProfile();
        const selectedTheme = profile.theme || 'dark';
        applyTheme(selectedTheme);
      } catch (err) {
        console.error('Failed to load theme:', err);
      }
    };

    initTheme();

    // Listen for theme change events
    const handleThemeChange = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail && customEvent.detail.theme) {
        applyTheme(customEvent.detail.theme);
      }
    };

    window.addEventListener('neurachat-theme-change', handleThemeChange);
    return () => {
      window.removeEventListener('neurachat-theme-change', handleThemeChange);
    };
  }, []);

  return null;
}
