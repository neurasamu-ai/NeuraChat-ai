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
  emails?: Array<{
    label?: string;
    address?: string;
    value?: string;
  }>;
  name?: {
    display?: string;
    given?: string;
    family?: string;
  };
}

// Request contacts permission and fetch contacts (name + phone + email) from the device.
// Returns [] on web or when permission is denied.
export async function syncDeviceContacts(): Promise<Contact[]> {
  const syncedContacts: Contact[] = [];

  try {
    if (typeof window === 'undefined') return [];

    if (!isNativePlatform()) {
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
        emails: true,
      },
    });

    if (!result || !result.contacts) return [];

    for (const capC of (result.contacts as CapContact[])) {
      const name =
        capC.displayName ||
        capC.name?.display ||
        capC.name?.given ||
        capC.name?.family ||
        'Unknown';

      // Robust phone extractor (handles both projection shapes)
      const phoneList = capC.phoneNumbers || capC.phones || [];
      const rawPhone =
        (phoneList[0] as any)?.number || (phoneList[0] as any)?.value || '';

      // Email extractor
      const emailList = capC.emails || [];
      const rawEmail =
        (emailList[0] as any)?.address || (emailList[0] as any)?.value || '';

      const cleanPhone = rawPhone ? rawPhone.replace(/\s+/g, '') : '';
      const cleanEmail = rawEmail ? rawEmail.trim() : '';

      // Save if we have at least a name AND (phone or email)
      if (name && (cleanPhone || cleanEmail)) {
        const newContact: Contact = {
          id: `cap-${capC.contactId || Math.random().toString(36).substring(2, 11)}`,
          name,
          phone: cleanPhone,
          email: cleanEmail || undefined,
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
