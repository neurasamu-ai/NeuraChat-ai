package com.neurasamu.neurachat;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.provider.Telephony;
import android.util.Log;

public class SmsReceiver extends BroadcastReceiver {
    private static final String TAG = "NeuraSmsReceiver";
    @Override
    public void onReceive(Context context, Intent intent) {
        if (Telephony.Sms.Intents.SMS_DELIVER_ACTION.equals(intent.getAction())) {
            Log.d(TAG, "SMS delivery broadcast intercepted successfully.");
        }
    }
}
