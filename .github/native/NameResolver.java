package com.neurasamu.build.chat;

import android.content.Context;
import android.database.Cursor;
import android.net.Uri;
import android.provider.ContactsContract;
import android.provider.ContactsContract.CommonDataKinds.StructuredName;
import android.provider.ContactsContract.PhoneLookup;
import android.provider.ContactsContract.RawContacts;
import android.util.Log;

import java.util.ArrayList;
import java.util.List;

// Central number -> display-name resolution. Every native notifier calls
// this so the same number shows the same name in SMS, calls, overlay and
// history. If the user has picked a preferred contact account, that account's
// name wins; otherwise the system-merged DISPLAY_NAME_PRIMARY is used.
public class NameResolver {

    private static final String TAG = "NeuraNameResolver";

    public static String resolve(Context ctx, String number) {
        if (ctx == null || number == null || number.isEmpty()) return "";
        try {
            String def = lookupDefault(ctx, number);
            if (def != null && !def.isEmpty()) return def;
        } catch (Exception e) {
            Log.w(TAG, "default lookup failed", e);
        }
        return "";
    }

    // Resolve name using a specific SIM / subscription. The per-event SIM is
    // the one that actually received the call/SMS, so its account in the
    // contacts DB is the correct source of truth for that event.
    //
    // Fallback chain: SIM account name -> system merged name -> "".
    public static String resolveForSubscription(Context ctx, String number, int subscriptionId) {
        if (ctx == null || number == null || number.isEmpty()) return "";
        if (subscriptionId < 0) {
            return resolve(ctx, number);
        }
        try {
            String simAccountName = simAccountNameForSub(ctx, subscriptionId);
            if (simAccountName != null && !simAccountName.isEmpty()) {
                String bySim = lookupByAccount(ctx, number,
                    "com.android.contacts.sim", simAccountName);
                if (bySim != null && !bySim.isEmpty()) return bySim;
            }
        } catch (Exception e) {
            Log.w(TAG, "sim lookup failed", e);
        }
        // Fallback: system merged name, then default resolve chain.
        try {
            String def = lookupDefault(ctx, number);
            if (def != null && !def.isEmpty()) return def;
        } catch (Exception e) {
            Log.w(TAG, "fallback default failed", e);
        }
        return "";
    }

    // Best-effort mapping of a subscription id to the SIM's contact account
    // name. Different ROMs label SIM contacts as "SIM", "SIM1", "SIM 1",
    // the carrier name, or the user-set display name. We probe several
    // candidates and let lookupByAccount return null if none match.
    private static String simAccountNameForSub(Context ctx, int subscriptionId) {
        try {
            android.telephony.SubscriptionManager sm =
                (android.telephony.SubscriptionManager)
                    ctx.getSystemService(Context.TELEPHONY_SUBSCRIPTION_SERVICE);
            if (sm == null) return null;
            android.telephony.SubscriptionInfo info =
                sm.getActiveSubscriptionInfo(subscriptionId);
            if (info == null) return null;
            int slot = info.getSimSlotIndex();
            CharSequence dispCs = info.getDisplayName();
            String display = dispCs == null ? null : dispCs.toString();
            // Try candidates in a stable order.
            String[] candidates = new String[] {
                display,
                "SIM" + (slot + 1),
                "SIM " + (slot + 1),
                "SIM" + slot,
                "SIM " + slot,
            };
            for (String cand : candidates) {
                if (cand == null || cand.isEmpty()) continue;
                // Verify that an account by this name actually holds SIM-type
                // contacts; otherwise skip it.
                if (simAccountExists(ctx, cand)) return cand;
            }
        } catch (Exception e) {
            Log.w(TAG, "simAccountNameForSub failed", e);
        }
        return null;
    }

    private static boolean simAccountExists(Context ctx, String accountName) {
        Cursor c = null;
        try {
            c = ctx.getContentResolver().query(
                RawContacts.CONTENT_URI,
                new String[] { RawContacts._ID },
                RawContacts.ACCOUNT_TYPE + "=? AND " + RawContacts.ACCOUNT_NAME + "=?",
                new String[] { "com.android.contacts.sim", accountName },
                null);
            return c != null && c.moveToFirst();
        } catch (Exception e) {
            return false;
        } finally {
            if (c != null) c.close();
        }
    }

    // --- Default: system aggregated PhoneLookup (DISPLAY_NAME_PRIMARY path) ---
    private static String lookupDefault(Context ctx, String number) {
        Cursor c = null;
        try {
            Uri uri = Uri.withAppendedPath(PhoneLookup.CONTENT_FILTER_URI, Uri.encode(number));
            c = ctx.getContentResolver().query(
                uri, new String[] { PhoneLookup.DISPLAY_NAME }, null, null, null);
            if (c != null && c.moveToFirst()) {
                String n = c.getString(0);
                if (n != null) return n;
            }
        } finally {
            if (c != null) c.close();
        }
        return "";
    }

    // --- Preferred account lookup: find the raw_contact in that account for
    //     this number's aggregated CONTACT_ID, then read its StructuredName. ---
    private static String lookupByAccount(Context ctx, String number, String accountType, String accountName) {
        long contactId = -1;
        Cursor c = null;
        try {
            Uri uri = Uri.withAppendedPath(PhoneLookup.CONTENT_FILTER_URI, Uri.encode(number));
            c = ctx.getContentResolver().query(
                uri, new String[] { PhoneLookup.CONTACT_ID }, null, null, null);
            if (c != null && c.moveToFirst()) contactId = c.getLong(0);
        } catch (Exception e) {
            Log.w(TAG, "contactId lookup failed", e);
        } finally {
            if (c != null) c.close();
        }
        if (contactId <= 0) return null;

        long rawId = -1;
        c = null;
        try {
            StringBuilder sel = new StringBuilder();
            sel.append(RawContacts.CONTACT_ID).append("=? AND ")
               .append(RawContacts.DELETED).append("=0");
            List<String> args = new ArrayList<>();
            args.add(String.valueOf(contactId));
            if (accountType != null && !accountType.isEmpty()) {
                sel.append(" AND ").append(RawContacts.ACCOUNT_TYPE).append("=?");
                args.add(accountType);
            }
            if (accountName != null && !accountName.isEmpty()) {
                sel.append(" AND ").append(RawContacts.ACCOUNT_NAME).append("=?");
                args.add(accountName);
            }
            c = ctx.getContentResolver().query(
                RawContacts.CONTENT_URI,
                new String[] { RawContacts._ID },
                sel.toString(),
                args.toArray(new String[0]),
                null);
            if (c != null && c.moveToFirst()) rawId = c.getLong(0);
        } catch (Exception e) {
            Log.w(TAG, "rawContact lookup failed", e);
        } finally {
            if (c != null) c.close();
        }
        if (rawId <= 0) return null;

        c = null;
        try {
            c = ctx.getContentResolver().query(
                ContactsContract.Data.CONTENT_URI,
                new String[] { StructuredName.DISPLAY_NAME },
                ContactsContract.Data.RAW_CONTACT_ID + "=? AND " + ContactsContract.Data.MIMETYPE + "=?",
                new String[] { String.valueOf(rawId), StructuredName.CONTENT_ITEM_TYPE },
                null);
            if (c != null && c.moveToFirst()) {
                String n = c.getString(0);
                if (n != null && !n.isEmpty()) return n;
            }
        } catch (Exception e) {
            Log.w(TAG, "structuredName lookup failed", e);
        } finally {
            if (c != null) c.close();
        }
        return null;
    }
}
