package com.neurasamu.build.chat;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;

import org.json.JSONObject;

import java.util.Iterator;

// Tracks per-number snooze windows. When a call arrives from a number
// whose snooze is still active, CallService rejects it automatically.
public class SnoozeStore {

    private static final String TAG = "NeuraSnooze";
    private static final String PREFS = "neura_snooze";
    private static final String KEY = "entries";

    // number (digits only) -> expiry timestamp (ms since epoch)
    private static final java.util.Map<String, Long> cache = new java.util.HashMap<>();
    private static boolean loaded = false;

    private static String normalize(String number) {
        if (number == null) return "";
        return number.replaceAll("[^0-9]", "");
    }

    private static void ensureLoaded(Context ctx) {
        if (loaded) return;
        try {
            SharedPreferences p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            String json = p.getString(KEY, "{}");
            JSONObject obj = new JSONObject(json);
            cache.clear();
            long now = System.currentTimeMillis();
            Iterator<String> keys = obj.keys();
            while (keys.hasNext()) {
                String k = keys.next();
                long expiry = obj.optLong(k, 0L);
                if (expiry > now) cache.put(k, expiry);
            }
            loaded = true;
        } catch (Exception e) {
            Log.e(TAG, "load failed", e);
        }
    }

    private static void persist(Context ctx) {
        try {
            JSONObject obj = new JSONObject();
            long now = System.currentTimeMillis();
            for (java.util.Map.Entry<String, Long> e : cache.entrySet()) {
                if (e.getValue() > now) obj.put(e.getKey(), e.getValue());
            }
            SharedPreferences p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            p.edit().putString(KEY, obj.toString()).apply();
        } catch (Exception e) {
            Log.e(TAG, "persist failed", e);
        }
    }

    public static void setSnooze(Context ctx, String number, long minutes) {
        String n = normalize(number);
        if (n.isEmpty()) return;
        ensureLoaded(ctx);
        long expiry = System.currentTimeMillis() + (minutes * 60_000L);
        cache.put(n, expiry);
        persist(ctx);
        Log.d(TAG, "snooze " + n + " until " + expiry);
    }

    public static void clearSnooze(Context ctx, String number) {
        String n = normalize(number);
        if (n.isEmpty()) return;
        ensureLoaded(ctx);
        cache.remove(n);
        persist(ctx);
        Log.d(TAG, "snooze cleared for " + n);
    }

    public static boolean isSnoozed(Context ctx, String number) {
        ensureLoaded(ctx);
        String n = normalize(number);
        if (n.isEmpty()) return false;
        Long expiry = cache.get(n);
        if (expiry == null) {
            // suffix fallback
            for (java.util.Map.Entry<String, Long> e : cache.entrySet()) {
                String k = e.getKey();
                if (k.isEmpty()) continue;
                if (n.endsWith(k) || k.endsWith(n)) {
                    expiry = e.getValue();
                    break;
                }
            }
        }
        if (expiry == null) return false;
        if (expiry <= System.currentTimeMillis()) {
            cache.remove(n);
            persist(ctx);
            return false;
        }
        return true;
    }
}
