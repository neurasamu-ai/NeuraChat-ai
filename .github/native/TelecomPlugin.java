package com.neurasamu.build.chat;

import android.content.Context;
import android.media.AudioManager;
import android.telecom.Call;
import android.app.role.RoleManager;
import android.content.Intent;
import android.net.Uri;
import android.telecom.TelecomManager;
import android.telecom.PhoneAccountHandle;
import java.util.List;
import android.os.Build;
import android.util.Log;
import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.ActivityCallback;

@CapacitorPlugin(name = "TelecomPlugin")
public class TelecomPlugin extends Plugin {

    private static final String TAG = "NeuraTelecom";
    private static TelecomPlugin instance;

    @Override
    public void load() {
        super.load();
        instance = this;
    }

    public static void dispatchCallState(String state, String number) {
        if (instance != null) {
            JSObject data = new JSObject();
            data.put("state", state);
            data.put("number", number);
            instance.notifyListeners("callStateChanged", data);
        }
    }

    // NAYA LOGIC: Request Default Dialer Pop-up
    @PluginMethod
    public void requestDefaultDialer(PluginCall call) {
        Context context = getContext();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            RoleManager roleManager = (RoleManager) context.getSystemService(Context.ROLE_SERVICE);
            if (roleManager != null && roleManager.isRoleAvailable(RoleManager.ROLE_DIALER)) {
                if (roleManager.isRoleHeld(RoleManager.ROLE_DIALER)) {
                    JSObject ret = new JSObject();
                    ret.put("isDefault", true);
                    call.resolve(ret);
                } else {
                    Intent intent = roleManager.createRequestRoleIntent(RoleManager.ROLE_DIALER);
                    startActivityForResult(call, intent, "defaultDialerResult");
                }
            } else {
                call.reject("Dialer role not available on this device.");
            }
        } else {
            TelecomManager telecomManager = (TelecomManager) context.getSystemService(Context.TELECOM_SERVICE);
            String packageName = context.getPackageName();
            if (packageName.equals(telecomManager.getDefaultDialerPackage())) {
                JSObject ret = new JSObject();
                ret.put("isDefault", true);
                call.resolve(ret);
            } else {
                Intent intent = new Intent(TelecomManager.ACTION_CHANGE_DEFAULT_DIALER);
                intent.putExtra(TelecomManager.EXTRA_CHANGE_DEFAULT_DIALER_PACKAGE_NAME, packageName);
                startActivityForResult(call, intent, "defaultDialerResult");
            }
        }
    }

    @ActivityCallback
    private void defaultDialerResult(PluginCall call, ActivityResult result) {
        checkDefaultDialer(call);
    }

    // NAYA LOGIC: Check if app is default dialer
    @PluginMethod
    public void checkDefaultDialer(PluginCall call) {
        Context context = getContext();
        boolean isDefault = false;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            RoleManager roleManager = (RoleManager) context.getSystemService(Context.ROLE_SERVICE);
            if (roleManager != null) {
                isDefault = roleManager.isRoleHeld(RoleManager.ROLE_DIALER);
            }
        } else {
            TelecomManager telecomManager = (TelecomManager) context.getSystemService(Context.TELECOM_SERVICE);
            if (telecomManager != null) {
                isDefault = context.getPackageName().equals(telecomManager.getDefaultDialerPackage());
            }
        }
        JSObject ret = new JSObject();
        ret.put("isDefault", isDefault);
        call.resolve(ret);
    }

    @PluginMethod
    public void acceptCall(PluginCall call) {
        if (CallService.activeCall != null) {
            try {
                CallService.activeCall.answer(0);
                call.resolve();
            } catch (Exception e) {
                call.reject("Failed to answer call: " + e.getMessage());
            }
        } else {
            call.reject("No active call to accept.");
        }
    }

    @PluginMethod
    public void endCall(PluginCall call) {
        if (CallService.activeCall != null) {
            try {
                CallService.activeCall.disconnect();
                call.resolve();
            } catch (Exception e) {
                call.reject("Failed to disconnect call: " + e.getMessage());
            }
        } else {
            call.reject("No active call to disconnect.");
        }
    }

    // List call-capable SIM accounts (requires default dialer or
    // READ_PHONE_STATE + carrier privileges on newer Android).
    @PluginMethod
    public void getCallAccounts(PluginCall call) {
        JSArray result = new JSArray();
        try {
            TelecomManager tm = (TelecomManager) getContext().getSystemService(Context.TELECOM_SERVICE);
            if (tm == null) {
                JSObject ret = new JSObject();
                ret.put("accounts", result);
                call.resolve(ret);
                return;
            }
            List<PhoneAccountHandle> handles = tm.getCallCapablePhoneAccounts();
            int index = 0;
            for (PhoneAccountHandle h : handles) {
                JSObject item = new JSObject();
                // Stable id for JS: componentName + id
                String id = h.getComponentName().flattenToString() + "|" + h.getId();
                item.put("id", id);
                item.put("accountId", h.getId());
                item.put("componentName", h.getComponentName().flattenToString());
                item.put("label", "SIM " + (index + 1));
                try {
                    android.telecom.PhoneAccount pa = tm.getPhoneAccount(h);
                    if (pa != null) {
                        CharSequence label = pa.getLabel();
                        if (label != null && label.length() > 0) item.put("label", label.toString());
                        item.put("isEnabled", pa.isEnabled());
                    }
                } catch (Exception ignore) {}
                index++;
                result.put(item);
            }
        } catch (Exception e) {
            Log.e(TAG, "getCallAccounts failed", e);
            call.reject("Failed: " + e.getMessage());
            return;
        }
        JSObject ret = new JSObject();
        ret.put("accounts", result);
        call.resolve(ret);
    }

    // Robust call dispatcher: tries TelecomManager first (works when we
    // hold the default-dialer role), falls back to ACTION_CALL (works with
    // CALL_PHONE permission regardless of role).
    @PluginMethod
    public void call(PluginCall call) {
        String number = call.getString("number");
        if (number == null || number.trim().isEmpty()) {
            call.reject("Number is required.");
            return;
        }
        String cleaned = number.replaceAll("[^+0-9*#]", "");
        String accountId = call.getString("accountId"); // optional
        Context ctx = getContext();

        // Attempt 1: TelecomManager.placeCall (with optional PhoneAccountHandle
        // for SIM selection; only honored when we hold the default dialer role).
        try {
            TelecomManager tm = (TelecomManager) ctx.getSystemService(Context.TELECOM_SERVICE);
            if (tm != null) {
                android.net.Uri uri = android.net.Uri.fromParts("tel", cleaned, null);
                android.os.Bundle extras = new android.os.Bundle();
                extras.putBoolean(TelecomManager.EXTRA_START_CALL_WITH_SPEAKERPHONE, false);

                if (accountId != null && !accountId.isEmpty()) {
                    // accountId format from getCallAccounts(): "componentFlatten|id"
                    int sep = accountId.indexOf('|');
                    if (sep > 0) {
                        String compFlat = accountId.substring(0, sep);
                        String handleId = accountId.substring(sep + 1);
                        android.content.ComponentName cn = android.content.ComponentName.unflattenFromString(compFlat);
                        if (cn != null) {
                            PhoneAccountHandle handle = new PhoneAccountHandle(cn, handleId);
                            extras.putParcelable(TelecomManager.EXTRA_PHONE_ACCOUNT_HANDLE, handle);
                        }
                    }
                }

                tm.placeCall(uri, extras);
                JSObject ret = new JSObject();
                ret.put("success", true);
                ret.put("method", "telecom");
                if (accountId != null) ret.put("accountId", accountId);
                call.resolve(ret);
                return;
            }
        } catch (SecurityException se) {
            Log.w(TAG, "TelecomManager.placeCall denied, falling back", se);
        } catch (Exception e) {
            Log.w(TAG, "TelecomManager.placeCall failed, falling back", e);
        }

        // Attempt 2: ACTION_CALL intent (system picks the SIM)
        try {
            Intent intent = new Intent(Intent.ACTION_CALL);
            intent.setData(android.net.Uri.parse("tel:" + cleaned));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            ctx.startActivity(intent);
            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("method", "intent");
            ret.put("note", accountId != null ? "SIM selection ignored (not default dialer)" : null);
            call.resolve(ret);
        } catch (Exception e) {
            Log.e(TAG, "ACTION_CALL failed", e);
            call.reject("Call failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void placeCall(PluginCall call) {
        String number = call.getString("number");
        if (number == null || number.isEmpty()) {
            call.reject("Number is required.");
            return;
        }

        Context context = getContext();
        TelecomManager telecomManager = (TelecomManager) context.getSystemService(Context.TELECOM_SERVICE);

        if (telecomManager != null) {
            try {
                Uri uri = Uri.fromParts("tel", number, null);
                android.os.Bundle extras = new android.os.Bundle();
                extras.putBoolean(TelecomManager.EXTRA_START_CALL_WITH_SPEAKERPHONE, false);

                telecomManager.placeCall(uri, extras);
                JSObject ret = new JSObject();
                ret.put("success", true);
                call.resolve(ret);
            } catch (SecurityException e) {
                call.reject("Permission denied: " + e.getMessage());
            } catch (Exception e) {
                call.reject("Call failed: " + e.getMessage());
            }
        } else {
            call.reject("TelecomManager is null.");
        }
    }

    @PluginMethod
    public void toggleSpeaker(PluginCall call) {
        boolean enable = call.getBoolean("enable", false);
        Context context = getContext();
        if (context != null) {
            try {
                AudioManager audioManager = (AudioManager) context.getSystemService(Context.AUDIO_SERVICE);
                audioManager.setMode(AudioManager.MODE_IN_CALL);
                audioManager.setSpeakerphoneOn(enable);
                JSObject ret = new JSObject();
                ret.put("speakerOn", enable);
                call.resolve(ret);
            } catch (Exception e) {
                call.reject("Failed to toggle speaker: " + e.getMessage());
            }
        } else {
            call.reject("Context is null.");
        }
    }

    @PluginMethod
    public void toggleMute(PluginCall call) {
        boolean enable = call.getBoolean("enable", false);
        Context context = getContext();
        if (context != null) {
            try {
                AudioManager audioManager = (AudioManager) context.getSystemService(Context.AUDIO_SERVICE);
                audioManager.setMicrophoneMute(enable);
                JSObject ret = new JSObject();
                ret.put("muted", enable);
                call.resolve(ret);
            } catch (Exception e) {
                call.reject("Failed to toggle mute: " + e.getMessage());
            }
        } else {
            call.reject("Context is null.");
        }
    }

    @PluginMethod
    public void toggleHold(PluginCall call) {
        boolean enable = call.getBoolean("enable", false);
        if (CallService.activeCall != null) {
            try {
                if (enable) {
                    CallService.activeCall.hold();
                } else {
                    CallService.activeCall.unhold();
                }
                call.resolve();
            } catch (Exception e) {
                call.reject("Failed to toggle hold: " + e.getMessage());
            }
        } else {
            call.reject("No active call to toggle hold.");
        }
    }
}
