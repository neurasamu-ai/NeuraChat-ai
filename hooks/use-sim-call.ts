'use client';

import { useState, useCallback } from 'react';
import {
  dispatchCall,
  placeCall,
  setPreferredCallSimId,
  CallAccount,
} from '@/lib/telecom-plugin';

// Reusable hook for placing a call with the same SIM-picker behaviour as
// chat-detail and the Calls tab. On 0/1 SIMs it dials directly; with 2+
// SIMs (and no remembered preference) it exposes the picker state and the
// caller renders <CallSimPicker />.
export function useSimCall() {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [accounts, setAccounts] = useState<CallAccount[]>([]);
  const [pendingNumber, setPendingNumber] = useState('');
  const [remember, setRemember] = useState(false);

  const startCall = useCallback(async (number: string) => {
    if (!number) return;
    try {
      const result = await dispatchCall(number);
      if (result.action === 'pick') {
        setAccounts(result.accounts);
        setPendingNumber(number);
        setPickerOpen(true);
        return;
      }
      if (!result.success) {
        console.error('call failed', result.error);
      }
    } catch (e) {
      console.error('dispatchCall threw', e);
    }
  }, []);

  const pick = useCallback(
    async (accountId: string) => {
      if (remember) setPreferredCallSimId(accountId);
      const number = pendingNumber;
      setPickerOpen(false);
      setPendingNumber('');
      if (!number) return;
      const res = await placeCall(number, accountId);
      if (!res.success) console.error('call failed', res.error);
    },
    [remember, pendingNumber]
  );

  const cancel = useCallback(() => {
    setPickerOpen(false);
    setPendingNumber('');
  }, []);

  return {
    pickerOpen,
    accounts,
    remember,
    setRemember,
    startCall,
    pick,
    cancel,
  };
}
