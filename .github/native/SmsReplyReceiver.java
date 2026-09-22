package com.neurasamu.build.chat;

import android.app.NotificationManager;
import android.content.BroadcastReceiver;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.provider.Telephony;
import android.telephony.SmsManager;
import android.util.Log;

import androidx.core.app.NotificationManagerCompat;
import androidx.core.app.RemoteInput;

public class SmsReplyReceiver extends BroadcastReceiver {

    private static final String TAG = "NeuraSmsReply";
    public static final String ACTION_REPLY = "com.neurasamu.build.chat.SMS_REPLY";
    public static final String ACTION_MARK_READ = "com.neurasamu.build.chat.SMS_MARK_READ";
    public static final String KEY_REPLY_TEXT = "neura_reply_text";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        String sender = intent.getStringExtra("sender");
        int notifId = intent.getIntExtra("notification_id", 8001);

        if (ACTION_REPLY.equals(action)) {
            CharSequence replyText = null;
            Bundle results = RemoteInput.getResultsFromIntent(intent);
            if (results != null) {
                replyText = results.getCharSequence(KEY_REPLY_TEXT);
            }
            if (replyText == null || sender == null) {
                Log.w(TAG, "Reply action had no text or sender");
                return;
            }
            handleReply(context, sender, replyText.toString(), notifId);
        } else if (ACTION_MARK_READ.equals(action)) {
            try {
                NotificationManagerCompat.from(context).cancel(notifId);
            } catch (Exception e) {
                Log.w(TAG, "cancel failed", e);
            }
            // Optionally mark SMS as read in Telephony inbox
            try {
                ContentValues values = new ContentValues();
                values.put(Telephony.Sms.READ, 1);
                values.put(Telephony.Sms.SEEN, 1);
                String where = Telephony.Sms.ADDRESS + " = ? AND " + Telephony.Sms.READ + " = 0";
                context.getContentResolver().update(
                    Telephony.Sms.Inbox.CONTENT_URI,
                    values,
                    where,
                    new String[] { sender == null ? "" : sender }
                );
            } catch (Exception e) {
                Log.w(TAG, "mark-read failed", e);
            }
        }
    }

    private void handleReply(Context context, String sender, String text, int notifId) {
        try {
            SmsManager smsManager = SmsManager.getDefault();
            java.util.ArrayList<String> parts = smsManager.divideMessage(text);
            if (parts.size() > 1) {
                smsManager.sendMultipartTextMessage(sender, null, parts, null, null);
            } else {
                smsManager.sendTextMessage(sender, null, text, null, null);
            }

            // Persist to Telephony.Sms.Sent (as default SMS app)
            try {
                ContentValues values = new ContentValues();
                values.put(Telephony.Sms.ADDRESS, sender);
                values.put(Telephony.Sms.BODY, text);
                values.put(Telephony.Sms.DATE, System.currentTimeMillis());
                values.put(Telephony.Sms.READ, 1);
                values.put(Telephony.Sms.SEEN, 1);
                values.put(Telephony.Sms.TYPE, Telephony.Sms.MESSAGE_TYPE_SENT);
                context.getContentResolver().insert(Telephony.Sms.Sent.CONTENT_URI, values);
            } catch (Exception ignore) {}

            // Also queue to app inbox so it shows in NeuraChat chat
            SmsPlugin.receiveIncomingSms(context, sender, text, System.currentTimeMillis());
            // Note: this queues as incoming; message body will appear in chat.

            try {
                NotificationManagerCompat.from(context).cancel(notifId);
            } catch (Exception ignore) {}
        } catch (Exception e) {
            Log.e(TAG, "handleReply failed", e);
        }
    }
}
