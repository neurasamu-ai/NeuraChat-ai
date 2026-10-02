package com.neurasamu.build.chat;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONObject;

// SharedPreferences-backed queue for call log events. Native call events
// (missed / answered / outgoing) are appended here regardless of whether
// the WebView is running, so the JS layer can pick them up on the next app
// start even if the event fired while the app was closed.
//
// Entries are appended in order (oldest first) and drained atomically by
// the plugin. Capped at MAX_ENTRIES so the store can never grow unbounded.
public class PendingCallLogStore {

    private static final String TAG = "NeuraPendingCallLog";
    private static final String PREFS = "neura_pending_call_logs";
    private static final String KEY = "queue";
    private static final int MAX_ENTRIES = 200;

    public static synchronized void append(
            Context ctx,
            String type,      // "incoming" | "missed" | "outgoing"
            String number,
            String name,
            long timestamp,
            long duration     // seconds; 0 if unknown
    ) {
        if (ctx == null) return;
        try {
            SharedPreferences sp = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            String raw = sp.getString(KEY, "[]");
            JSONArray arr;
            try {
                arr = new JSONArray(raw);
            } catch (Exception e) {
                arr = new JSONArray();
            }

            JSONObject entry = new JSONObject();
            entry.put("type", type == null ? "" : type);
            entry.put("number", number == null ? "" : number);
            entry.put("name", name == null ? "" : name);
            entry.put("timestamp", timestamp);
            entry.put("duration", duration);

            arr.put(entry);

            // Cap the queue — drop oldest entries beyond MAX_ENTRIES.
            if (arr.length() > MAX_ENTRIES) {
                JSONArray trimmed = new JSONArray();
                int start = arr.length() - MAX_ENTRIES;
                for (int i = start; i < arr.length(); i++) {
                    trimmed.put(arr.get(i));
                }
                arr = trimmed;
            }

            sp.edit().putString(KEY, arr.toString()).apply();
            Log.d(TAG, "queued " + type + " " + number);
        } catch (Exception e) {
            Log.w(TAG, "append failed", e);
        }
    }

    // Returns the queue as a JSON string and clears it atomically.
    public static synchronized String drain(Context ctx) {
        if (ctx == null) return "[]";
        try {
            SharedPreferences sp = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            String raw = sp.getString(KEY, "[]");
            sp.edit().remove(KEY).apply();
            return raw == null || raw.isEmpty() ? "[]" : raw;
        } catch (Exception e) {
            Log.w(TAG, "drain failed", e);
            return "[]";
        }
    }

    // Peek without clearing — useful for debugging / future UI.
    public static synchronized int size(Context ctx) {
        if (ctx == null) return 0;
        try {
            SharedPreferences sp = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            String raw = sp.getString(KEY, "[]");
            return new JSONArray(raw).length();
        } catch (Exception e) {
            return 0;
        }
    }
}
