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

            // BLOCK CHECK FIRST — before anything else runs.
            if (sender != null && BlockedStore.isBlocked(context, sender)) {
                Log.d(TAG, "blocked SMS from " + sender + " — aborting broadcast");

                // Abort so the SMS does not go to other apps (SMS_RECEIVED
                // is the ordered broadcast other apps receive). SMS_DELIVER
                // is only sent to the default SMS app, so abort is a no-op
                // there — but we also skip writing to the system inbox
                // below, so a blocked SMS never lands anywhere.
                try {
                    abortBroadcast();
                } catch (Exception e) {
                    Log.w(TAG, "abortBroadcast failed", e);
                }
                return;
            }

            // Extract the subscription (SIM) that delivered this SMS so
            // names + notifications can resolve using that SIM's contacts.
            int subId = -1;
            try {
                subId = intent.getIntExtra("subscription", -1);
            } catch (Exception ignore) {}
            if (subId < 0) {
                try {
                    subId = intent.getIntExtra("subscription_id", -1);
                } catch (Exception ignore) {}
            }

            // Persist + queue for the app inbox and notify.
            SmsPlugin.receiveIncomingSms(context, sender, body.toString(), timestamp, subId);
            SmsNotifier.show(context, sender, body.toString(), timestamp, subId);

            // VIP: wake-up alarm for special contacts.
            try {
                if (sender != null && VipContactStore.isVip(context, sender)) {
                    Log.d(TAG, "VIP SMS from " + sender + " - launching alarm");
                    VipAlarmActivity.launch(context, sender, "", body.toString());
                }
            } catch (Exception e) {
                Log.w(TAG, "VIP alarm launch failed", e);
            }
        } catch (Exception e) {
            Log.e(TAG, "onReceive failed", e);
        }
    }
}
