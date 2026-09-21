'use client';

import { Contacts } from '@capacitor-community/contacts';
import { saveContact, Contact } from './db';

// Safely checks if running on a native Capacitor platform
export function isNativePlatform(): boolean {
  if (typeof window === 'undefined') return false;
  return !!(window as any).Capacitor?.isNative;
}

// Interface of Capacitor-Community contacts item
export interface CapContact {
  contactId: string;
  displayName: string;
  phoneNumbers?: Array<{
    label: string;
    number: string;
  }>;
  phones?: Array<{
    label?: string;
    value?: string;
  }>;
}

// Request contacts permission and fetch contacts from the device.
// Returns [] on web or when permission is denied.
export async function syncDeviceContacts(): Promise<Contact[]> {
  const syncedContacts: Contact[] = [];

  try {
    if (typeof window === 'undefined') return [];

    if (!isNativePlatform()) {
      // Web has no native contacts — nothing to sync.
      return [];
    }

    // Request permissions
    const permission = await Contacts.requestPermissions();
    if (permission.contacts !== 'granted' && permission.contacts !== 'prompt-with-rationale') {
      return [];
    }

    const result = await Contacts.getContacts({
      projection: {
        name: true,
        phones: true,
      },
    });

    if (!result || !result.contacts) return [];

    for (const capC of (result.contacts as CapContact[])) {
      const name = capC.displayName || (capC as any).name?.display || 'Unknown';

      // Robust number extractor (handles both projection shapes)
      const phoneList = capC.phoneNumbers || capC.phones || [];
      const rawPhone = (phoneList[0] as any)?.number || (phoneList[0] as any)?.value || '';

      if (rawPhone) {
        const cleanPhone = rawPhone.replace(/\s+/g, '');
        const newContact: Contact = {
          id: `cap-${capC.contactId || Math.random().toString(36).substring(2, 11)}`,
          name,
          phone: cleanPhone,
          favorite: false,
        };
        await saveContact(newContact);
        syncedContacts.push(newContact);
      }
    }
  } catch (error) {
    console.error('Error in syncDeviceContacts Native call:', error);
  }

  return syncedContacts;
}
