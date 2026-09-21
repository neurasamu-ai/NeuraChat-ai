package com.neurasamu.build.chat;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        registerPlugin(SmsPlugin.class);
        registerPlugin(TelecomPlugin.class);
        registerPlugin(SettingsPlugin.class);
    }
}
