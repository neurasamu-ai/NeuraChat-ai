'use client';

import { registerPlugin, Capacitor } from '@capacitor/core';

export interface TelecomPluginType {
  call(options: { number: string }): Promise<{ success: boolean; method?: string }>;
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

export async function placeCall(number: string): Promise<{ success: boolean; error?: string }> {
  if (!number || !number.trim()) {
    return { success: false, error: 'Number is required' };
  }

  if (!isTelecomPluginAvailable()) {
    // Fallback: system intent
    try {
      window.location.href = `tel:${number}`;
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e?.message || String(e) };
    }
  }

  try {
    await TelecomPlugin.call({ number });
    return { success: true };
  } catch (e: any) {
    console.error('[Telecom] call failed', e);
    // Last resort: system intent
    try {
      window.location.href = `tel:${number}`;
      return { success: true };
    } catch (e2: any) {
      return { success: false, error: e?.message || String(e) };
    }
  }
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
