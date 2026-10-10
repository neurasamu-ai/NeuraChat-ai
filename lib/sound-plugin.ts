'use client';

import { registerPlugin, Capacitor } from '@capacitor/core';

export type SoundType = 'sms' | 'call';

export interface SoundInfo {
  type: SoundType;
  name: string;
  custom: boolean;
  uri?: string;
}

interface SoundPluginType {
  pickSound(options: { type: SoundType }): Promise<{
    type?: SoundType;
    name?: string;
    custom?: boolean;
    uri?: string;
  }>;
  getSound(options: { type: SoundType }): Promise<SoundInfo>;
  clearSound(options: { type: SoundType }): Promise<SoundInfo>;
}

const Sound = registerPlugin<SoundPluginType>('SoundPlugin');

export function isSoundPluginAvailable(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (Capacitor.getPlatform() !== 'android') return false;
    try { if (Capacitor.isPluginAvailable('SoundPlugin')) return true; } catch {}
    try { if (Capacitor.isNativePlatform()) return true; } catch {}
    return false;
  } catch {
    return false;
  }
}

export async function pickSoundNative(type: SoundType): Promise<SoundInfo | null> {
  if (!isSoundPluginAvailable()) return null;
  try {
    const r = await Sound.pickSound({ type });
    if (!r || !r.type) return null;
    return {
      type: r.type,
      name: r.name || 'Default',
      custom: !!r.custom,
      uri: r.uri,
    };
  } catch (e) {
    console.error('[Sound] pickSound failed', e);
    return null;
  }
}

export async function getSoundNative(type: SoundType): Promise<SoundInfo> {
  const fallback: SoundInfo = { type, name: 'Default', custom: false };
  if (!isSoundPluginAvailable()) return fallback;
  try {
    return await Sound.getSound({ type });
  } catch (e) {
    console.error('[Sound] getSound failed', e);
    return fallback;
  }
}

export async function clearSoundNative(type: SoundType): Promise<SoundInfo> {
  const fallback: SoundInfo = { type, name: 'Default', custom: false };
  if (!isSoundPluginAvailable()) return fallback;
  try {
    return await Sound.clearSound({ type });
  } catch (e) {
    console.error('[Sound] clearSound failed', e);
    return fallback;
  }
}
