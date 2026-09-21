package com.neurasamu.build.chat;

import android.app.IntentService;
import android.content.Intent;
import android.util.Log;

public class HeadlessSmsSendService extends IntentService {
    private static final String TAG = "NeuraHeadlessSms";
    public HeadlessSmsSendService() {
        super("HeadlessSmsSendService");
    }
    @Override
    protected void onHandleIntent(Intent intent) {
        Log.d(TAG, "Background SMS headless service active.");
    }
}
