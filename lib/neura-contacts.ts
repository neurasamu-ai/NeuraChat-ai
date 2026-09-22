'use client';

import { registerPlugin, Capacitor } from '@capacitor/core';

export interface WritableAccount {
  id: string;
  label: string;
  accountType: string | null;
  accountName: string | null;
  writable: boolean;
  subscriptionId?: number;
}

export interface NativeContactRow {
  contactId: string;
  rawContactId: string;
  name: string;
  phone: string;
  email: string;
  accountType: string | null;
  accountName: string | null;
}

export interface NeuraContactsPluginType {
  getWritableAccounts(): Promise<{ accounts: WritableAccount[] }>;
  getContactsWithSources(): Promise<{ contacts: NativeContactRow[] }>;
  saveContact(options: {
    name?: string;
    phone?: string;
    email?: string;
    accountType: string | null;
    accountName: string | null;
  }): Promise<{ success: boolean; uri?: string; rawContactId?: string; contactId?: string }>;
  deleteContactRaw(options: { rawContactId: string }): Promise<{ deleted: number }>;
}

const NeuraContacts = registerPlugin<NeuraContactsPluginType>('NeuraContactsPlugin');

export function isContactsPluginAvailable(): boolean {
  return Capacitor.getPlatform() === 'android' && Capacitor.isPluginAvailable('NeuraContactsPlugin');
}

export async function getWritableAccounts(): Promise<WritableAccount[]> {
  if (!isContactsPluginAvailable()) return [];
  try {
    const r = await NeuraContacts.getWritableAccounts();
    return r.accounts || [];
  } catch (e) {
    console.error('[NeuraContacts] getWritableAccounts failed', e);
    return [];
  }
}

export async function saveContactToAccount(opts: {
  name?: string;
  phone?: string;
  email?: string;
  accountType: string | null;
  accountName: string | null;
}): Promise<{
  success: boolean;
  error?: string;
  uri?: string;
  rawContactId?: string;
  contactId?: string;
}> {
  if (!isContactsPluginAvailable()) {
    return { success: false, error: 'Native contacts plugin not available on this device' };
  }
  try {
    const r = await NeuraContacts.saveContact(opts);
    if (!r || !r.success) {
      return { success: false, error: 'Insert did not return success' };
    }
    return {
      success: true,
      uri: r.uri,
      rawContactId: r.rawContactId,
      contactId: r.contactId,
    };
  } catch (e: any) {
    console.error('[NeuraContacts] saveContact failed', e);
    return { success: false, error: e?.message || String(e) };
  }
}

export async function deleteRawContact(rawContactId: string): Promise<boolean> {
  if (!isContactsPluginAvailable()) return false;
  try {
    const r = await NeuraContacts.deleteContactRaw({ rawContactId });
    return (r.deleted || 0) > 0;
  } catch (e) {
    console.error('[NeuraContacts] deleteContactRaw failed', e);
    return false;
  }
}

export async function getContactsWithSources(): Promise<NativeContactRow[]> {
  if (!isContactsPluginAvailable()) return [];
  try {
    const r = await NeuraContacts.getContactsWithSources();
    return r.contacts || [];
  } catch (e) {
    console.error('[NeuraContacts] getContactsWithSources failed', e);
    return [];
  }
}
