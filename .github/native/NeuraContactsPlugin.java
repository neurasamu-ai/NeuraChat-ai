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
                // Include the account email so the user can tell multiple
                // Google accounts apart in the Save-to dropdown.
                String friendlyType = isGoogle ? "Google" : "Exchange";
                String label = (a.name != null && !a.name.isEmpty())
                    ? friendlyType + " · " + a.name
                    : friendlyType;
                acc.put("label", label);
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

        java.util.HashMap<String, JSONObject> map = new java.util.HashMap<>();

        // 1. Aggregated contacts: use Contacts._ID + DISPLAY_NAME_PRIMARY
        // (the same merged view the default phone/dialer app uses). This is
        // stable across multiple accounts/SIMs pointing at the same person.
        Cursor cc = null;
        try {
            cc = cr.query(
                ContactsContract.Contacts.CONTENT_URI,
                new String[] {
                    ContactsContract.Contacts._ID,
                    ContactsContract.Contacts.DISPLAY_NAME_PRIMARY,
                    ContactsContract.Contacts.PHOTO_URI,
                    ContactsContract.Contacts.STARRED
                },
                null, null, null
            );
            if (cc != null) {
                int iId = cc.getColumnIndex(ContactsContract.Contacts._ID);
                int iName = cc.getColumnIndex(ContactsContract.Contacts.DISPLAY_NAME_PRIMARY);
                int iPhoto = cc.getColumnIndex(ContactsContract.Contacts.PHOTO_URI);
                int iStar = cc.getColumnIndex(ContactsContract.Contacts.STARRED);
                while (cc.moveToNext()) {
                    String cid = cc.getString(iId);
                    if (cid == null) continue;
                    String name = cc.getString(iName);
                    String photo = cc.getString(iPhoto);
                    int starred = cc.getInt(iStar);
                    try {
                        JSONObject o = new JSONObject();
                        o.put("contactId", cid);
                        o.put("rawContactId", "");
                        o.put("name", name == null ? "" : name);
                        o.put("accountType", JSONObject.NULL);
                        o.put("accountName", JSONObject.NULL);
                        o.put("phone", "");
                        o.put("email", "");
                        o.put("photoUri", photo == null ? "" : photo);
                        o.put("favorite", starred == 1);
                        map.put(cid, o);
                    } catch (JSONException je) {
                        Log.w(TAG, "contact row parse failed", je);
                    }
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "aggregated contact query failed", e);
        } finally {
            if (cc != null) cc.close();
        }

        // 2. Phones: prefer super-primary, then primary, then first.
        Cursor pc = null;
        try {
            pc = cr.query(
                ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
                new String[] {
                    ContactsContract.CommonDataKinds.Phone.CONTACT_ID,
                    ContactsContract.CommonDataKinds.Phone.NUMBER,
                    ContactsContract.CommonDataKinds.Phone.IS_SUPER_PRIMARY,
                    ContactsContract.CommonDataKinds.Phone.IS_PRIMARY
                },
                null, null, null
            );
            if (pc != null) {
                int iCid = pc.getColumnIndex(ContactsContract.CommonDataKinds.Phone.CONTACT_ID);
                int iNum = pc.getColumnIndex(ContactsContract.CommonDataKinds.Phone.NUMBER);
                int iSuper = pc.getColumnIndex(ContactsContract.CommonDataKinds.Phone.IS_SUPER_PRIMARY);
                int iPrim = pc.getColumnIndex(ContactsContract.CommonDataKinds.Phone.IS_PRIMARY);
                while (pc.moveToNext()) {
                    String cid = pc.getString(iCid);
                    if (cid == null) continue;
                    JSONObject o = map.get(cid);
                    if (o == null) continue;
                    String num = pc.getString(iNum);
                    if (num == null || num.isEmpty()) continue;
                    boolean superPrim = iSuper >= 0 && pc.getInt(iSuper) == 1;
                    boolean prim = iPrim >= 0 && pc.getInt(iPrim) == 1;
                    String existing = o.optString("phone", "");
                    if (existing.isEmpty() || superPrim || (prim && !existing.equals(num))) {
                        try { o.put("phone", num); } catch (JSONException ignore) {}
                    }
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "phone query failed", e);
        } finally {
            if (pc != null) pc.close();
        }

        // 3. Emails: prefer primary, then first.
        Cursor ec = null;
        try {
            ec = cr.query(
                ContactsContract.CommonDataKinds.Email.CONTENT_URI,
                new String[] {
                    ContactsContract.CommonDataKinds.Email.CONTACT_ID,
                    ContactsContract.CommonDataKinds.Email.ADDRESS,
                    ContactsContract.CommonDataKinds.Email.IS_PRIMARY
                },
                null, null, null
            );
            if (ec != null) {
                int iCid = ec.getColumnIndex(ContactsContract.CommonDataKinds.Email.CONTACT_ID);
                int iAddr = ec.getColumnIndex(ContactsContract.CommonDataKinds.Email.ADDRESS);
                int iPrim = ec.getColumnIndex(ContactsContract.CommonDataKinds.Email.IS_PRIMARY);
                while (ec.moveToNext()) {
                    String cid = ec.getString(iCid);
                    if (cid == null) continue;
                    JSONObject o = map.get(cid);
                    if (o == null) continue;
                    String addr = ec.getString(iAddr);
                    if (addr == null || addr.isEmpty()) continue;
                    boolean prim = iPrim >= 0 && ec.getInt(iPrim) == 1;
                    String existing = o.optString("email", "");
                    if (existing.isEmpty() || prim) {
                        try { o.put("email", addr); } catch (JSONException ignore) {}
                    }
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "email query failed", e);
        } finally {
            if (ec != null) ec.close();
        }

        // 4. Raw-contact account: pick the highest-priority source per
        // aggregated contact (Google > Exchange > other > local > SIM).
        Cursor rc = null;
        try {
            rc = cr.query(
                ContactsContract.RawContacts.CONTENT_URI,
                new String[] {
                    ContactsContract.RawContacts._ID,
                    ContactsContract.RawContacts.CONTACT_ID,
                    ContactsContract.RawContacts.ACCOUNT_TYPE,
                    ContactsContract.RawContacts.ACCOUNT_NAME
                },
                null, null, null
            );
            if (rc != null) {
                int iRaw = rc.getColumnIndex(ContactsContract.RawContacts._ID);
                int iCid = rc.getColumnIndex(ContactsContract.RawContacts.CONTACT_ID);
                int iType = rc.getColumnIndex(ContactsContract.RawContacts.ACCOUNT_TYPE);
                int iName = rc.getColumnIndex(ContactsContract.RawContacts.ACCOUNT_NAME);
                while (rc.moveToNext()) {
                    String cid = rc.getString(iCid);
                    if (cid == null) continue;
                    JSONObject o = map.get(cid);
                    if (o == null) continue;
                    String rawId = rc.getString(iRaw);
                    String at = rc.getString(iType);
                    String an = rc.getString(iName);

                    String existingType = null;
                    try {
                        existingType = o.isNull("accountType") ? null : o.optString("accountType", null);
                    } catch (Exception ignore) {}

                    if (accountPriority(at) > accountPriority(existingType)) {
                        try {
                            o.put("accountType", at == null ? JSONObject.NULL : at);
                            o.put("accountName", an == null ? JSONObject.NULL : an);
                            o.put("rawContactId", rawId == null ? "" : rawId);
                        } catch (JSONException ignore) {}
                    }
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "raw contact query failed", e);
        } finally {
            if (rc != null) rc.close();
        }

        for (JSONObject obj : map.values()) {
            contacts.put(obj);
        }

        JSObject ret = new JSObject();
        ret.put("contacts", contacts);
        call.resolve(ret);
    }


    // Priority of an account source. Higher wins when merging display info.
    private static int accountPriority(String accountType) {
        if (accountType == null) return 1;              // local/device
        if ("com.google".equals(accountType)) return 5;  // Google
        if (accountType.startsWith("com.android.exchange")) return 4;
        if (accountType.startsWith("com.android.contacts.sim")) return 0; // SIM
        return 2;                                        // other cloud/local
    }

    // -------- Helpers --------

    private boolean hasReadContacts() {
        return ContextCompat.checkSelfPermission(getContext(), Manifest.permission.READ_CONTACTS) == PackageManager.PERMISSION_GRANTED;
    }

    private boolean hasWriteContacts() {
        return ContextCompat.checkSelfPermission(getContext(), Manifest.permission.WRITE_CONTACTS) == PackageManager.PERMISSION_GRANTED;
    }

    // Update a raw contact at its source (Device / Google / SIM). Uses
    // ContactsContract.Data rows so the change reflects in the system
    // contacts database, not just in the app.
    @PluginMethod
    public void updateContact(PluginCall call) {
        if (!hasWriteContacts()) {
            call.reject("WRITE_CONTACTS permission not granted");
            return;
        }
        String rawContactId = call.getString("rawContactId");
        String name = call.getString("name", "");
        String phone = call.getString("phone", "");
        String email = call.getString("email", "");

        if (rawContactId == null || rawContactId.isEmpty()) {
            call.reject("rawContactId is required");
            return;
        }

        try {
            ContentResolver cr = getContext().getContentResolver();
            ArrayList<ContentProviderOperation> ops = new ArrayList<>();

            // Name (StructuredName)
            if (name != null && !name.isEmpty()) {
                ops.add(ContentProviderOperation.newUpdate(ContactsContract.Data.CONTENT_URI)
                    .withSelection(
                        ContactsContract.Data.RAW_CONTACT_ID + "=? AND " +
                        ContactsContract.Data.MIMETYPE + "=?",
                        new String[] { rawContactId, StructuredName.CONTENT_ITEM_TYPE })
                    .withValue(StructuredName.DISPLAY_NAME, name)
                    .withValue(StructuredName.GIVEN_NAME, name)
                    .build());
            }

            // Phone (first one) — replace it
            if (phone != null && !phone.isEmpty()) {
                ops.add(ContentProviderOperation.newUpdate(ContactsContract.Data.CONTENT_URI)
                    .withSelection(
                        ContactsContract.Data.RAW_CONTACT_ID + "=? AND " +
                        ContactsContract.Data.MIMETYPE + "=?",
                        new String[] { rawContactId, Phone.CONTENT_ITEM_TYPE })
                    .withValue(Phone.NUMBER, phone)
                    .build());
            }

            // Email (first one) — replace it
            if (email != null && !email.isEmpty()) {
                ops.add(ContentProviderOperation.newUpdate(ContactsContract.Data.CONTENT_URI)
                    .withSelection(
                        ContactsContract.Data.RAW_CONTACT_ID + "=? AND " +
                        ContactsContract.Data.MIMETYPE + "=?",
                        new String[] { rawContactId, Email.CONTENT_ITEM_TYPE })
                    .withValue(Email.ADDRESS, email)
                    .build());
            }

            if (ops.isEmpty()) {
                call.reject("Nothing to update");
                return;
            }

            android.content.ContentProviderResult[] results =
                cr.applyBatch(ContactsContract.AUTHORITY, ops);

            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("updated", results != null ? results.length : 0);
            call.resolve(ret);
        } catch (Exception e) {
            Log.e(TAG, "updateContact failed", e);
            call.reject("Update failed: " + e.getMessage());
        }
    }
}
