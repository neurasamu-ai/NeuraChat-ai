package com.neurasamu.neurachat;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.provider.Telephony;
import android.telephony.SmsMessage;

public class SmsReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (Telephony.Sms.Intents.SMS_DELIVER_ACTION.equals(intent.getAction())) {
            SmsMessage[] messages = Telephony.Sms.Intents.getMessagesFromIntent(intent);
            if (messages != null) {
                for (SmsMessage message : messages) {
                    String sender = message.getDisplayOriginatingAddress();
                    String body = message.getMessageBody();
                    // TODO: Store in local DB or notify app
                }
            }
        }
    }
}
