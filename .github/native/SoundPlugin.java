package com.neurasamu.build.chat;

import android.app.Activity;
import android.content.Intent;
import android.media.RingtoneManager;
import android.net.Uri;
import android.util.Log;

import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

// Exposes the system ringtone picker so the user can choose a custom SMS
// notification sound or call ringtone. The chosen URI is persisted in
// SoundPreferenceStore; native notifiers read it when building channels.
@CapacitorPlugin(name = "SoundPlugin")
public class SoundPlugin extends Plugin {

    private static final String TAG = "NeuraSoundPlugin";
    private static final int REQUEST_CODE = 4100;

    private String pendingType = "sms";

    @PluginMethod
    public void pickSound(PluginCall call) {
        String type = call.getString("type", "sms");
        pendingType = "call".equals(type) ? "call" : "sms";

        try {
            Intent intent = new Intent(RingtoneManager.ACTION_RINGTONE_PICKER);
            intent.putExtra(RingtoneManager.EXTRA_RINGTONE_TYPE,
                "call".equals(pendingType)
                    ? RingtoneManager.TYPE_RINGTONE
                    : RingtoneManager.TYPE_NOTIFICATION);
            intent.putExtra(RingtoneManager.EXTRA_RINGTONE_SHOW_DEFAULT, true);
            intent.putExtra(RingtoneManager.EXTRA_RINGTONE_SHOW_SILENT, false);
            intent.putExtra(RingtoneManager.EXTRA_RINGTONE_TITLE,
                "call".equals(pendingType) ? "Select ringtone" : "Select notification sound");

            Uri current = SoundPreferenceStore.effectiveUri(getContext(), pendingType);
            if (current != null) {
                intent.putExtra(RingtoneManager.EXTRA_RINGTONE_EXISTING_URI, current);
            }

            startActivityForResult(call, intent, "onSoundPicked");
        } catch (Exception e) {
            Log.w(TAG, "pickSound failed", e);
            call.reject("Failed to open ringtone picker: " + e.getMessage());
        }
    }

    @ActivityCallback
    private void onSoundPicked(PluginCall call, ActivityResult result) {
        if (call == null) return;
        try {
            if (result.getResultCode() != Activity.RESULT_OK) {
                call.resolve(new JSObject());
                return;
            }
            Intent data = result.getData();
            Uri uri = null;
            if (data != null) {
                uri = data.getParcelableExtra(RingtoneManager.EXTRA_RINGTONE_PICKED_URI);
            }
            if (uri == null) {
                // User picked "Default" — clear any custom value.
                SoundPreferenceStore.clear(getContext(), pendingType);
            } else {
                SoundPreferenceStore.set(getContext(), pendingType, uri.toString());
            }
            JSObject ret = new JSObject();
            ret.put("type", pendingType);
            ret.put("uri", uri == null ? "" : uri.toString());
            ret.put("name", SoundPreferenceStore.displayName(getContext(), pendingType));
            ret.put("custom", SoundPreferenceStore.hasCustom(getContext(), pendingType));
            call.resolve(ret);
        } catch (Exception e) {
            Log.w(TAG, "onSoundPicked failed", e);
            call.reject("Failed to save sound: " + e.getMessage());
        }
    }

    @PluginMethod
    public void getSound(PluginCall call) {
        String type = call.getString("type", "sms");
        String t = "call".equals(type) ? "call" : "sms";
        JSObject ret = new JSObject();
        ret.put("type", t);
        ret.put("name", SoundPreferenceStore.displayName(getContext(), t));
        ret.put("custom", SoundPreferenceStore.hasCustom(getContext(), t));
        String uri = SoundPreferenceStore.getUri(getContext(), t);
        ret.put("uri", uri == null ? "" : uri);
        call.resolve(ret);
    }

    @PluginMethod
    public void clearSound(PluginCall call) {
        String type = call.getString("type", "sms");
        String t = "call".equals(type) ? "call" : "sms";
        SoundPreferenceStore.clear(getContext(), t);
        // Force the notifier to recreate its channels on the next post so
        // the default sound is picked up. Channel settings are immutable
        // once created, so notifiers bump their channel IDs when a change
        // is detected.
        try {
            android.app.NotificationManager nm =
                (android.app.NotificationManager) getContext().getSystemService(android.content.Context.NOTIFICATION_SERVICE);
            if (nm != null) {
                if ("sms".equals(t)) nm.deleteNotificationChannel("neura_sms_incoming_v3");
                else nm.deleteNotificationChannel("neura_call_incoming_v3");
            }
        } catch (Exception ignore) {}
        JSObject ret = new JSObject();
        ret.put("type", t);
        ret.put("name", SoundPreferenceStore.displayName(getContext(), t));
        ret.put("custom", false);
        call.resolve(ret);
    }
}
