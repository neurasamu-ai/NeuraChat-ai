'use client';

import { Capacitor } from '@capacitor/core';
import { Contacts } from '@capacitor-community/contacts';
import { saveContact, getContacts, Contact } from './db';

// Robust native check — uses the official Capacitor API.
// Note: `window.Capacitor.isNative` no longer exists in modern Capacitor.
export function isNativePlatform(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const platform = Capacitor.getPlatform();
    if (platform === 'android' || platform === 'ios') return true;
  } catch {}
  try {
    if (Capacitor.isNativePlatform?.()) return true;
  } catch {}
  return false;
}

// Interface of Capacitor-Community contacts item
export interface CapContact {
  contactId?: string;
  displayName?: string;
  phoneNumbers?: Array<{ label?: string; number?: string }>;
  phones?: Array<{ label?: string; value?: string }>;
  emails?: Array<{ label?: string; address?: string; value?: string }>;
  name?: {
    display?: string;
    given?: string;
    family?: string;
  };
}

// Normalize a phone number for stable IDs and lookups
function normalizePhone(raw?: string): string {
  if (!raw) return '';
  return raw.replace(/[^\d+]/g, '');
}

// Request contacts permission and fetch contacts (name + phone + email) from the device.
// Idempotent: uses a stable id so repeated syncs update records instead of duplicating.
export async function syncDeviceContacts(): Promise<Contact[]> {
  const syncedContacts: Contact[] = [];

  try {
    if (typeof window === 'undefined') return [];
    if (!isNativePlatform()) return [];

    const permission = await Contacts.requestPermissions();
    const status = (permission as any)?.contacts;
    console.log('[Contacts] permission status:', status);
    if (status !== 'granted' && status !== 'prompt-with-rationale' && status !== 'limited') {
      return [];
    }

    const result = await Contacts.getContacts({
      projection: {
        name: true,
        phones: true,
        emails: true,
      },
    });

    const list = (result?.contacts as CapContact[]) || [];
    console.log('[Contacts] fetched from device:', list.length);
    if (list.length === 0) return [];

    const existing = await getContacts();
    const existingById = new Map(existing.map((c) => [c.id, c]));

    for (const capC of list) {
      const name =
        capC.displayName ||
        capC.name?.display ||
        capC.name?.given ||
        capC.name?.family ||
        '';

      const phoneList = capC.phoneNumbers || capC.phones || [];
      const rawPhone =
        (phoneList[0] as any)?.number || (phoneList[0] as any)?.value || '';
      const cleanPhone = normalizePhone(rawPhone);

      const emailList = capC.emails || [];
      const rawEmail =
        (emailList[0] as any)?.address || (emailList[0] as any)?.value || '';
      const cleanEmail = rawEmail ? String(rawEmail).trim() : '';

      if (!name && !cleanPhone && !cleanEmail) continue;
      if (!cleanPhone && !cleanEmail) continue;

      const stableKey =
        (capC.contactId && String(capC.contactId)) ||
        cleanPhone ||
        cleanEmail;
      const id = `cap-${stableKey}`;

      const prev = existingById.get(id);
      const newContact: Contact = {
        id,
        name: name || prev?.name || 'Unknown',
        phone: cleanPhone || prev?.phone || '',
        email: cleanEmail || prev?.email,
        avatar: prev?.avatar,
        favorite: prev?.favorite ?? false,
      };

      await saveContact(newContact);
      syncedContacts.push(newContact);
    }
  } catch (error) {
    console.error('[Contacts] syncDeviceContacts failed:', error);
  }

  return syncedContacts;
}
