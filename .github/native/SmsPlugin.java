package com.neurasamu.build.chat;

import android.Manifest;
import android.content.ContentValues;
import android.content.Context;
import android.content.SharedPreferences;
import android.app.role.RoleManager;
import android.content.Intent;
import android.os.Build;
import android.net.Uri;
import android.os.Build;
import android.provider.Telephony;
import android.telephony.SmsManager;
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

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

@CapacitorPlugin(
    name = "SmsPlugin",
    permissions = {
        @Permission(alias = "sms", strings = {
            Manifest.permission.SEND_SMS,
            Manifest.permission.READ_SMS,
            Manifest.permission.RECEIVE_SMS
        }),
        @Permission(alias = "phone", strings = {
            Manifest.permission.READ_PHONE_STATE,
            Manifest.permission.READ_PHONE_NUMBERS
        })
    }
)
public class SmsPlugin extends Plugin {

    private static final String TAG = "NeuraSms";
    private static final String QUEUE_PREFS = "neura_sms_queue";
    private static final String QUEUE_KEY = "pending_sms";

    private static SmsPlugin instance;

    @Override
    public void load() {
        super.load();
        instance = this;
    }

    // ---- Called from SmsReceiver (may run when app is dead) ----
    public static void receiveIncomingSms(Context context, String sender, String body, long timestamp) {
        Log.d(TAG, "receiveIncomingSms from " + sender);

        // 1. Persist to Telephony.Sms.Inbox so other apps (and our own default
        //    SMS app contract) can see this message. Required when we are the
        //    default SMS app.
        try {
            ContentValues values = new ContentValues();
            values.put(Telephony.Sms.ADDRESS, sender);
            values.put(Telephony.Sms.BODY, body);
            values.put(Telephony.Sms.DATE, timestamp);
            values.put(Telephony.Sms.READ, 0);
            values.put(Telephony.Sms.SEEN, 0);
            values.put(Telephony.Sms.TYPE, Telephony.Sms.MESSAGE_TYPE_INBOX);
            context.getContentResolver().insert(Telephony.Sms.Inbox.CONTENT_URI, values);
        } catch (Exception e) {
            Log.w(TAG, "inbox write failed (not default SMS app?)", e);
        }

        // 2. Queue for our JS layer
        try {
            SharedPreferences prefs = context.getSharedPreferences(QUEUE_PREFS, Context.MODE_PRIVATE);
            String existing = prefs.getString(QUEUE_KEY, "[]");
            JSONArray arr = new JSONArray(existing);
            JSONObject item = new JSONObject();
            item.put("sender", sender == null ? "" : sender);
            item.put("body", body == null ? "" : body);
            item.put("timestamp", timestamp);
            arr.put(item);
            // Keep only last 200
            if (arr.length() > 200) {
                JSONArray trimmed = new JSONArray();
                for (int i = arr.length() - 200; i < arr.length(); i++) {
                    trimmed.put(arr.get(i));
                }
                arr = trimmed;
            }
            prefs.edit().putString(QUEUE_KEY, arr.toString()).apply();
        } catch (Exception e) {
            Log.e(TAG, "queue write failed", e);
        }

        // 3. Live notify if JS is listening
        if (instance != null) {
            JSObject data = new JSObject();
            data.put("sender", sender == null ? "" : sender);
            data.put("body", body == null ? "" : body);
            data.put("timestamp", timestamp);
            instance.notifyListeners("smsReceived", data);
        }
    }

    // ---- JS: drain queued SMS (called on app launch) ----
    @PluginMethod
    public void drainIncoming(PluginCall call) {
        try {
            SharedPreferences prefs = getContext().getSharedPreferences(QUEUE_PREFS, Context.MODE_PRIVATE);
            String existing = prefs.getString(QUEUE_KEY, "[]");
            prefs.edit().putString(QUEUE_KEY, "[]").apply();

            JSONArray arr = new JSONArray(existing);
            JSArray result = new JSArray();
            for (int i = 0; i < arr.length(); i++) {
                result.put(arr.getJSONObject(i));
            }

            JSObject ret = new JSObject();
            ret.put("messages", result);
            call.resolve(ret);
        } catch (Exception e) {
            Log.e(TAG, "drain failed", e);
            call.reject("drain failed: " + e.getMessage());
        }
    }

    // ---- Active SIM subscriptions ----
    @PluginMethod
    public void getActiveSubscriptions(PluginCall call) {
        JSArray result = new JSArray();
        try {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.LOLLIPOP_MR1) {
                JSObject ret = new JSObject();
                ret.put("subscriptions", result);
                call.resolve(ret);
                return;
            }
            if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.READ_PHONE_STATE) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
                call.reject("READ_PHONE_STATE permission not granted");
                return;
            }
            SubscriptionManager sm = (SubscriptionManager) getContext().getSystemService(Context.TELEPHONY_SUBSCRIPTION_SERVICE);
            if (sm != null) {
                List<SubscriptionInfo> subs = sm.getActiveSubscriptionInfoList();
                if (subs != null) {
                    for (SubscriptionInfo info : subs) {
                        JSObject sub = new JSObject();
                        sub.put("subscriptionId", info.getSubscriptionId());
                        sub.put("slotIndex", info.getSimSlotIndex());
                        sub.put("label", "SIM " + (info.getSimSlotIndex() + 1));
                        CharSequence carrierName = info.getCarrierName();
                        if (carrierName != null) sub.put("carrierName", carrierName.toString());
                        CharSequence displayName = info.getDisplayName();
                        if (displayName != null) sub.put("displayName", displayName.toString());
                        result.put(sub);
                    }
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "getActiveSubscriptions failed", e);
            call.reject("Failed: " + e.getMessage());
            return;
        }
        JSObject ret = new JSObject();
        ret.put("subscriptions", result);
        call.resolve(ret);
    }

    // ---- Send SMS (with optional subscriptionId) ----
    @PluginMethod
    public void sendDirectSMS(PluginCall call) {
        String phone = call.getString("phone");
        String message = call.getString("message");
        Integer subscriptionId = call.getInt("subscriptionId");

        if (phone == null || message == null) {
            call.reject("Phone and message parameters are required.");
            return;
        }

        try {
            SmsManager smsManager;
            if (subscriptionId != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP_MR1) {
                smsManager = SmsManager.getSmsManagerForSubscriptionId(subscriptionId);
            } else {
                smsManager = SmsManager.getDefault();
            }

            ArrayList<String> parts = smsManager.divideMessage(message);
            if (parts.size() > 1) {
                smsManager.sendMultipartTextMessage(phone, null, parts, null, null);
            } else {
                smsManager.sendTextMessage(phone, null, message, null, null);
            }

            // Also persist to Telephony.Sms.Sent if we're the default SMS app
            try {
                ContentValues values = new ContentValues();
                values.put(Telephony.Sms.ADDRESS, phone);
                values.put(Telephony.Sms.BODY, message);
                values.put(Telephony.Sms.DATE, System.currentTimeMillis());
                values.put(Telephony.Sms.READ, 1);
                values.put(Telephony.Sms.SEEN, 1);
                values.put(Telephony.Sms.TYPE, Telephony.Sms.MESSAGE_TYPE_SENT);
                getContext().getContentResolver().insert(Telephony.Sms.Sent.CONTENT_URI, values);
            } catch (Exception ignore) {}

            JSObject ret = new JSObject();
            ret.put("status", "sent");
            if (subscriptionId != null) ret.put("subscriptionId", subscriptionId);
            call.resolve(ret);
        } catch (Exception e) {
            Log.e(TAG, "sendDirectSMS failed", e);
            call.reject("SMS transmission failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void isDefaultSmsApp(PluginCall call) {
        boolean isDefault = false;
        try {
            String pkg = getContext().getPackageName();
            String defaultPkg = Telephony.Sms.getDefaultSmsPackage(getContext());
            isDefault = pkg.equals(defaultPkg);
        } catch (Exception e) {
            Log.w(TAG, "isDefaultSmsApp check failed", e);
        }
        JSObject ret = new JSObject();
        ret.put("isDefault", isDefault);
        call.resolve(ret);
    }

    @PluginMethod
    public void requestDefaultSmsRole(PluginCall call) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                RoleManager rm = (RoleManager) getContext().getSystemService(Context.ROLE_SERVICE);
                if (rm != null && rm.isRoleAvailable(RoleManager.ROLE_SMS) && !rm.isRoleHeld(RoleManager.ROLE_SMS)) {
                    Intent intent = rm.createRequestRoleIntent(RoleManager.ROLE_SMS);
                    getActivity().startActivity(intent);
                    JSObject ret = new JSObject();
                    ret.put("launched", true);
                    call.resolve(ret);
                    return;
                }
            } else {
                // Pre-Android 10 fallback
                Intent intent = new Intent(Telephony.Sms.Intents.ACTION_CHANGE_DEFAULT);
                intent.putExtra(Telephony.Sms.Intents.EXTRA_PACKAGE_NAME, getContext().getPackageName());
                getActivity().startActivity(intent);
                JSObject ret = new JSObject();
                ret.put("launched", true);
                call.resolve(ret);
                return;
            }
        } catch (Exception e) {
            Log.e(TAG, "requestDefaultSmsRole failed", e);
            call.reject("Request failed: " + e.getMessage());
            return;
        }
        JSObject ret = new JSObject();
        ret.put("launched", false);
        call.resolve(ret);
    }
}
