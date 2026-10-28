package com.neurasamu.build.chat;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;

// Per-number VIP alarm configuration. Keyed by normalized phone number.
// Each entry stores {enabled: true, ringtonePath: "/path/to.mp3" or ""}.
public class VipContactStore {

    private static final String TAG = "NeuraVipStore";
    private static final String PREFS = "neura_vip_contacts";
    private static final String PREFIX = "vip_";

    public static void set(Context ctx, String number, boolean enabled, String ringtonePath) {
        if (ctx == null || number == null || number.isEmpty()) return;
        try {
            SharedPreferences sp = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            SharedPreferences.Editor e = sp.edit();
            String key = PREFIX + normalize(number);
            if (!enabled) {
                e.remove(key);
            } else {
                e.putString(key, ringtonePath == null ? "" : ringtonePath);
            }
            e.apply();
            Log.d(TAG, "set " + number + " enabled=" + enabled + " ringtone=" + ringtonePath);
        } catch (Exception ex) {
            Log.w(TAG, "set failed", ex);
        }
    }

    public static boolean isVip(Context ctx, String number) {
        if (ctx == null || number == null || number.isEmpty()) return false;
        try {
            SharedPreferences sp = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            return sp.contains(PREFIX + normalize(number));
        } catch (Exception e) {
            return false;
        }
    }

    public static String getRingtonePath(Context ctx, String number) {
        if (ctx == null || number == null || number.isEmpty()) return "";
        try {
            SharedPreferences sp = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            return sp.getString(PREFIX + normalize(number), "");
        } catch (Exception e) {
            return "";
        }
    }

    public static java.util.Map<String, String> getAll(Context ctx) {
        java.util.Map<String, String> out = new java.util.HashMap<>();
        if (ctx == null) return out;
        try {
            SharedPreferences sp = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            for (java.util.Map.Entry<String, ?> entry : sp.getAll().entrySet()) {
                String key = entry.getKey();
                if (key.startsWith(PREFIX)) {
                    Object v = entry.getValue();
                    out.put(key.substring(PREFIX.length()), v == null ? "" : v.toString());
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "getAll failed", e);
        }
        return out;
    }

    public static void clear(Context ctx, String number) {
        set(ctx, number, false, null);
    }

    // Digits only, so "+92...", "0300...", "92300..." all map to the same key.
    private static String normalize(String number) {
        return number.replaceAll("[^0-9]", "");
    }
}
