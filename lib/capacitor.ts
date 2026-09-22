'use client';

import { Contacts } from '@capacitor-community/contacts';
import { saveContact, getContacts, Contact } from './db';

// Safely checks if running on a native Capacitor platform
export function isNativePlatform(): boolean {
  if (typeof window === 'undefined') return false;
  return !!(window as any).Capacitor?.isNative;
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

    // Request permissions
    const permission = await Contacts.requestPermissions();
    const status = (permission as any)?.contacts;
    console.log('[Contacts] permission status:', status);
    if (status !== 'granted' && status !== 'prompt-with-rationale') {
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

    // Existing contacts indexed by stable id so we can preserve favorite + manual records
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

      // Stable id: prefer device contactId, fall back to phone, then email.
      // Never use random — that causes duplicates on every re-sync.
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
