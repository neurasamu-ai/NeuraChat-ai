package com.neurasamu.build.chat;

import android.telephony.SmsManager;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "SmsPlugin")
public class SmsPlugin extends Plugin {

    @PluginMethod
    public void sendDirectSMS(PluginCall call) {
        String phone = call.getString("phone");
        String message = call.getString("message");

        if (phone == null || message == null) {
            call.reject("Phone and message parameters are required.");
            return;
        }

        try {
            SmsManager smsManager = SmsManager.getDefault();
            // Automatically handles multi-part messages if the message is long (> 70 chars)
            if (message.length() > 70) {
                java.util.ArrayList<String> parts = smsManager.divideMessage(message);
                smsManager.sendMultipartTextMessage(phone, null, parts, null, null);
            } else {
                smsManager.sendTextMessage(phone, null, message, null, null);
            }
            JSObject ret = new JSObject();
            ret.put("status", "sent");
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("SMS transmission failed: " + e.getMessage());
        }
    }
}
