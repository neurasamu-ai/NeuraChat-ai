'use client';

import { Capacitor } from '@capacitor/core';
import { Contacts } from '@capacitor-community/contacts';
import { saveContact, getContacts, Contact } from './db';
import { getContactsWithSources, isContactsPluginAvailable } from './neura-contacts';
import { normalizePhone } from './phone';

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

// Request contacts permission and fetch contacts (name + phone + email) from the device.
// Idempotent: uses a stable id so repeated syncs update records instead of duplicating.
function sourceLabelFor(accountType: string | null, accountName: string | null): string {
  if (!accountType) return 'Device';
  if (accountType === 'com.google') return 'Google';
  if (accountType.startsWith('com.android.contacts.sim')) return accountName || 'SIM';
  if (accountType.startsWith('com.android.exchange')) return 'Exchange';
  if (accountType.startsWith('com.whatsapp')) return 'WhatsApp';
  return accountName || accountType;
}

export async function syncDeviceContacts(): Promise<Contact[]> {
  const collected: Contact[] = [];

  try {
    if (typeof window === 'undefined') return [];
    if (!isNativePlatform()) return [];

    if (isContactsPluginAvailable()) {
      const rows = await getContactsWithSources();
      if (rows.length > 0) {
        const existing = await getContacts();
        const existingById = new Map(existing.map((c) => [c.id, c]));

        for (const row of rows) {
          const name = row.name || '';
          const phone = normalizePhone(row.phone || '');
          const email = (row.email || '').trim();

          if (!name && !phone && !email) continue;
          if (!phone && !email) continue;

          const stableKey = row.contactId || phone || email;
          const id = `cap-${stableKey}`;
          const prev = existingById.get(id);

          // Aggregated contact view: DISPLAY_NAME_PRIMARY + PHOTO_URI come
          // from the system-merged Contacts row, so the name stays stable
          // regardless of how many accounts/SIMs share the number.
          const nativePhoto = (row as any).photoUri || '';
          const nativeFav = (row as any).favorite === true;

          collected.push({
            id,
            name: name || prev?.name || 'Unknown',
            phone: row.phone || prev?.phone || '',
            email: email || prev?.email,
            avatar: nativePhoto || prev?.avatar,
            favorite: nativeFav || prev?.favorite || false,
            accountType: row.accountType || undefined,
            accountName: row.accountName || undefined,
            rawContactId: row.rawContactId || undefined,
            contactId: row.contactId || undefined,
            sourceLabel: sourceLabelFor(row.accountType, row.accountName),
          });
        }

        // Bulk write + refresh the global store once. Avoids hundreds of
        // individual transactions and prevents partial lists from being
        // surfaced to the UI.
        const { saveContactsBulk } = await import('./db');
        await saveContactsBulk(collected);

        try {
          const { loadContactsFromDB } = await import('./contacts-store');
          await loadContactsFromDB();
        } catch (e) {
          console.warn('[contacts] store refresh failed', e);
        }

        return collected;
      }
    }

    // Fallback: community contacts plugin (no account info)
    const permission = await Contacts.requestPermissions();
    const status = (permission as any)?.contacts;
    if (status !== 'granted' && status !== 'prompt-with-rationale' && status !== 'limited') {
      return [];
    }

    const result = await Contacts.getContacts({
      projection: { name: true, phones: true, emails: true },
    });
    const list = (result?.contacts as CapContact[]) || [];
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
      const rawPhone = (phoneList[0] as any)?.number || (phoneList[0] as any)?.value || '';
      const cleanPhone = normalizePhone(rawPhone);
      const emailList = capC.emails || [];
      const rawEmail = (emailList[0] as any)?.address || (emailList[0] as any)?.value || '';
      const cleanEmail = rawEmail ? String(rawEmail).trim() : '';

      if (!name && !cleanPhone && !cleanEmail) continue;
      if (!cleanPhone && !cleanEmail) continue;

      const stableKey = (capC.contactId && String(capC.contactId)) || cleanPhone || cleanEmail;
      const id = `cap-${stableKey}`;
      const prev = existingById.get(id);

      collected.push({
        id,
        name: name || prev?.name || 'Unknown',
        phone: cleanPhone || prev?.phone || '',
        email: cleanEmail || prev?.email,
        avatar: prev?.avatar,
        favorite: prev?.favorite ?? false,
        sourceLabel: prev?.sourceLabel || 'Device',
      });
    }

    const { saveContactsBulk } = await import('./db');
    await saveContactsBulk(collected);

    try {
      const { loadContactsFromDB } = await import('./contacts-store');
      await loadContactsFromDB();
    } catch (e) {
      console.warn('[contacts] store refresh failed', e);
    }
  } catch (error) {
    console.error('[Contacts] syncDeviceContacts failed:', error);
  }

  return collected;
}
