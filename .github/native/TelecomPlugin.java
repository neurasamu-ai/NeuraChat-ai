package com.neurasamu.build.chat;

import android.content.Context;
import android.media.AudioManager;
import android.media.MediaRecorder;
import android.os.Environment;
import java.io.File;
import android.telecom.Call;
import android.app.role.RoleManager;
import android.content.Intent;
import android.content.ContentValues;
import android.provider.MediaStore;
import android.net.Uri;
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

    // Transient name hint set by the web layer when the user initiates a call
    // from a specific contact variant (e.g. "Akira" @ Gmail1 vs "aka" @ Gmail2
    // for the same number). Consumed by CallService.onCallAdded for the very
    // next outgoing call, then cleared.
    public static volatile String pendingNameHint = null;
    public static volatile String pendingNameHintNumber = null;

    public static synchronized void setPendingNameHint(String number, String name) {
        pendingNameHint = (name == null || name.isEmpty()) ? null : name;
        pendingNameHintNumber = number;
    }

    public static synchronized String consumePendingNameHint(String number) {
        if (pendingNameHint == null) return null;
        if (number == null || number.isEmpty() || pendingNameHintNumber == null) return null;
        if (!sameNumber(number, pendingNameHintNumber)) return null;
        String out = pendingNameHint;
        pendingNameHint = null;
        pendingNameHintNumber = null;
        return out;
    }

    // Loose number match: strip non-digits, drop leading "00", drop a single
    // leading "0", and compare the last 10 digits. Handles "+92...", "0092...",
    // "92..." and "0..." all resolving to the same local number.
    private static boolean sameNumber(String a, String b) {
        String na = normalizeForCompare(a);
        String nb = normalizeForCompare(b);
        if (na.isEmpty() || nb.isEmpty()) return false;
        if (na.equals(nb)) return true;
        // Fall back to last-10 comparison when both are long enough.
        String la = na.length() > 10 ? na.substring(na.length() - 10) : na;
        String lb = nb.length() > 10 ? nb.substring(nb.length() - 10) : nb;
        return la.equals(lb);
    }

    private static String normalizeForCompare(String raw) {
        if (raw == null) return "";
        String d = raw.replaceAll("[^0-9]", "");
        if (d.startsWith("00")) d = d.substring(2);
        if (d.startsWith("0")) d = d.substring(1);
        return d;
    }
    private static TelecomPlugin instance;

    @Override
    public void load() {
        super.load();
        instance = this;
    }

    public static void dispatchCallState(String state, String number, String name, boolean incoming) {
        if (instance != null) {
            JSObject data = new JSObject();
            data.put("state", state);
            data.put("number", number == null ? "" : number);
            data.put("name", name == null ? "" : name);
            data.put("incoming", incoming);
            data.put("muted", CallService.isMuted);
            data.put("speakerOn", CallService.isSpeakerOn);
            data.put("held", CallService.isHeld);
            data.put("startedAt", CallService.callStartedAt);
            instance.notifyListeners("callStateChanged", data);
        }
    }

    public static void dispatchOutgoingCall(String number, String name, long timestamp) {
        if (instance != null) {
            JSObject data = new JSObject();
            data.put("number", number == null ? "" : number);
            data.put("name", name == null ? "" : name);
            data.put("timestamp", timestamp);
            instance.notifyListeners("outgoingCall", data);
        }
    }

    public static void dispatchAnsweredCall(String number, String name, long timestamp) {
        if (instance != null) {
            JSObject data = new JSObject();
            data.put("number", number == null ? "" : number);
            data.put("name", name == null ? "" : name);
            data.put("timestamp", timestamp);
            instance.notifyListeners("answeredCall", data);
        }
    }

    public static void dispatchCallsChanged(com.getcapacitor.JSArray calls) {
        if (instance != null) {
            JSObject data = new JSObject();
            data.put("calls", calls);
            instance.notifyListeners("callsChanged", data);
        }
    }

    // ---- Per-call actions (used by the call waiting card) ----
    @PluginMethod
    public void answerCallById(PluginCall call) {
        String id = call.getString("id");
        android.telecom.Call c = CallService.byId(id);
        if (c == null) { call.reject("Call not found"); return; }
        try {
            // Hold any currently active call first.
            if (CallService.activeCall != null && CallService.activeCall != c) {
                try { CallService.activeCall.hold(); } catch (Exception ignore) {}
            }
            c.answer(0);
            CallService.activeCall = c;
            call.resolve();
        } catch (Exception e) {
            call.reject("Failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void endCallById(PluginCall call) {
        String id = call.getString("id");
        android.telecom.Call c = CallService.byId(id);
        if (c == null) { call.reject("Call not found"); return; }
        try {
            c.disconnect();
            call.resolve();
        } catch (Exception e) {
            call.reject("Failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void holdCallById(PluginCall call) {
        String id = call.getString("id");
        android.telecom.Call c = CallService.byId(id);
        if (c == null) { call.reject("Call not found"); return; }
        try {
            c.hold();
            call.resolve();
        } catch (Exception e) {
            call.reject("Failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void unholdCallById(PluginCall call) {
        String id = call.getString("id");
        android.telecom.Call c = CallService.byId(id);
        if (c == null) { call.reject("Call not found"); return; }
        try {
            c.unhold();
            CallService.activeCall = c;
            call.resolve();
        } catch (Exception e) {
            call.reject("Failed: " + e.getMessage());
        }
    }

    // Swap: hold the current active call and unhold the given one.
    @PluginMethod
    public void swapToCall(PluginCall call) {
        String id = call.getString("id");
        android.telecom.Call target = CallService.byId(id);
        if (target == null) { call.reject("Call not found"); return; }
        try {
            if (CallService.activeCall != null && CallService.activeCall != target) {
                try { CallService.activeCall.hold(); } catch (Exception ignore) {}
            }
            target.unhold();
            CallService.activeCall = target;
            call.resolve();
        } catch (Exception e) {
            call.reject("Failed: " + e.getMessage());
        }
    }

    public static void dispatchMissedCall(String number, String name, long timestamp) {
        if (instance != null) {
            JSObject data = new JSObject();
            data.put("number", number == null ? "" : number);
            data.put("name", name == null ? "" : name);
            data.put("timestamp", timestamp);
            instance.notifyListeners("missedCall", data);
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
    // Normalize a phone number for dialing:
    //  - strip spaces / dashes / parens (keep + * #)
    //  - if it starts with the country code (e.g. 92...) and does not
    //    already have a +, prepend +
    //  - if it starts with 00, convert to +
    private static String normalizeNumber(String raw) {
        if (raw == null) return "";
        String s = raw.replaceAll("[^+0-9*#]", "");
        if (s.isEmpty()) return s;
        if (s.startsWith("+")) return s;
        if (s.startsWith("00")) return "+" + s.substring(2);
        // Common case: country code without + (e.g. 92 for Pakistan).
        // We only prepend + for lengths that look international (>= 11 digits).
        // Local numbers shorter than that are left alone.
        if (s.length() >= 11 && !s.startsWith("0")) {
            return "+" + s;
        }
        return s;
    }

    @PluginMethod
    public void call(PluginCall call) {
        String number = call.getString("number");
        if (number == null || number.trim().isEmpty()) {
            call.reject("Number is required.");
            return;
        }
        String cleaned = normalizeNumber(number);
        String accountId = call.getString("accountId"); // optional
        String nameHint = call.getString("nameHint");   // optional
        Context ctx = getContext();

        if (nameHint != null && !nameHint.isEmpty()) {
            setPendingNameHint(cleaned, nameHint);
            Log.d(TAG, "nameHint stored for " + cleaned + " -> " + nameHint);
        }

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
        if (context == null) {
            call.reject("Context is null.");
            return;
        }
        try {
            // Primary path: when we own the InCallService, the platform expects
            // audio routing to go through InCallService.setAudioRoute() using
            // CallAudioState constants (Call has no AUDIO_ROUTE_* members).
            boolean applied = false;
            if (CallService.instance != null) {
                try {
                    int route = enable
                        ? android.telecom.CallAudioState.ROUTE_SPEAKER
                        : android.telecom.CallAudioState.ROUTE_EARPIECE;
                    CallService.instance.applyAudioRoute(route);
                    applied = true;
                    Log.d(TAG, "InCallService.setAudioRoute -> " + route);
                } catch (Exception e) {
                    Log.w(TAG, "setAudioRoute failed, will fall back", e);
                }
            }

            // Backup / non-InCallService case: AudioManager.
            if (!applied) {
                AudioManager am = (AudioManager) context.getSystemService(Context.AUDIO_SERVICE);
                if (am == null) {
                    call.reject("AudioManager unavailable");
                    return;
                }
                am.setMode(AudioManager.MODE_IN_CALL);

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    java.util.List<android.media.AudioDeviceInfo> devices = am.getAvailableCommunicationDevices();
                    int targetType = enable
                        ? android.media.AudioDeviceInfo.TYPE_BUILTIN_SPEAKER
                        : android.media.AudioDeviceInfo.TYPE_BUILTIN_EARPIECE;
                    for (android.media.AudioDeviceInfo dev : devices) {
                        if (dev.getType() == targetType) {
                            am.setCommunicationDevice(dev);
                            break;
                        }
                    }
                } else {
                    am.setSpeakerphoneOn(enable);
                }
            }

            CallService.isSpeakerOn = enable;
            JSObject ret = new JSObject();
            ret.put("speakerOn", enable);
            call.resolve(ret);
        } catch (Exception e) {
            Log.e(TAG, "toggleSpeaker failed", e);
            call.reject("Failed to toggle speaker: " + e.getMessage());
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
                CallService.isMuted = enable;
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
                CallService.isHeld = enable;
                call.resolve();
            } catch (Exception e) {
                call.reject("Failed to toggle hold: " + e.getMessage());
            }
        } else {
            call.reject("No active call to toggle hold.");
        }
    }

    // Query the current call state without waiting for an event.
    @PluginMethod
    public void getCurrentCall(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("state", CallService.currentState);
        ret.put("number", CallService.currentNumber == null ? "" : CallService.currentNumber);
        ret.put("name", CallService.currentName == null ? "" : CallService.currentName);
        ret.put("incoming", CallService.isIncoming);
        ret.put("muted", CallService.isMuted);
        ret.put("speakerOn", CallService.isSpeakerOn);
        ret.put("held", CallService.isHeld);
        ret.put("startedAt", CallService.callStartedAt);
        ret.put("hasCall", CallService.activeCall != null);
        call.resolve(ret);
    }

    // ---- DTMF (keypad tones during a call) ----
    private static android.os.Handler dtmfHandler = null;

    @PluginMethod
    public void playDtmf(PluginCall call) {
        String tone = call.getString("tone");
        if (tone == null || tone.isEmpty()) {
            call.reject("tone is required");
            return;
        }
        if (CallService.activeCall == null) {
            call.reject("No active call");
            return;
        }
        try {
            final Call c = CallService.activeCall;
            char ch = tone.charAt(0);
            c.playDtmfTone(ch);

            // Auto-stop after 180ms so the tone does not play forever if the
            // caller forgets to stop it. This matches a natural key press.
            if (dtmfHandler == null) {
                dtmfHandler = new android.os.Handler(android.os.Looper.getMainLooper());
            }
            dtmfHandler.removeCallbacksAndMessages(null);
            dtmfHandler.postDelayed(new Runnable() {
                @Override
                public void run() {
                    try { c.stopDtmfTone(); } catch (Exception ignore) {}
                }
            }, 180);

            JSObject ret = new JSObject();
            ret.put("ok", true);
            call.resolve(ret);
        } catch (Exception e) {
            Log.e(TAG, "playDtmf failed", e);
            call.reject("Failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void stopDtmf(PluginCall call) {
        if (CallService.activeCall == null) {
            call.resolve();
            return;
        }
        try {
            CallService.activeCall.stopDtmfTone();
            call.resolve();
        } catch (Exception e) {
            Log.e(TAG, "stopDtmf failed", e);
            call.reject("Failed: " + e.getMessage());
        }
    }

    // ---- Call recording (MIC source only; caller audio is not captured on
    //      Android 10+ for non-system apps) ----
    private static MediaRecorder recorder = null;

    // Static helpers used by the native call screen (CallActivity) so it can
    // toggle recording without going through a PluginCall.
    public static boolean startQuickRecording(Context ctx) {
        if (recorder != null) return true;
        if (ctx == null) return false;
        try {
            if (androidx.core.content.ContextCompat.checkSelfPermission(
                    ctx, android.Manifest.permission.RECORD_AUDIO)
                    != android.content.pm.PackageManager.PERMISSION_GRANTED) {
                return false;
            }
            java.io.File dir = new java.io.File(
                ctx.getExternalFilesDir(android.os.Environment.DIRECTORY_MUSIC), "Recordings");
            if (!dir.exists() && !dir.mkdirs()) return false;
            java.io.File out = new java.io.File(
                dir, "call_" + System.currentTimeMillis() + ".m4a");
            MediaRecorder r = new MediaRecorder();
            r.setAudioSource(MediaRecorder.AudioSource.VOICE_COMMUNICATION);
            r.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4);
            r.setAudioEncoder(MediaRecorder.AudioEncoder.AAC);
            r.setOutputFile(out.getAbsolutePath());
            r.prepare();
            r.start();
            recorder = r;
            lastRecordingPath = out.getAbsolutePath();
            return true;
        } catch (Exception e) {
            android.util.Log.w("NeuraTelecom", "startQuickRecording failed", e);
            try { if (recorder != null) { recorder.release(); } } catch (Exception ignore) {}
            recorder = null;
            return false;
        }
    }

    public static void stopQuickRecording() {
        try {
            if (recorder != null) {
                recorder.stop();
                recorder.release();
            }
        } catch (Exception ignore) {}
        recorder = null;
    }
    private static String lastRecordingPath = null;
    private static Uri recorderUri = null;

    @PluginMethod
    public void startRecording(PluginCall call) {
        Log.d(TAG, "startRecording called");
        if (recorder != null) {
            call.reject("Already recording");
            return;
        }
        // Check RECORD_AUDIO permission before trying
        if (androidx.core.content.ContextCompat.checkSelfPermission(
                getContext(), android.Manifest.permission.RECORD_AUDIO)
                != android.content.pm.PackageManager.PERMISSION_GRANTED) {
            call.reject("RECORD_AUDIO permission not granted");
            return;
        }
        try {
            // Force speaker ON so the mic can capture the remote party's
            // voice. This is the only reliable way on modern Android without
            // privileged access to the telecom audio path.
            try {
                if (CallService.instance != null) {
                    CallService.instance.applyAudioRoute(
                        android.telecom.CallAudioState.ROUTE_SPEAKER);
                    CallService.isSpeakerOn = true;
                } else {
                    AudioManager am = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
                    if (am != null) {
                        am.setMode(AudioManager.MODE_IN_COMMUNICATION);
                        am.setSpeakerphoneOn(true);
                    }
                }
                Log.d(TAG, "speaker forced ON for recording");
            } catch (Exception e) {
                Log.w(TAG, "force speaker for recording failed", e);
            }

            String filename = "call_" + System.currentTimeMillis() + ".m4a";

            // Android 10+ : MediaStore with RELATIVE_PATH (no storage permission).
            // Older: fall back to app-private external dir.
            Uri uri = null;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                try {
                    ContentValues values = new ContentValues();
                    values.put(MediaStore.Audio.Media.DISPLAY_NAME, filename);
                    values.put(MediaStore.Audio.Media.MIME_TYPE, "audio/mp4");
                    values.put(MediaStore.Audio.Media.RELATIVE_PATH,
                        Environment.DIRECTORY_MUSIC + "/Recordings/NeuraChat");
                    values.put(MediaStore.Audio.Media.IS_PENDING, 1);

                    Uri collection = MediaStore.Audio.Media.getContentUri(
                        MediaStore.VOLUME_EXTERNAL_PRIMARY);
                    uri = getContext().getContentResolver().insert(collection, values);
                } catch (Exception e) {
                    Log.w(TAG, "MediaStore insert failed, using app-private dir", e);
                }
            }

            if (uri == null) {
                // Fallback to app-private external dir
                File dir = new File(getContext().getExternalFilesDir(Environment.DIRECTORY_MUSIC), "Recordings");
                if (!dir.exists() && !dir.mkdirs()) {
                    call.reject("Cannot create recordings dir");
                    return;
                }
                File out = new File(dir, filename);
                MediaRecorder r = createRecorder();
                r.setOutputFile(out.getAbsolutePath());
                r.prepare();
                r.start();
                recorder = r;
                lastRecordingPath = out.getAbsolutePath();
                JSObject ret = new JSObject();
                ret.put("ok", true);
                ret.put("path", lastRecordingPath);
                call.resolve(ret);
                return;
            }

            android.os.ParcelFileDescriptor pfd = getContext()
                .getContentResolver().openFileDescriptor(uri, "w");
            if (pfd == null) {
                call.reject("Cannot open output file");
                return;
            }

            MediaRecorder r = createRecorder();
            r.setOutputFile(pfd.getFileDescriptor());
            r.prepare();
            r.start();

            recorder = r;
            recorderUri = uri;
            lastRecordingPath = "Music/Recordings/NeuraChat/" + filename;

            JSObject ret = new JSObject();
            ret.put("ok", true);
            ret.put("path", lastRecordingPath);
            call.resolve(ret);
        } catch (Exception e) {
            Log.e(TAG, "startRecording failed", e);
            recorder = null;
            recorderUri = null;
            call.reject("Record failed: " + e.getMessage());
        }
    }

    private MediaRecorder createRecorder() {
        MediaRecorder r;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            r = new MediaRecorder(getContext());
        } else {
            r = new MediaRecorder();
        }
        // VOICE_COMMUNICATION is the tuned path for call audio; when the
        // speaker is on the mic picks up the remote party as well.
        r.setAudioSource(MediaRecorder.AudioSource.VOICE_COMMUNICATION);
        r.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4);
        r.setAudioEncoder(MediaRecorder.AudioEncoder.AAC);
        r.setAudioEncodingBitRate(96000);
        r.setAudioSamplingRate(44100);
        return r;
    }

    @PluginMethod
    public void stopRecording(PluginCall call) {
        if (recorder == null) {
            JSObject ret = new JSObject();
            ret.put("ok", false);
            ret.put("note", "not recording");
            call.resolve(ret);
            return;
        }
        try {
            recorder.stop();
        } catch (Exception stopEx) {
            Log.w(TAG, "recorder stop failed", stopEx);
        }
        try { recorder.release(); } catch (Exception ignore) {}
        recorder = null;

        // Finalize MediaStore entry so the file becomes visible.
        if (recorderUri != null) {
            try {
                ContentValues values = new ContentValues();
                values.put(MediaStore.Audio.Media.IS_PENDING, 0);
                getContext().getContentResolver().update(recorderUri, values, null, null);
                Log.d(TAG, "recording finalized: " + recorderUri);
            } catch (Exception e) {
                Log.w(TAG, "finalize failed", e);
            }
            recorderUri = null;
        }

        JSObject ret = new JSObject();
        ret.put("ok", true);
        if (lastRecordingPath != null) ret.put("path", lastRecordingPath);
        call.resolve(ret);
    }

    @PluginMethod
    public void isRecording(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("recording", recorder != null);
        if (lastRecordingPath != null) ret.put("lastPath", lastRecordingPath);
        call.resolve(ret);
    }

    // Snooze a caller: sets a window during which any call from that number
    // is auto-rejected. CallService reads this store on every incoming call.
    @PluginMethod
    public void snoozeCall(PluginCall call) {
        String number = call.getString("number");
        Integer minutes = call.getInt("minutes");
        if (number == null || number.isEmpty() || minutes == null) {
            call.reject("number and minutes are required");
            return;
        }
        try {
            SnoozeStore.setSnooze(getContext(), number, minutes);
            JSObject ret = new JSObject();
            ret.put("ok", true);
            ret.put("minutes", minutes);
            call.resolve(ret);
        } catch (Exception e) {
            Log.e(TAG, "snoozeCall failed", e);
            call.reject("Failed: " + e.getMessage());
        }
    }
}
