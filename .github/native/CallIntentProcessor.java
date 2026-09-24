package com.neurasamu.build.chat;

import android.app.Activity;
import android.app.role.RoleManager;
import android.content.ComponentName;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.telecom.TelecomManager;
import android.util.Log;

// Intercepts ACTION_CALL. When NeuraChat is the default dialer we let the
// normal Telecom flow handle it (this activity just finishes). When we are
// not the default dialer we forward the intent to the system dialer while
// excluding our own package so we don't loop back into this activity.
public class CallIntentProcessor extends Activity {

    private static final String TAG = "NeuraCallIntent";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        Intent intent = getIntent();
        String scheme = intent != null && intent.getData() != null
            ? intent.getData().getScheme()
            : null;
        Log.d(TAG, "CallIntentProcessor action=" + (intent != null ? intent.getAction() : "null")
            + " scheme=" + scheme);

        if (isDefaultDialer()) {
            // We are the default dialer; the platform already routed this call
            // through our InCallService (CallService). Just finish.
            Log.d(TAG, "default dialer, deferring to Telecom");
            finish();
            return;
        }

        // Not default dialer: re-dispatch to the system dialer, excluding us.
        try {
            Intent forward = new Intent(intent);
            forward.setComponent(null);
            if (getPackageName() != null) {
                forward.setPackage(null);
            }
            // Use ACTION_DIAL instead of ACTION_CALL: on non-default dialers,
            // ACTION_DIAL is always routed to the actual system dialer and
            // does not require CALL_PHONE.
            forward.setAction(Intent.ACTION_DIAL);
            forward.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(forward);
            Log.d(TAG, "forwarded to system dialer");
        } catch (Exception e) {
            Log.e(TAG, "forward failed", e);
        }

        finish();
    }

    private boolean isDefaultDialer() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                RoleManager rm = (RoleManager) getSystemService(ROLE_SERVICE);
                if (rm != null) {
                    return rm.isRoleHeld(RoleManager.ROLE_DIALER);
                }
            }
            TelecomManager tm = (TelecomManager) getSystemService(TELECOM_SERVICE);
            if (tm != null) {
                return getPackageName().equals(tm.getDefaultDialerPackage());
            }
        } catch (Exception e) {
            Log.w(TAG, "isDefaultDialer failed", e);
        }
        return false;
    }
}
