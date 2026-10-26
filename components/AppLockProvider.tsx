'use client';

import React, { useEffect, useState } from 'react';
import AppLockScreen from './AppLockScreen';
import { getUserProfile, saveUserProfile, UserProfile } from '@/lib/db';

// Wraps the whole app and shows the lock screen whenever the app comes
// back into the foreground (or on cold start) if the user has enabled the
// App Lock in Settings.
export default function AppLockProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [locked, setLocked] = useState(false);
  const [initializing, setInitializing] = useState(true);

  // Load profile on mount + decide initial lock state.
  useEffect(() => {
    (async () => {
      try {
        const p = await getUserProfile();
        setProfile(p);
        if (p.appLockEnabled) {
          setLocked(true);
        }
      } catch (e) {
        console.error('AppLockProvider load failed', e);
      } finally {
        setInitializing(false);
      }
    })();
  }, []);


  const handleUnlockSuccess = (pattern: number[]) => {
    // On setup, save the pattern to the profile.
    if (profile?.appLockEnabled) {
      // If this was setup mode, we need to save the pattern.
      // We detect setup vs unlock by checking if profile.appLockPattern exists.
      if (!profile.appLockPattern && pattern.length > 0) {
        (async () => {
          try {
            const updated: UserProfile = {
              ...profile,
              appLockPattern: JSON.stringify(pattern),
            };
            await saveUserProfile(updated);
            setProfile(updated);
          } catch (e) {
            console.error('Failed to save pattern', e);
          }
        })();
      }
    }
    setLocked(false);
  };

  if (initializing) {
    // Avoid flashing the UI while we read the profile.
    return (
      <div className="fixed inset-0 bg-zinc-950 flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-[#00D4FF]/30 border-t-[#00D4FF] animate-spin" />
      </div>
    );
  }

  if (locked && profile?.appLockEnabled) {
    const savedPattern = profile.appLockPattern
      ? JSON.parse(profile.appLockPattern)
      : undefined;

    return (
      <AppLockScreen
        mode={savedPattern ? 'unlock' : 'setup'}
        savedPattern={savedPattern}
        onSuccess={handleUnlockSuccess}
        onCancel={() => {
          // If the user cancels during setup, disable app lock to avoid a lockout.
          if (!profile?.appLockPattern) {
            (async () => {
              try {
                const updated = { ...profile!, appLockEnabled: false };
                await saveUserProfile(updated);
                setProfile(updated);
                setLocked(false);
              } catch (e) {
                console.error('Failed to disable lock', e);
              }
            })();
          }
        }}
      />
    );
  }

  return <>{children}</>;
}
