'use client';

import { registerPlugin, Capacitor } from '@capacitor/core';

export interface SettingsPluginType {
  openAppSettings(): Promise<void>;
  openNotificationSettings(): Promise<void>;
  checkPermission(options: { permission: string }): Promise<{ granted: boolean }>;
  checkAllPermissions(): Promise<{
    camera: boolean;
    microphone: boolean;
    contacts: boolean;
    sms: boolean;
    phone: boolean;
    callLog: boolean;
    notifications: boolean;
  }>;
}

const SettingsPlugin = registerPlugin<SettingsPluginType>('SettingsPlugin');

export function isSettingsPluginAvailable(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('SettingsPlugin');
}

export async function openAppSettings(): Promise<void> {
  if (isSettingsPluginAvailable()) {
    await SettingsPlugin.openAppSettings();
  }
}

export async function openNotificationSettings(): Promise<void> {
  if (isSettingsPluginAvailable()) {
    await SettingsPlugin.openNotificationSettings();
  }
}

export async function checkAllPermissions() {
  if (isSettingsPluginAvailable()) {
    return await SettingsPlugin.checkAllPermissions();
  }
  // Web fallback: report nothing granted
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
