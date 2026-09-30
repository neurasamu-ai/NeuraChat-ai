package com.neurasamu.build.chat;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;

// Single source of truth for the user's preferred contact account when the
// same number has different display names across Google accounts / SIMs.
// Read by native notifiers (SMS / Call / Overlay) and, via plugin methods,
// by the web layer.
public class NamePreferenceStore {

    private static final String TAG = "NeuraNamePref";
    private static final String PREFS = "neura_name_prefs";
    private static final String KEY_TYPE = "name_source_account_type";
    private static final String KEY_NAME = "name_source_account_name";
    private static final String KEY_TS = "name_source_updated_at";

    public static void set(Context ctx, String accountType, String accountName) {
        if (ctx == null) return;
        try {
            SharedPreferences sp = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            SharedPreferences.Editor e = sp.edit();
            if (accountType == null || accountType.isEmpty()) {
                e.remove(KEY_TYPE);
            } else {
                e.putString(KEY_TYPE, accountType);
            }
            if (accountName == null || accountName.isEmpty()) {
                e.remove(KEY_NAME);
            } else {
                e.putString(KEY_NAME, accountName);
            }
            e.putLong(KEY_TS, System.currentTimeMillis());
            e.apply();
            Log.d(TAG, "preference set: " + accountType + " / " + accountName);
        } catch (Exception ex) {
            Log.w(TAG, "set failed", ex);
        }
    }

    public static void clear(Context ctx) {
        if (ctx == null) return;
        try {
            SharedPreferences sp = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            sp.edit().remove(KEY_TYPE).remove(KEY_NAME).remove(KEY_TS).apply();
            Log.d(TAG, "preference cleared");
        } catch (Exception ex) {
            Log.w(TAG, "clear failed", ex);
        }
    }

    public static String getType(Context ctx) {
        if (ctx == null) return null;
        try {
            SharedPreferences sp = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            return sp.getString(KEY_TYPE, null);
        } catch (Exception ex) {
            return null;
        }
    }

    public static String getName(Context ctx) {
        if (ctx == null) return null;
        try {
            SharedPreferences sp = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            return sp.getString(KEY_NAME, null);
        } catch (Exception ex) {
            return null;
        }
    }

    public static long getUpdatedAt(Context ctx) {
        if (ctx == null) return 0L;
        try {
            SharedPreferences sp = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            return sp.getLong(KEY_TS, 0L);
        } catch (Exception ex) {
            return 0L;
        }
    }

    public static boolean hasPreference(Context ctx) {
        String t = getType(ctx);
        return t != null && !t.isEmpty();
    }
}
