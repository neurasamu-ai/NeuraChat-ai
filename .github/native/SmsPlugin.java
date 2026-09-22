package com.neurasamu.build.chat;

import android.os.Build;
import android.telephony.SmsManager;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;

import java.util.ArrayList;

@CapacitorPlugin(
    name = "SmsPlugin",
    permissions = {
        @Permission(alias = "sms", strings = {
            android.Manifest.permission.SEND_SMS,
            android.Manifest.permission.READ_SMS,
            android.Manifest.permission.RECEIVE_SMS
        })
    }
)
public class SmsPlugin extends Plugin {

    private static final String TAG = "NeuraSms";

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
