'use client';

import { registerPlugin, Capacitor } from '@capacitor/core';

export interface Subscription {
  subscriptionId: number;
  slotIndex: number;
  label: string;
  carrierName?: string;
  displayName?: string;
}

export interface SmsPluginType {
  getActiveSubscriptions(): Promise<{ subscriptions: Subscription[] }>;
  sendDirectSMS(options: {
    phone: string;
    message: string;
    subscriptionId?: number;
  }): Promise<{ status: string; subscriptionId?: number }>;
}

const SmsPlugin = registerPlugin<SmsPluginType>('SmsPlugin');

export function isSmsPluginAvailable(): boolean {
  return Capacitor.getPlatform() === 'android' && Capacitor.isPluginAvailable('SmsPlugin');
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
