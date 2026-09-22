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
  const diag: Record<string, unknown> = { ts: Date.now() };

  try {
    if (typeof window === 'undefined') {
      diag.step = 'no-window';
      return [];
    }
    if (!isNativePlatform()) {
      diag.step = 'not-native';
      return [];
    }
    diag.step = 'native';

    const permission = await Contacts.requestPermissions();
    const status = (permission as any)?.contacts;
    diag.permission = permission;
    console.log('[Contacts] permission status:', status);
    if (status !== 'granted' && status !== 'prompt-with-rationale') {
      diag.step = 'permission-denied';
      return [];
    }
    diag.step = 'permission-ok';

    const result = await Contacts.getContacts({
      projection: {
        name: true,
        phones: true,
        emails: true,
      },
    });
    diag.rawCount = (result as any)?.contacts?.length ?? 0;
    diag.rawSample = ((result as any)?.contacts || []).slice(0, 2);

    const list = (result?.contacts as CapContact[]) || [];
    console.log('[Contacts] fetched from device:', list.length);
    if (list.length === 0) {
      diag.step = 'empty';
      return [];
    }
    diag.step = 'parsing';

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
    diag.step = 'done';
    diag.savedCount = syncedContacts.length;
  } catch (error: any) {
    diag.step = 'error';
    diag.errorMessage = error?.message || String(error);
    diag.errorStack = error?.stack;
    console.error('[Contacts] syncDeviceContacts failed:', error);
  } finally {
    try {
      localStorage.setItem('contacts_debug', JSON.stringify(diag));
    } catch {}
  }

  return syncedContacts;
}
