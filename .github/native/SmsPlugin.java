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
        enqueue(context, sender, body, timestamp, "incoming");
    }

    // Called when this app sends an SMS (from chat, SIM picker, or notification reply).
    public static void receiveOutgoingSms(Context context, String recipient, String body, long timestamp) {
        enqueue(context, recipient, body, timestamp, "outgoing");
    }

    private static void enqueue(Context context, String address, String body, long timestamp, String direction) {
        Log.d(TAG, "enqueue " + direction + " with " + address);

        // 1. Persist to the system SMS provider (Inbox for incoming, Sent for
        //    outgoing). Required when we hold the default SMS app role.
        try {
            boolean isOutgoing = "outgoing".equals(direction);
            ContentValues values = new ContentValues();
            values.put(Telephony.Sms.ADDRESS, address);
            values.put(Telephony.Sms.BODY, body);
            values.put(Telephony.Sms.DATE, timestamp);
            values.put(Telephony.Sms.READ, isOutgoing ? 1 : 0);
            values.put(Telephony.Sms.SEEN, isOutgoing ? 1 : 0);
            values.put(Telephony.Sms.TYPE, isOutgoing
                ? Telephony.Sms.MESSAGE_TYPE_SENT
                : Telephony.Sms.MESSAGE_TYPE_INBOX);
            android.net.Uri target = isOutgoing
                ? Telephony.Sms.Sent.CONTENT_URI
                : Telephony.Sms.Inbox.CONTENT_URI;
            context.getContentResolver().insert(target, values);
        } catch (Exception e) {
            Log.w(TAG, "provider write failed (not default SMS app?)", e);
        }

        // 2. Queue for our JS layer
        try {
            SharedPreferences prefs = context.getSharedPreferences(QUEUE_PREFS, Context.MODE_PRIVATE);
            String existing = prefs.getString(QUEUE_KEY, "[]");
            JSONArray arr = new JSONArray(existing);
            JSONObject item = new JSONObject();
            item.put("address", address == null ? "" : address);
            item.put("body", body == null ? "" : body);
            item.put("timestamp", timestamp);
            item.put("direction", direction);
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
            data.put("sender", address == null ? "" : address);
            data.put("address", address == null ? "" : address);
            data.put("body", body == null ? "" : body);
            data.put("timestamp", timestamp);
            data.put("direction", direction);
            instance.notifyListeners(direction.equals("outgoing") ? "smsSent" : "smsReceived", data);
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

            // Persist + queue as outgoing so the app shows it as sent.
            receiveOutgoingSms(getContext(), phone, message, System.currentTimeMillis());

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
