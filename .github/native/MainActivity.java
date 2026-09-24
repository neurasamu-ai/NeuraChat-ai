package com.neurasamu.build.chat;

import android.Manifest;
import android.content.pm.PackageManager;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;

import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.core.content.ContextCompat;

import com.getcapacitor.BridgeActivity;

import java.util.ArrayList;
import java.util.List;

public class MainActivity extends BridgeActivity {

    private static final String TAG = "NeuraMain";
    private boolean permissionsRequested = false;

    // Pending navigation requested by a notification or system intent.
    // Read + cleared by SmsPlugin.getPendingNavigation().
    public static String pendingOpenChatWith = null;
    public static String pendingOpenChatName = null;
    public static boolean pendingOpenCallLog = false;

    private final ActivityResultLauncher<String[]> permissionLauncher =
        registerForActivityResult(
            new ActivityResultContracts.RequestMultiplePermissions(),
            result -> Log.d(TAG, "Permissions result: " + result)
        );

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // IMPORTANT: registerPlugin must be called BEFORE super.onCreate().
        // Capacitor builds its plugin registry during BridgeActivity.onCreate,
        // so plugins registered after it are never exposed to JS.
        registerPlugin(SmsPlugin.class);
        registerPlugin(TelecomPlugin.class);
        registerPlugin(SettingsPlugin.class);
        registerPlugin(NeuraContactsPlugin.class);

        super.onCreate(savedInstanceState);

        extractNavigationExtras(getIntent());
        requestAllPermissions();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        extractNavigationExtras(intent);
    }

    private void extractNavigationExtras(Intent intent) {
        if (intent == null) return;
        try {
            String chatWith = intent.getStringExtra("open_chat_with");
            if (chatWith != null && !chatWith.isEmpty()) {
                pendingOpenChatWith = chatWith;
                pendingOpenChatName = intent.getStringExtra("open_chat_name");
            }
            if (intent.getBooleanExtra("open_call_log", false)) {
                pendingOpenCallLog = true;
            }
        } catch (Exception e) {
            Log.w(TAG, "extractNavigationExtras failed", e);
        }
    }

    private void requestAllPermissions() {
        if (permissionsRequested) return;
        permissionsRequested = true;

        List<String> perms = new ArrayList<>();
        perms.add(Manifest.permission.READ_SMS);
        perms.add(Manifest.permission.SEND_SMS);
        perms.add(Manifest.permission.RECEIVE_SMS);
        perms.add(Manifest.permission.READ_CONTACTS);
        perms.add(Manifest.permission.WRITE_CONTACTS);
        perms.add("android.permission.GET_ACCOUNTS");
        perms.add(Manifest.permission.CALL_PHONE);
        perms.add(Manifest.permission.READ_PHONE_STATE);
        perms.add(Manifest.permission.READ_PHONE_NUMBERS);
        perms.add(Manifest.permission.READ_CALL_LOG);
        perms.add(Manifest.permission.WRITE_CALL_LOG);
        perms.add(Manifest.permission.CAMERA);
        perms.add(Manifest.permission.RECORD_AUDIO);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            perms.add(Manifest.permission.POST_NOTIFICATIONS);
        }

        List<String> missing = new ArrayList<>();
        for (String p : perms) {
            if (ContextCompat.checkSelfPermission(this, p) != PackageManager.PERMISSION_GRANTED) {
                missing.add(p);
            }
        }

        if (missing.isEmpty()) {
            Log.d(TAG, "All permissions already granted");
            return;
        }

        Log.d(TAG, "Requesting permissions: " + missing);

        // Post to UI thread after activity is fully created
        getWindow().getDecorView().postDelayed(() -> {
            try {
                permissionLauncher.launch(missing.toArray(new String[0]));
            } catch (Exception e) {
                Log.e(TAG, "launch failed", e);
            }
        }, 300);
    }
}
