package com.neurasamu.build.chat;

import android.Manifest;
import android.accounts.Account;
import android.accounts.AccountManager;
import android.content.ContentProviderOperation;
import android.content.ContentResolver;
import android.content.Context;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.provider.ContactsContract;
import android.provider.ContactsContract.CommonDataKinds.Email;
import android.provider.ContactsContract.CommonDataKinds.Phone;
import android.provider.ContactsContract.CommonDataKinds.StructuredName;
import android.provider.ContactsContract.RawContacts;
import android.telephony.SubscriptionInfo;
import android.telephony.SubscriptionManager;
import android.util.Log;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;

import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

@CapacitorPlugin(
    name = "NeuraContactsPlugin",
    permissions = {
        @Permission(alias = "readContacts", strings = { Manifest.permission.READ_CONTACTS }),
        @Permission(alias = "writeContacts", strings = { Manifest.permission.WRITE_CONTACTS }),
        @Permission(alias = "accounts", strings = { "android.permission.GET_ACCOUNTS" })
    }
)
public class NeuraContactsPlugin extends Plugin {

    private static final String TAG = "NeuraContacts";

    // -------- Writable accounts --------

    @PluginMethod
    public void getWritableAccounts(PluginCall call) {
        if (!hasReadContacts()) {
            call.reject("READ_CONTACTS permission not granted");
            return;
        }
        JSArray result = new JSArray();

        // 1. NeuraChat (always available, stored locally in the web app)
        JSObject local = new JSObject();
        local.put("id", "neurachat");
        local.put("label", "NeuraChat");
        local.put("accountType", "neurachat.local");
        local.put("accountName", "NeuraChat");
        local.put("writable", true);
        result.put(local);

        // 2. Device / local contacts account
        JSObject device = new JSObject();
        device.put("id", "device");
        device.put("label", "Device");
        device.put("accountType", null);
        device.put("accountName", null);
        device.put("writable", true);
        result.put(device);

        // 3. Android accounts (Google, etc.) that support contact writes
        try {
            AccountManager am = AccountManager.get(getContext());
            Account[] accounts = am.getAccounts();
            for (Account a : accounts) {
                boolean isGoogle = "com.google".equals(a.type);
                boolean isExchange = a.type != null && a.type.startsWith("com.android.exchange");
                if (!isGoogle && !isExchange) continue;

                JSObject acc = new JSObject();
                acc.put("id", a.type + "|" + a.name);
                acc.put("label", isGoogle ? "Google" : a.type);
                acc.put("accountName", a.name);
                acc.put("accountType", a.type);
                acc.put("writable", true);
                result.put(acc);
            }
        } catch (SecurityException e) {
            Log.w(TAG, "GET_ACCOUNTS denied", e);
        }

        // 4. SIM accounts
        try {
            SubscriptionManager sm = (SubscriptionManager) getContext().getSystemService(Context.TELEPHONY_SUBSCRIPTION_SERVICE);
            if (sm != null && ContextCompat.checkSelfPermission(getContext(), Manifest.permission.READ_PHONE_STATE) == PackageManager.PERMISSION_GRANTED) {
                List<SubscriptionInfo> subs = sm.getActiveSubscriptionInfoList();
                if (subs != null) {
                    for (SubscriptionInfo info : subs) {
                        JSObject sim = new JSObject();
                        sim.put("id", "sim|" + info.getSubscriptionId());
                        sim.put("label", "SIM " + (info.getSimSlotIndex() + 1));
                        sim.put("accountName", "SIM " + (info.getSimSlotIndex() + 1));
                        sim.put("accountType", "com.android.contacts.sim");
                        sim.put("subscriptionId", info.getSubscriptionId());
                        sim.put("writable", true);
                        result.put(sim);
                    }
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "SIM enumeration failed", e);
        }

        JSObject ret = new JSObject();
        ret.put("accounts", result);
        call.resolve(ret);
    }

    // -------- Save contact to a specific account --------

    @PluginMethod
    public void saveContact(PluginCall call) {
        if (!hasWriteContacts()) {
            call.reject("WRITE_CONTACTS permission not granted");
            return;
        }

        String name = call.getString("name", "");
        String phone = call.getString("phone", "");
        String email = call.getString("email", "");
        String accountType = call.getString("accountType");
        String accountName = call.getString("accountName");

        if ((name == null || name.isEmpty()) && (phone == null || phone.isEmpty()) && (email == null || email.isEmpty())) {
            call.reject("Name, phone, or email is required");
            return;
        }

        try {
            ArrayList<ContentProviderOperation> ops = new ArrayList<>();

            // Create the raw contact with the given account (or local)
            ContentProviderOperation.Builder rawOp = ContentProviderOperation
                .newInsert(RawContacts.CONTENT_URI)
                .withValue(RawContacts.ACCOUNT_TYPE, accountType)
                .withValue(RawContacts.ACCOUNT_NAME, accountName);
            ops.add(rawOp.build());

            // Display name
            if (name != null && !name.isEmpty()) {
                ContentProviderOperation.Builder nameOp = ContentProviderOperation
                    .newInsert(ContactsContract.Data.CONTENT_URI)
                    .withValueBackReference(ContactsContract.Data.RAW_CONTACT_ID, 0)
                    .withValue(ContactsContract.Data.MIMETYPE, StructuredName.CONTENT_ITEM_TYPE)
                    .withValue(StructuredName.DISPLAY_NAME, name);
                ops.add(nameOp.build());
            }

            // Phone
            if (phone != null && !phone.isEmpty()) {
                ContentProviderOperation.Builder phoneOp = ContentProviderOperation
                    .newInsert(ContactsContract.Data.CONTENT_URI)
                    .withValueBackReference(ContactsContract.Data.RAW_CONTACT_ID, 0)
                    .withValue(ContactsContract.Data.MIMETYPE, Phone.CONTENT_ITEM_TYPE)
                    .withValue(Phone.NUMBER, phone)
                    .withValue(Phone.TYPE, Phone.TYPE_MOBILE);
                ops.add(phoneOp.build());
            }

            // Email
            if (email != null && !email.isEmpty()) {
                ContentProviderOperation.Builder emailOp = ContentProviderOperation
                    .newInsert(ContactsContract.Data.CONTENT_URI)
                    .withValueBackReference(ContactsContract.Data.RAW_CONTACT_ID, 0)
                    .withValue(ContactsContract.Data.MIMETYPE, Email.CONTENT_ITEM_TYPE)
                    .withValue(Email.ADDRESS, email)
                    .withValue(Email.TYPE, Email.TYPE_OTHER);
                ops.add(emailOp.build());
            }

            ContentResolver cr = getContext().getContentResolver();
            android.content.ContentProviderResult[] results = cr.applyBatch(ContactsContract.AUTHORITY, ops);

            if (results != null && results.length > 0 && results[0] != null && results[0].uri != null) {
                android.net.Uri rawUri = results[0].uri; // content://com.android.contacts/raw_contacts/<id>
                String rawContactId = rawUri.getLastPathSegment();
                String contactId = null;
                if (rawContactId != null) {
                    Cursor c = cr.query(
                        RawContacts.CONTENT_URI,
                        new String[] { RawContacts.CONTACT_ID },
                        RawContacts._ID + " = ?",
                        new String[] { rawContactId },
                        null
                    );
                    if (c != null) {
                        if (c.moveToFirst()) {
                            contactId = c.getString(0);
                        }
                        c.close();
                    }
                }

                JSObject ret = new JSObject();
                ret.put("success", true);
                ret.put("uri", rawUri.toString());
                if (rawContactId != null) ret.put("rawContactId", rawContactId);
                if (contactId != null) ret.put("contactId", contactId);
                call.resolve(ret);
            } else {
                call.reject("Contact insert returned no result");
            }
        } catch (Exception e) {
            Log.e(TAG, "saveContact failed", e);
            call.reject("Save failed: " + e.getMessage());
        }
    }

    // -------- Delete a raw contact (source-specific) --------

    @PluginMethod
    public void deleteContactRaw(PluginCall call) {
        if (!hasWriteContacts()) {
            call.reject("WRITE_CONTACTS permission not granted");
            return;
        }
        String rawContactId = call.getString("rawContactId");
        if (rawContactId == null || rawContactId.isEmpty()) {
            call.reject("rawContactId is required");
            return;
        }
        try {
            ContentResolver cr = getContext().getContentResolver();
            String selection = RawContacts._ID + " = ?";
            String[] args = new String[] { rawContactId };
            int deleted = cr.delete(RawContacts.CONTENT_URI, selection, args);
            JSObject ret = new JSObject();
            ret.put("deleted", deleted);
            call.resolve(ret);
        } catch (Exception e) {
            Log.e(TAG, "deleteContactRaw failed", e);
            call.reject("Delete failed: " + e.getMessage());
        }
    }

    // -------- Load contacts with their source/account info --------

    @PluginMethod
    public void getContactsWithSources(PluginCall call) {
        if (!hasReadContacts()) {
            call.reject("READ_CONTACTS permission not granted");
            return;
        }

        JSArray contacts = new JSArray();
        ContentResolver cr = getContext().getContentResolver();

        String[] projection = new String[] {
            ContactsContract.Data.CONTACT_ID,
            ContactsContract.Data.RAW_CONTACT_ID,
            ContactsContract.Data.MIMETYPE,
            ContactsContract.Data.DISPLAY_NAME,
            ContactsContract.CommonDataKinds.Phone.NUMBER,
            ContactsContract.CommonDataKinds.Email.ADDRESS,
            ContactsContract.RawContacts.ACCOUNT_TYPE,
            ContactsContract.RawContacts.ACCOUNT_NAME
        };

        Cursor cursor = null;
        try {
            cursor = cr.query(ContactsContract.Data.CONTENT_URI, projection, null, null, null);
            if (cursor == null) {
                JSObject ret = new JSObject();
                ret.put("contacts", contacts);
                call.resolve(ret);
                return;
            }

            java.util.HashMap<String, JSONObject> map = new java.util.HashMap<>();

            while (cursor.moveToNext()) {
                String contactId = cursor.getString(cursor.getColumnIndex(ContactsContract.Data.CONTACT_ID));
                String rawId = cursor.getString(cursor.getColumnIndex(ContactsContract.Data.RAW_CONTACT_ID));
                String mime = cursor.getString(cursor.getColumnIndex(ContactsContract.Data.MIMETYPE));
                String name = cursor.getString(cursor.getColumnIndex(ContactsContract.Data.DISPLAY_NAME));
                String accountType = cursor.getString(cursor.getColumnIndex(ContactsContract.RawContacts.ACCOUNT_TYPE));
                String accountName = cursor.getString(cursor.getColumnIndex(ContactsContract.RawContacts.ACCOUNT_NAME));

                if (contactId == null) continue;

                try {
                    JSONObject entry = map.get(contactId);
                    if (entry == null) {
                        entry = new JSONObject();
                        entry.put("contactId", contactId);
                        entry.put("rawContactId", rawId == null ? "" : rawId);
                        entry.put("name", name == null ? "" : name);
                        entry.put("accountType", accountType == null ? JSONObject.NULL : accountType);
                        entry.put("accountName", accountName == null ? JSONObject.NULL : accountName);
                        entry.put("phone", "");
                        entry.put("email", "");
                        map.put(contactId, entry);
                    }

                    if (ContactsContract.CommonDataKinds.Phone.CONTENT_ITEM_TYPE.equals(mime)) {
                        String num = cursor.getString(cursor.getColumnIndex(ContactsContract.CommonDataKinds.Phone.NUMBER));
                        if (num != null && !num.isEmpty()) {
                            String existing = entry.optString("phone", "");
                            if (existing.isEmpty()) entry.put("phone", num);
                        }
                    } else if (ContactsContract.CommonDataKinds.Email.CONTENT_ITEM_TYPE.equals(mime)) {
                        String addr = cursor.getString(cursor.getColumnIndex(ContactsContract.CommonDataKinds.Email.ADDRESS));
                        if (addr != null && !addr.isEmpty()) {
                            String existing = entry.optString("email", "");
                            if (existing.isEmpty()) entry.put("email", addr);
                        }
                    }
                } catch (JSONException je) {
                    Log.w(TAG, "row parse failed", je);
                }
            }

            for (JSONObject obj : map.values()) {
                contacts.put(obj);
            }
        } catch (SecurityException se) {
            call.reject("Permission denied: " + se.getMessage());
            return;
        } catch (Exception e) {
            Log.e(TAG, "getContactsWithSources failed", e);
            call.reject("Load failed: " + e.getMessage());
            return;
        } finally {
            if (cursor != null) cursor.close();
        }

        JSObject ret = new JSObject();
        ret.put("contacts", contacts);
        call.resolve(ret);
    }

    // -------- Helpers --------

    private boolean hasReadContacts() {
        return ContextCompat.checkSelfPermission(getContext(), Manifest.permission.READ_CONTACTS) == PackageManager.PERMISSION_GRANTED;
    }

    private boolean hasWriteContacts() {
        return ContextCompat.checkSelfPermission(getContext(), Manifest.permission.WRITE_CONTACTS) == PackageManager.PERMISSION_GRANTED;
    }
}
