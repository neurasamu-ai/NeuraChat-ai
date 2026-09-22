package com.neurasamu.build.chat;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.os.Build;
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

            if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.READ_PHONE_STATE) != PackageManager.PERMISSION_GRANTED) {
                call.reject("READ_PHONE_STATE permission not granted");
                return;
            }

            SubscriptionManager sm = (SubscriptionManager) getContext().getSystemService(Context.TELEPHONY_SUBSCRIPTION_SERVICE);
            if (sm == null) {
                JSObject ret = new JSObject();
                ret.put("subscriptions", result);
                call.resolve(ret);
                return;
            }

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
        } catch (SecurityException se) {
            call.reject("Permission denied: " + se.getMessage());
            return;
        } catch (Exception e) {
            Log.e(TAG, "getActiveSubscriptions failed", e);
            call.reject("Failed: " + e.getMessage());
            return;
        }

        JSObject ret = new JSObject();
        ret.put("subscriptions", result);
        call.resolve(ret);
    }

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

            JSObject ret = new JSObject();
            ret.put("status", "sent");
            if (subscriptionId != null) ret.put("subscriptionId", subscriptionId);
            call.resolve(ret);
        } catch (Exception e) {
            Log.e(TAG, "sendDirectSMS failed", e);
            call.reject("SMS transmission failed: " + e.getMessage());
        }
    }
}
