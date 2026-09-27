package com.neurasamu.build.chat;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;

import org.json.JSONArray;

import java.util.HashSet;
import java.util.Set;

// Persistent store of blocked phone numbers, shared between the JS layer
// (which writes it) and the SMS / call receivers (which read it and drop
// traffic from blocked numbers).
public class BlockedStore {

    private static final String TAG = "NeuraBlocked";
    private static final String PREFS = "neura_blocked";
    private static final String KEY = "numbers";
    private static final Set<String> cache = new HashSet<>();
    private static boolean loaded = false;

    // Normalize: keep only digits, so +92 300 and 0300 1234567 match.
    public static String normalize(String number) {
        if (number == null) return "";
        return number.replaceAll("[^0-9]", "");
    }

    private static void ensureLoaded(Context ctx) {
        if (loaded) return;
        try {
            SharedPreferences p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            String json = p.getString(KEY, "[]");
            JSONArray arr = new JSONArray(json);
            cache.clear();
            for (int i = 0; i < arr.length(); i++) {
                String v = arr.optString(i, "");
                String n = normalize(v);
                if (!n.isEmpty()) cache.add(n);
            }
            loaded = true;
        } catch (Exception e) {
            Log.e(TAG, "load failed", e);
        }
    }

    public static void replaceAll(Context ctx, String[] numbers) {
        try {
            Set<String> next = new HashSet<>();
            JSONArray arr = new JSONArray();
            if (numbers != null) {
                for (String n : numbers) {
                    String norm = normalize(n);
                    if (norm.isEmpty()) continue;
                    if (next.add(norm)) arr.put(norm);
                }
            }
            cache.clear();
            cache.addAll(next);
            loaded = true;
            SharedPreferences p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            p.edit().putString(KEY, arr.toString()).apply();
            Log.d(TAG, "blocked list updated, count=" + cache.size());
        } catch (Exception e) {
            Log.e(TAG, "replaceAll failed", e);
        }
    }

    // Loose match: exact or suffix (handles country-code differences).
    public static boolean isBlocked(Context ctx, String number) {
        ensureLoaded(ctx);
        String n = normalize(number);
        if (n.isEmpty()) return false;
        if (cache.contains(n)) return true;
        for (String b : cache) {
            if (b.isEmpty()) continue;
            if (n.endsWith(b) || b.endsWith(n)) return true;
        }
        return false;
    }

    // Return the current blocked numbers as a plain array.
    public static String[] list(Context ctx) {
        ensureLoaded(ctx);
        return cache.toArray(new String[0]);
    }
}
