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
            // 1. Exact normalized match
            String nKey = PREFIX + normalize(number);
            if (sp.contains(nKey)) return true;
            // 2. Fallback: match on last 10 digits so "+92..." vs "0..." vs
            //    "92..." all resolve to the same VIP entry. This is the
            //    common case that used to silently miss.
            String tail = lastDigits(normalize(number), 10);
            if (tail.isEmpty()) return false;
            for (java.util.Map.Entry<String, ?> e : sp.getAll().entrySet()) {
                String k = e.getKey();
                if (k == null || !k.startsWith(PREFIX)) continue;
                String stored = k.substring(PREFIX.length());
                if (stored.equals(normalize(number))) return true;
                if (lastDigits(stored, 10).equals(tail)) return true;
            }
            return false;
        } catch (Exception e) {
            return false;
        }
    }

    private static String lastDigits(String s, int n) {
        if (s == null) return "";
        if (s.length() <= n) return s;
        return s.substring(s.length() - n);
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

    // Digits only, and strip a leading 0 / common country-code prefix so
    // "+92300...", "0300...", and "92300..." all map to the same key.
    private static String normalize(String number) {
        if (number == null) return "";
        String d = number.replaceAll("[^0-9]", "");
        // 92 is Pakistan's country code in this app; extend here if needed.
        if (d.startsWith("92") && d.length() > 10) d = d.substring(2);
        while (d.startsWith("0")) d = d.substring(1);
        return d;
    }
}
