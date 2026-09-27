'use client';

import { useEffect } from 'react';
import {
  addMissedCallListener,
  addAnsweredCallListener,
  addOutgoingCallListener,
  isTelecomPluginAvailable,
} from '@/lib/telecom-plugin';
import { addCallLog, hasSimilarLog, loadCallLogsFromDB } from '@/lib/call-log-store';
import { CallLog } from '@/lib/db';
import { generateId } from '@/lib/utils';

// Listens to native call events (missed / answered / outgoing) and pushes
// them into the global call-log store. Every screen that reads the store
// updates automatically.
export default function MissedCallBridge() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!isTelecomPluginAvailable()) return;

    let cancelled = false;
    const handles: Array<{ remove: () => void }> = [];

    const start = async () => {
      await new Promise((r) => setTimeout(r, 1500));
      if (cancelled) return;

      // Prime the store so hasSimilarLog works from the first event.
      try {
        await loadCallLogsFromDB();
      } catch {}

      const push = async (
        phone: string,
        name: string,
        timestamp: number,
        type: CallLog['type']
      ) => {
        const clean = (phone || '').replace(/\s+/g, '');
        if (!clean) return;
        if (hasSimilarLog(clean, type, timestamp)) return;
        const entry: CallLog = {
          id: generateId('call'),
          name: name && name.length > 0 ? name : clean,
          phone: clean,
          type,
          timestamp: timestamp || Date.now(),
          duration: 0,
        };
        await addCallLog(entry);
      };

      const missed = await addMissedCallListener((d) =>
        push(d.number, d.name, d.timestamp, 'missed')
      );
      if (missed) handles.push(missed);

      const answered = await addAnsweredCallListener((d) =>
        push(d.number, d.name, d.timestamp, 'incoming')
      );
      if (answered) handles.push(answered);

      const outgoing = await addOutgoingCallListener((d) =>
        push(d.number, d.name, d.timestamp, 'outgoing')
      );
      if (outgoing) handles.push(outgoing);

      console.log('[CallBridge] listeners attached');
    };

    start();

    return () => {
      cancelled = true;
      for (const h of handles) {
        try { h.remove(); } catch {}
      }
    };
  }, []);

  return null;
}
