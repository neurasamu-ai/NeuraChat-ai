'use client';

import { registerPlugin, Capacitor } from '@capacitor/core';

export interface AllPermissions {
  camera: boolean;
  microphone: boolean;
  contacts: boolean;
  sms: boolean;
  phone: boolean;
  callLog: boolean;
  notifications: boolean;
}

export interface SettingsPluginType {
  requestAllPermissions(): Promise<{ done: boolean; alreadyGranted?: boolean }>;
  openAppSettings(): Promise<void>;
  checkAllPermissions(): Promise<AllPermissions>;
}

const SettingsPlugin = registerPlugin<SettingsPluginType>('SettingsPlugin');

export function isSettingsPluginAvailable(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('SettingsPlugin');
}

export async function requestAllPermissions(): Promise<void> {
  if (!isSettingsPluginAvailable()) return;
  try {
    await SettingsPlugin.requestAllPermissions();
  } catch (e) {
    console.error('requestAllPermissions failed', e);
  }
}

export async function openAppSettings(): Promise<void> {
  if (!isSettingsPluginAvailable()) return;
  try {
    await SettingsPlugin.openAppSettings();
  } catch (e) {
    console.error('openAppSettings failed', e);
  }
}

export async function checkAllPermissions(): Promise<AllPermissions> {
  if (isSettingsPluginAvailable()) {
    try {
      return await SettingsPlugin.checkAllPermissions();
    } catch (e) {
      console.error('checkAllPermissions failed', e);
    }
  }
  return {
    camera: false,
    microphone: false,
    contacts: false,
    sms: false,
    phone: false,
    callLog: false,
    notifications: false,
  };
}
