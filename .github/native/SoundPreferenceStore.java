package com.neurasamu.build.chat;

import android.content.Context;
import android.content.SharedPreferences;
import android.media.Ringtone;
import android.media.RingtoneManager;
import android.net.Uri;
import android.util.Log;

// Persists the user's chosen notification sound (SMS) and call ringtone.
// Stores the content:// URI returned by the system ringtone picker.
// When no custom sound is set we fall back to the platform defaults.
public class SoundPreferenceStore {

    private static final String TAG = "NeuraSoundPref";
    private static final String PREFS = "neura_sound_prefs";
    private static final String KEY_SMS = "sms_notification_uri";
    private static final String KEY_CALL = "call_ringtone_uri";

    public static void set(Context ctx, String type, String uri) {
        if (ctx == null) return;
        try {
            SharedPreferences sp = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            String key = "sms".equals(type) ? KEY_SMS : KEY_CALL;
            if (uri == null || uri.isEmpty()) {
                sp.edit().remove(key).apply();
            } else {
                sp.edit().putString(key, uri).apply();
            }
            Log.d(TAG, "set " + type + " -> " + uri);
        } catch (Exception e) {
            Log.w(TAG, "set failed", e);
        }
    }

    public static void clear(Context ctx, String type) {
        set(ctx, type, null);
    }

    public static String getUri(Context ctx, String type) {
        if (ctx == null) return null;
        try {
            SharedPreferences sp = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            String key = "sms".equals(type) ? KEY_SMS : KEY_CALL;
            return sp.getString(key, null);
        } catch (Exception e) {
            return null;
        }
    }

    // Resolves the effective ringtone URI for a type. If the user set a
    // custom one it wins; otherwise we hand back the platform default for
    // that type (NOTIFICATION for SMS, RINGTONE for calls).
    public static Uri effectiveUri(Context ctx, String type) {
        String custom = getUri(ctx, type);
        if (custom != null && !custom.isEmpty()) {
            try {
                return Uri.parse(custom);
            } catch (Exception ignore) {}
        }
        int defaultType = "sms".equals(type)
            ? RingtoneManager.TYPE_NOTIFICATION
            : RingtoneManager.TYPE_RINGTONE;
        return RingtoneManager.getDefaultUri(defaultType);
    }

    // Human-readable name of the current sound, used in the settings UI.
    public static String displayName(Context ctx, String type) {
        try {
            Uri uri = effectiveUri(ctx, type);
            if (uri == null) return "Default";
            Ringtone r = RingtoneManager.getRingtone(ctx, uri);
            if (r == null) return "Default";
            String title = r.getTitle(ctx);
            return title == null || title.isEmpty() ? "Default" : title;
        } catch (Exception e) {
            return "Default";
        }
    }

    public static boolean hasCustom(Context ctx, String type) {
        String uri = getUri(ctx, type);
        return uri != null && !uri.isEmpty();
    }
}
