package com.neurasamu.neurachat;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.provider.Telephony;
import android.util.Log;

public class MmsReceiver extends BroadcastReceiver {
    private static final String TAG = "NeuraMmsReceiver";
    @Override
    public void onReceive(Context context, Intent intent) {
        if (Telephony.Sms.Intents.WAP_PUSH_DELIVER_ACTION.equals(intent.getAction())) {
            Log.d(TAG, "WAP MMS delivery broadcast intercepted successfully.");
        }
    }
}
