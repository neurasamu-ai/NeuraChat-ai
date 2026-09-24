'use client';

import { registerPlugin, Capacitor } from '@capacitor/core';

export interface CallState {
  state: string;
  number: string;
  name: string;
  incoming: boolean;
  muted: boolean;
  speakerOn: boolean;
  held: boolean;
  startedAt: number;
  hasCall?: boolean;
}

export interface CallAccount {
  id: string;
  accountId: string;
  componentName: string;
  label: string;
  isEnabled?: boolean;
}

export interface TelecomPluginType {
  call(options: { number: string; accountId?: string }): Promise<{ success: boolean; method?: string; note?: string }>;
  getCallAccounts(): Promise<{ accounts: CallAccount[] }>;
  getCurrentCall(): Promise<CallState>;
  addListener(
    eventName: 'callStateChanged',
    listener: (data: CallState) => void
  ): Promise<{ remove: () => void }>;
  requestDefaultDialer(): Promise<{ isDefault: boolean }>;
  checkDefaultDialer(): Promise<{ isDefault: boolean }>;
  acceptCall(): Promise<void>;
  endCall(): Promise<void>;
  toggleSpeaker(options: { enable: boolean }): Promise<{ speakerOn: boolean }>;
  toggleMute(options: { enable: boolean }): Promise<{ muted: boolean }>;
  toggleHold(options: { enable: boolean }): Promise<void>;
}

const TelecomPlugin = registerPlugin<TelecomPluginType>('TelecomPlugin');

export function isTelecomPluginAvailable(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (Capacitor.getPlatform() !== 'android') return false;
    try {
      if (
        typeof Capacitor.isPluginAvailable === 'function' &&
        Capacitor.isPluginAvailable('TelecomPlugin')
      ) {
        return true;
      }
    } catch {}
    try {
      if (
        typeof Capacitor.isNativePlatform === 'function' &&
        Capacitor.isNativePlatform()
      ) {
        return true;
      }
    } catch {}
    return false;
  } catch {
    return false;
  }
}

export async function placeCall(
  number: string,
  accountId?: string
): Promise<{ success: boolean; error?: string }> {
  if (!number || !number.trim()) {
    return { success: false, error: 'Number is required' };
  }

  if (!isTelecomPluginAvailable()) {
    try {
      window.location.href = `tel:${number}`;
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e?.message || String(e) };
    }
  }

  try {
    await TelecomPlugin.call({ number, accountId });
    return { success: true };
  } catch (e: any) {
    console.error('[Telecom] call failed', e);
    try {
      window.location.href = `tel:${number}`;
      return { success: true };
    } catch (e2: any) {
      return { success: false, error: e?.message || String(e) };
    }
  }
}

export async function getCallAccounts(): Promise<CallAccount[]> {
  if (!isTelecomPluginAvailable()) return [];
  try {
    const r = await TelecomPlugin.getCallAccounts();
    return r.accounts || [];
  } catch (e) {
    console.error('[Telecom] getCallAccounts failed', e);
    return [];
  }
}

// Remembered SIM preference for calls (separate from SMS preference).
const PREFERRED_CALL_SIM_KEY = 'preferred_call_sim_id';

export function getPreferredCallSimId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(PREFERRED_CALL_SIM_KEY);
  } catch {
    return null;
  }
}

export function setPreferredCallSimId(id: string | null) {
  if (typeof window === 'undefined') return;
  try {
    if (id === null) localStorage.removeItem(PREFERRED_CALL_SIM_KEY);
    else localStorage.setItem(PREFERRED_CALL_SIM_KEY, id);
  } catch {}
}

export async function requestDefaultDialer(): Promise<boolean> {
  if (!isTelecomPluginAvailable()) return false;
  try {
    const r = await TelecomPlugin.requestDefaultDialer();
    return !!r.isDefault;
  } catch (e) {
    console.error('[Telecom] requestDefaultDialer failed', e);
    return false;
  }
}

export async function isDefaultDialer(): Promise<boolean> {
  if (!isTelecomPluginAvailable()) return true;
  try {
    const r = await TelecomPlugin.checkDefaultDialer();
    return !!r.isDefault;
  } catch {
    return true;
  }
}


// Smart call dispatcher: handles the SIM picker logic in one place.
// Returns "dialed" if the call was placed directly, or "pick" if the caller
// should show the SIM picker with `accounts` and call `placeCall` itself.
export async function dispatchCall(
  number: string
): Promise<
  | { action: 'dialed'; success: boolean; error?: string }
  | { action: 'pick'; accounts: CallAccount[] }
> {
  if (!number || !number.trim()) {
    return { action: 'dialed', success: false, error: 'Number is required' };
  }

  const accounts = await getCallAccounts();

  // 0 or 1 SIM: dial directly
  if (accounts.length <= 1) {
    const res = await placeCall(number, accounts[0]?.id);
    return { action: 'dialed', success: res.success, error: res.error };
  }

  // 2+ SIMs: check preference
  const remembered = getPreferredCallSimId();
  if (remembered && accounts.some((a) => a.id === remembered)) {
    const res = await placeCall(number, remembered);
    return { action: 'dialed', success: res.success, error: res.error };
  }

  return { action: 'pick', accounts };
}


export async function getCurrentCall(): Promise<CallState> {
  if (!isTelecomPluginAvailable()) {
    return {
      state: 'IDLE', number: '', name: '', incoming: false,
      muted: false, speakerOn: false, held: false, startedAt: 0, hasCall: false,
    };
  }
  try {
    return await TelecomPlugin.getCurrentCall();
  } catch (e) {
    console.error('[Telecom] getCurrentCall failed', e);
    return {
      state: 'IDLE', number: '', name: '', incoming: false,
      muted: false, speakerOn: false, held: false, startedAt: 0, hasCall: false,
    };
  }
}

export async function addCallStateListener(
  cb: (data: CallState) => void
): Promise<{ remove: () => void } | null> {
  if (!isTelecomPluginAvailable()) return null;
  try {
    return await TelecomPlugin.addListener('callStateChanged', cb);
  } catch (e) {
    console.error('[Telecom] addListener failed', e);
    return null;
  }
}

export async function endCall(): Promise<void> {
  if (!isTelecomPluginAvailable()) return;
  try { await TelecomPlugin.endCall(); } catch (e) { console.error(e); }
}

export async function acceptCall(): Promise<void> {
  if (!isTelecomPluginAvailable()) return;
  try { await TelecomPlugin.acceptCall(); } catch (e) { console.error(e); }
}

export async function toggleSpeaker(enable: boolean): Promise<void> {
  if (!isTelecomPluginAvailable()) return;
  try { await TelecomPlugin.toggleSpeaker({ enable }); } catch (e) { console.error(e); }
}

export async function toggleMute(enable: boolean): Promise<void> {
  if (!isTelecomPluginAvailable()) return;
  try { await TelecomPlugin.toggleMute({ enable }); } catch (e) { console.error(e); }
}

export async function toggleHold(enable: boolean): Promise<void> {
  if (!isTelecomPluginAvailable()) return;
  try { await TelecomPlugin.toggleHold({ enable }); } catch (e) { console.error(e); }
}
