package com.neurasamu.neurachat;

import android.content.Context;
import android.media.AudioManager;
import android.telecom.Call;
import android.app.role.RoleManager;
import android.content.Intent;
import android.net.Uri;
import android.telecom.TelecomManager;
import android.os.Build;
import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.ActivityCallback;

@CapacitorPlugin(name = "TelecomPlugin")
public class TelecomPlugin extends Plugin {
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
    public void placeCall(PluginCall call) {
        String number = call.getString("number");
        if (number == null || number.isEmpty()) {
            call.reject("Bhai number to de, bina number ke hawa me call karega kya?");
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
                call.reject("Permission nahi hai bhidu: " + e.getMessage());
            } catch (Exception e) {
                call.reject("Call fail ho gaya scene tight hai: " + e.getMessage());
            }
        } else {
            call.reject("TelecomManager null mila boss!");
        }
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
