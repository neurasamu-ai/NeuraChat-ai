'use client';

import { registerPlugin, Capacitor } from '@capacitor/core';

export interface CallSnapshot {
  id: string;
  number: string;
  name: string;
  state: string;
  incoming: boolean;
  active: boolean;
}

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
  call(options: { number: string; accountId?: string; nameHint?: string }): Promise<{ success: boolean; method?: string; note?: string }>;
  getCallAccounts(): Promise<{ accounts: CallAccount[] }>;
  getCurrentCall(): Promise<CallState>;
  addListener(
    eventName: 'callStateChanged',
    listener: (data: CallState) => void
  ): Promise<{ remove: () => void }>;
  addListener(
    eventName: 'missedCall',
    listener: (data: { number: string; name: string; timestamp: number }) => void
  ): Promise<{ remove: () => void }>;
  addListener(
    eventName: 'answeredCall',
    listener: (data: { number: string; name: string; timestamp: number }) => void
  ): Promise<{ remove: () => void }>;
  addListener(
    eventName: 'outgoingCall',
    listener: (data: { number: string; name: string; timestamp: number }) => void
  ): Promise<{ remove: () => void }>;
  drainCallLog(): Promise<{ entries: string }>;
  requestDefaultDialer(): Promise<{ isDefault: boolean }>;
  checkDefaultDialer(): Promise<{ isDefault: boolean }>;
  acceptCall(): Promise<void>;
  endCall(): Promise<void>;
  toggleSpeaker(options: { enable: boolean }): Promise<{ speakerOn: boolean }>;
  toggleMute(options: { enable: boolean }): Promise<{ muted: boolean }>;
  toggleHold(options: { enable: boolean }): Promise<void>;
  snoozeCall(options: { number: string; minutes: number }): Promise<{ ok: boolean }>;
  playDtmf(options: { tone: string }): Promise<{ ok: boolean }>;
  stopDtmf(): Promise<void>;
  startRecording(): Promise<{ ok: boolean; path?: string }>;
  stopRecording(): Promise<{ ok: boolean; path?: string; note?: string }>;
  isRecording(): Promise<{ recording: boolean; lastPath?: string }>;
  answerCallById(options: { id: string }): Promise<void>;
  endCallById(options: { id: string }): Promise<void>;
  holdCallById(options: { id: string }): Promise<void>;
  unholdCallById(options: { id: string }): Promise<void>;
  swapToCall(options: { id: string }): Promise<void>;
  addListener(
    eventName: 'callsChanged',
    listener: (data: { calls: CallSnapshot[] }) => void
  ): Promise<{ remove: () => void }>;
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
  accountId?: string,
  nameHint?: string
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
    await TelecomPlugin.call({ number, accountId, nameHint });
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
  number: string,
  nameHint?: string
): Promise<
  | { action: 'dialed'; success: boolean; error?: string }
  | { action: 'pick'; accounts: CallAccount[]; number: string; nameHint?: string }
> {
  if (!number || !number.trim()) {
    return { action: 'dialed', success: false, error: 'Number is required' };
  }

  const accounts = await getCallAccounts();

  // 0 or 1 SIM: dial directly
  if (accounts.length <= 1) {
    const res = await placeCall(number, accounts[0]?.id, nameHint);
    return { action: 'dialed', success: res.success, error: res.error };
  }

  // 2+ SIMs: check preference
  const remembered = getPreferredCallSimId();
  if (remembered && accounts.some((a) => a.id === remembered)) {
    const res = await placeCall(number, remembered, nameHint);
    return { action: 'dialed', success: res.success, error: res.error };
  }

  return { action: 'pick', accounts, number, nameHint };
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


export async function playDtmf(tone: string): Promise<void> {
  if (!isTelecomPluginAvailable()) return;
  try { await TelecomPlugin.playDtmf({ tone }); } catch (e) { console.error('[Telecom] playDtmf', e); }
}

export async function stopDtmf(): Promise<void> {
  if (!isTelecomPluginAvailable()) return;
  try { await TelecomPlugin.stopDtmf(); } catch (e) { console.error('[Telecom] stopDtmf', e); }
}

export async function startCallRecording(): Promise<{ ok: boolean; path?: string; error?: string }> {
  if (!isTelecomPluginAvailable()) return { ok: false, error: 'not available' };
  try {
    const r = await TelecomPlugin.startRecording();
    return { ok: !!r.ok, path: r.path };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}

export async function stopCallRecording(): Promise<{ ok: boolean; path?: string }> {
  if (!isTelecomPluginAvailable()) return { ok: false };
  try {
    return await TelecomPlugin.stopRecording();
  } catch {
    return { ok: false };
  }
}

export async function isCallRecording(): Promise<boolean> {
  if (!isTelecomPluginAvailable()) return false;
  try {
    const r = await TelecomPlugin.isRecording();
    return !!r.recording;
  } catch {
    return false;
  }
}


export async function addMissedCallListener(
  cb: (data: { number: string; name: string; timestamp: number }) => void
): Promise<{ remove: () => void } | null> {
  if (!isTelecomPluginAvailable()) return null;
  try {
    return await TelecomPlugin.addListener('missedCall', cb);
  } catch (e) {
    console.error('[Telecom] addMissedCallListener failed', e);
    return null;
  }
}


export async function addAnsweredCallListener(
  cb: (data: { number: string; name: string; timestamp: number }) => void
): Promise<{ remove: () => void } | null> {
  if (!isTelecomPluginAvailable()) return null;
  try {
    return await TelecomPlugin.addListener('answeredCall', cb);
  } catch (e) {
    console.error('[Telecom] addAnsweredCallListener failed', e);
    return null;
  }
}


export async function addCallsChangedListener(
  cb: (calls: CallSnapshot[]) => void
): Promise<{ remove: () => void } | null> {
  if (!isTelecomPluginAvailable()) return null;
  try {
    return await TelecomPlugin.addListener('callsChanged', (data) => {
      cb(data.calls || []);
    });
  } catch (e) {
    console.error('[Telecom] addCallsChangedListener failed', e);
    return null;
  }
}

export async function answerCallById(id: string): Promise<boolean> {
  if (!isTelecomPluginAvailable()) return false;
  try { await TelecomPlugin.answerCallById({ id }); return true; }
  catch (e) { console.error(e); return false; }
}

export async function endCallById(id: string): Promise<boolean> {
  if (!isTelecomPluginAvailable()) return false;
  try { await TelecomPlugin.endCallById({ id }); return true; }
  catch (e) { console.error(e); return false; }
}

export async function holdCallById(id: string): Promise<boolean> {
  if (!isTelecomPluginAvailable()) return false;
  try { await TelecomPlugin.holdCallById({ id }); return true; }
  catch (e) { console.error(e); return false; }
}

export async function unholdCallById(id: string): Promise<boolean> {
  if (!isTelecomPluginAvailable()) return false;
  try { await TelecomPlugin.unholdCallById({ id }); return true; }
  catch (e) { console.error(e); return false; }
}

export async function swapToCall(id: string): Promise<boolean> {
  if (!isTelecomPluginAvailable()) return false;
  try { await TelecomPlugin.swapToCall({ id }); return true; }
  catch (e) { console.error(e); return false; }
}


export async function snoozeCallNative(number: string, minutes: number): Promise<boolean> {
  if (!isTelecomPluginAvailable()) return false;
  try {
    await TelecomPlugin.snoozeCall({ number, minutes });
    return true;
  } catch (e) {
    console.error('[Telecom] snoozeCall failed', e);
    return false;
  }
}


export async function addOutgoingCallListener(
  cb: (data: { number: string; name: string; timestamp: number }) => void
): Promise<{ remove: () => void } | null> {
  if (!isTelecomPluginAvailable()) return null;
  try {
    return await TelecomPlugin.addListener('outgoingCall', cb);
  } catch (e) {
    console.error('[Telecom] addOutgoingCallListener failed', e);
    return null;
  }
}

// ---- Pending call log queue ----

export interface PendingCallLogEntry {
  type: 'incoming' | 'missed' | 'outgoing';
  number: string;
  name: string;
  timestamp: number;
  duration: number;
}

export async function drainCallLogNative(): Promise<PendingCallLogEntry[]> {
  if (!isTelecomPluginAvailable()) return [];
  try {
    const r = await TelecomPlugin.drainCallLog();
    const raw = r?.entries || '[]';
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((e: any) => e && typeof e === 'object') as PendingCallLogEntry[];
  } catch (e) {
    console.error('[Telecom] drainCallLog failed', e);
    return [];
  }
}

