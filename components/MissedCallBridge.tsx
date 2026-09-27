'use client';

import { useEffect } from 'react';
import { addMissedCallListener, addAnsweredCallListener, addOutgoingCallListener, isTelecomPluginAvailable } from '@/lib/telecom-plugin';
import { getCallLogs, saveCallLog, CallLog } from '@/lib/db';
import { generateId } from '@/lib/utils';

// Persists missed-call events from the native CallService into the app's
// IndexedDB so the Calls tab shows them (system CallLog is separate).
export default function MissedCallBridge() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!isTelecomPluginAvailable()) return;

    let handle: { remove: () => void } | null = null;
    let handleAnswered: { remove: () => void } | null = null;
    let handleOutgoing: { remove: () => void } | null = null;
    let cancelled = false;

    const start = async () => {
      // Give the bridge a moment to be ready.
      await new Promise((r) => setTimeout(r, 1500));
      if (cancelled) return;

      handle = await addMissedCallListener(async (data) => {
        try {
          const phone = (data.number || '').replace(/\s+/g, '');
          if (!phone) return;

          // De-dupe: skip if the same number + timestamp was saved in the
          // last 10 seconds (protects against duplicate event dispatch).
          const logs = await getCallLogs();
          const dup = logs.some(
            (l) =>
              l.phone === phone &&
              l.type === 'missed' &&
              Math.abs((l.timestamp || 0) - data.timestamp) < 10000
          );
          if (dup) {
            console.log('[MissedCall] duplicate skipped');
            return;
          }

          const entry: CallLog = {
            id: generateId('call'),
            name: data.name && data.name.length > 0 ? data.name : phone,
            phone,
            type: 'missed',
            timestamp: data.timestamp || Date.now(),
            duration: 0,
          };
          await saveCallLog(entry);
          console.log('[MissedCall] saved', phone);

          // Notify any open Calls page to refresh.
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('neura-call-updated'));
          }
        } catch (e) {
          console.error('[MissedCall] save failed', e);
        }
      });

      console.log('[MissedCall] listener attached');

      // Also subscribe to answered incoming calls so "Received" tab has data.
      handleAnswered = await addAnsweredCallListener(async (data) => {
        try {
          const phone = (data.number || '').replace(/\s+/g, '');
          if (!phone) return;

          const logs = await getCallLogs();
          const dup = logs.some(
            (l) =>
              l.phone === phone &&
              l.type === 'incoming' &&
              Math.abs((l.timestamp || 0) - data.timestamp) < 10000
          );
          if (dup) return;

          const entry: CallLog = {
            id: generateId('call'),
            name: data.name && data.name.length > 0 ? data.name : phone,
            phone,
            type: 'incoming',
            timestamp: data.timestamp || Date.now(),
            duration: 0,
          };
          await saveCallLog(entry);
          console.log('[AnsweredCall] saved', phone);
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('neura-call-updated'));
          }
        } catch (e) {
          console.error('[AnsweredCall] save failed', e);
        }
      });

      console.log('[AnsweredCall] listener attached');

      // Outgoing calls placed from Contacts / Chat / Profile (anywhere that
      // does not go through the Calls dialer) are also logged here.
      handleOutgoing = await addOutgoingCallListener(async (data) => {
        try {
          const phone = (data.number || '').replace(/\s+/g, '');
          if (!phone) return;

          const logs = await getCallLogs();
          const dup = logs.some(
            (l) =>
              l.phone === phone &&
              l.type === 'outgoing' &&
              Math.abs((l.timestamp || 0) - data.timestamp) < 10000
          );
          if (dup) return;

          const entry: CallLog = {
            id: generateId('call'),
            name: data.name && data.name.length > 0 ? data.name : phone,
            phone,
            type: 'outgoing',
            timestamp: data.timestamp || Date.now(),
            duration: 0,
          };
          await saveCallLog(entry);
          console.log('[OutgoingCall] saved', phone);
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('neura-call-updated'));
          }
        } catch (e) {
          console.error('[OutgoingCall] save failed', e);
        }
      });
      console.log('[OutgoingCall] listener attached');
    };

    start();

    return () => {
      cancelled = true;
      if (handle && handle.remove) {
        try { handle.remove(); } catch {}
      }
      if (handleAnswered && handleAnswered.remove) {
        try { handleAnswered.remove(); } catch {}
      }
      if (handleOutgoing && handleOutgoing.remove) {
        try { handleOutgoing.remove(); } catch {}
      }
    };
  }, []);

  return null;
}
