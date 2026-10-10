'use client';

import { registerPlugin, Capacitor } from '@capacitor/core';

export interface Subscription {
  subscriptionId: number;
  slotIndex: number;
  label: string;
  carrierName?: string;
  displayName?: string;
}

export interface SmsStatusEvent {
  clientId: string;
  status: 'sent' | 'failed' | 'delivered' | 'queued';
  resultCode?: number;
}

export interface IncomingSms {
  sender: string;
  address?: string;
  body: string;
  timestamp: number;
  direction?: 'incoming' | 'outgoing';
  subscriptionId?: number; // SIM subscription id, -1 / undefined if unknown
}

export interface SmsPluginType {
  getActiveSubscriptions(): Promise<{ subscriptions: Subscription[] }>;
  sendDirectSMS(options: {
    phone: string;
    message: string;
    subscriptionId?: number;
  }): Promise<{ status: string; subscriptionId?: number }>;
  drainIncoming(): Promise<{ messages: IncomingSms[] }>;
  sendDirectSMSTracked(options: {
    phone: string;
    message: string;
    subscriptionId?: number;
    clientId: string;
  }): Promise<{ status: string; clientId: string }>;
  isDefaultSmsApp(): Promise<{ isDefault: boolean }>;
  requestDefaultSmsRole(): Promise<{ launched: boolean }>;
  openAppInfo(): Promise<void>;
  getPendingNavigation(): Promise<{ type?: string; phone?: string; name?: string }>;
  syncBlockedList(options: { numbers: string[] }): Promise<{ ok: boolean; count?: number }>;
  getBlockedCount(): Promise<{ count: number; numbers: string[] }>;
  addListener(
    eventName: 'smsReceived' | 'smsSent',
    listener: (data: IncomingSms) => void
  ): Promise<{ remove: () => void }>;
  addListener(
    eventName: 'smsStatusChanged',
    listener: (data: SmsStatusEvent) => void
  ): Promise<{ remove: () => void }>;
}

const SmsPlugin = registerPlugin<SmsPluginType>('SmsPlugin');

export function isSmsPluginAvailable(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (Capacitor.getPlatform() !== 'android') return false;
    try {
      if (
        typeof Capacitor.isPluginAvailable === 'function' &&
        Capacitor.isPluginAvailable('SmsPlugin')
      ) {
        return true;
      }
    } catch {}
    // Fallback for manually registered plugins.
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

export async function getActiveSubscriptions(): Promise<Subscription[]> {
  if (!isSmsPluginAvailable()) return [];
  try {
    const r = await SmsPlugin.getActiveSubscriptions();
    return r.subscriptions || [];
  } catch (e) {
    console.error('[Sms] getActiveSubscriptions failed', e);
    return [];
  }
}

export async function sendSms(phone: string, message: string, subscriptionId?: number) {
  if (!isSmsPluginAvailable()) {
    throw new Error('SMS plugin not available');
  }
  return SmsPlugin.sendDirectSMS({ phone, message, subscriptionId });
}

const PREFERRED_SIM_KEY = 'preferred_sim_subscription_id';

export function getPreferredSimId(): number | null {
  if (typeof window === 'undefined') return null;
  try {
    const v = localStorage.getItem(PREFERRED_SIM_KEY);
    if (!v) return null;
    const n = parseInt(v, 10);
    return isNaN(n) ? null : n;
  } catch {
    return null;
  }
}

export function setPreferredSimId(id: number | null) {
  if (typeof window === 'undefined') return;
  try {
    if (id === null) localStorage.removeItem(PREFERRED_SIM_KEY);
    else localStorage.setItem(PREFERRED_SIM_KEY, String(id));
  } catch {}
}


export async function drainIncomingSms(): Promise<IncomingSms[]> {
  if (!isSmsPluginAvailable()) return [];
  try {
    const r = await SmsPlugin.drainIncoming();
    return r.messages || [];
  } catch (e) {
    console.error('[Sms] drainIncoming failed', e);
    return [];
  }
}

export async function addSmsReceivedListener(
  cb: (msg: IncomingSms) => void
): Promise<{ remove: () => void } | null> {
  if (!isSmsPluginAvailable()) return null;
  try {
    return await SmsPlugin.addListener('smsReceived', cb);
  } catch (e) {
    console.error('[Sms] addListener failed', e);
    return null;
  }
}


export async function isDefaultSmsApp(): Promise<boolean> {
  if (!isSmsPluginAvailable()) return true; // avoid annoying on unsupported
  try {
    const r = await SmsPlugin.isDefaultSmsApp();
    return !!r.isDefault;
  } catch (e) {
    console.error('[Sms] isDefaultSmsApp failed', e);
    return true;
  }
}

export async function requestDefaultSmsRole(): Promise<boolean> {
  if (!isSmsPluginAvailable()) return false;
  try {
    const r = await SmsPlugin.requestDefaultSmsRole();
    return !!r.launched;
  } catch (e) {
    console.error('[Sms] requestDefaultSmsRole failed', e);
    return false;
  }
}


export async function addSmsSentListener(
  cb: (msg: IncomingSms) => void
): Promise<{ remove: () => void } | null> {
  if (!isSmsPluginAvailable()) return null;
  try {
    return await SmsPlugin.addListener('smsSent', cb);
  } catch (e) {
    console.error('[Sms] addListener(smsSent) failed', e);
    return null;
  }
}


export async function sendSmsTracked(
  phone: string,
  message: string,
  clientId: string,
  subscriptionId?: number
): Promise<{ status: string; clientId: string }> {
  if (!isSmsPluginAvailable()) throw new Error('SMS plugin not available');
  return SmsPlugin.sendDirectSMSTracked({ phone, message, clientId, subscriptionId });
}

export async function addSmsStatusListener(
  cb: (e: SmsStatusEvent) => void
): Promise<{ remove: () => void } | null> {
  if (!isSmsPluginAvailable()) return null;
  try {
    return await SmsPlugin.addListener('smsStatusChanged', cb);
  } catch (e) {
    console.error('[Sms] addSmsStatusListener failed', e);
    return null;
  }
}


export async function openAppInfo(): Promise<void> {
  if (!isSmsPluginAvailable()) return;
  try {
    await SmsPlugin.openAppInfo();
  } catch (e) {
    console.error('[Sms] openAppInfo failed', e);
  }
}


export async function getPendingNavigation(): Promise<{
  type?: string;
  phone?: string;
  name?: string;
}> {
  if (!isSmsPluginAvailable()) return {};
  try {
    return await SmsPlugin.getPendingNavigation();
  } catch (e) {
    console.error('[Sms] getPendingNavigation failed', e);
    return {};
  }
}


export async function syncBlockedListToNative(numbers: string[]): Promise<boolean> {
  if (!isSmsPluginAvailable()) return false;
  try {
    await SmsPlugin.syncBlockedList({ numbers });
    return true;
  } catch (e) {
    console.error('[Sms] syncBlockedList failed', e);
    return false;
  }
}


export async function getNativeBlockedCount(): Promise<{ count: number; numbers: string[] }> {
  if (!isSmsPluginAvailable()) return { count: 0, numbers: [] };
  try {
    return await SmsPlugin.getBlockedCount();
  } catch (e) {
    console.error('[Sms] getBlockedCount failed', e);
    return { count: 0, numbers: [] };
  }
}
