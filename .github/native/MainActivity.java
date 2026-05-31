package com.neurasamu.neurachat;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Direct Custom native background SMS plugin registration
        registerPlugin(SmsPlugin.class);
    }
}
