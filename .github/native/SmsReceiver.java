package com.neurasamu.build.chat;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.provider.Telephony;
import android.telephony.SmsMessage;
import android.util.Log;

public class SmsReceiver extends BroadcastReceiver {
    private static final String TAG = "NeuraSmsReceiver";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        if (!Telephony.Sms.Intents.SMS_DELIVER_ACTION.equals(action)
                && !Telephony.Sms.Intents.SMS_RECEIVED_ACTION.equals(action)) {
            return;
        }

        try {
            SmsMessage[] messages = Telephony.Sms.Intents.getMessagesFromIntent(intent);
            if (messages == null || messages.length == 0) return;

            // Concatenate multi-part SMS from same sender
            StringBuilder body = new StringBuilder();
            String sender = null;
            long timestamp = System.currentTimeMillis();

            for (SmsMessage m : messages) {
                if (m == null) continue;
                if (sender == null) sender = m.getDisplayOriginatingAddress();
                String part = m.getMessageBody();
                if (part != null) body.append(part);
                timestamp = m.getTimestampMillis();
            }

            // 1. Persist + queue for app inbox
            // Drop messages from blocked numbers before anything else runs.
            if (sender != null && BlockedStore.isBlocked(context, sender)) {
                Log.d(TAG, "dropped blocked SMS from " + sender);
                return;
            }

            SmsPlugin.receiveIncomingSms(context, sender, body.toString(), timestamp);
            // 2. Show notification with Reply + Mark as read
            SmsNotifier.show(context, sender, body.toString(), timestamp);
        } catch (Exception e) {
            Log.e(TAG, "onReceive failed", e);
        }
    }
}
