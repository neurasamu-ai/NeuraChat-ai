package com.neurasamu.build.chat;

import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.ContactsContract;
import android.telecom.Call;
import android.telecom.InCallService;
import android.util.Log;

public class CallService extends InCallService {

    private static final String TAG = "NeuraCallService";

    // Static reference so TelecomPlugin can call InCallService methods
    // (setAudioRoute, etc). Assigned in onCreate, cleared in onDestroy.
    public static CallService instance = null;

    // Static state readable by TelecomPlugin at any time.
    public static Call activeCall = null;
    public static String currentState = "IDLE";
    public static String currentNumber = "";
    public static String currentName = "";
    public static boolean isIncoming = false;
    private boolean wasRinging = false;
    private boolean wasAnswered = false;
    public static boolean isMuted = false;
    public static boolean isSpeakerOn = false;
    public static boolean isHeld = false;
    public static long callStartedAt = 0L;

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
        Log.d(TAG, "CallService created");
    }

    @Override
    public void onDestroy() {
        if (instance == this) instance = null;
        Log.d(TAG, "CallService destroyed");
        super.onDestroy();
    }

    private final Call.Callback callCallback = new Call.Callback() {
        @Override
        public void onStateChanged(Call call, int state) {
            super.onStateChanged(call, state);
            updateState(call, state);
        }

        @Override
        public void onDetailsChanged(Call call, Call.Details details) {
            super.onDetailsChanged(call, details);
            updateState(call, call.getState());
        }
    };

    @Override
    public void onCallAdded(Call call) {
        super.onCallAdded(call);
        activeCall = call;
        call.registerCallback(callCallback);

        // Determine incoming vs outgoing
        try {
            isIncoming = call.getDetails().getCallDirection() == Call.Details.DIRECTION_INCOMING;
        } catch (Exception ignore) {}
        wasRinging = isIncoming;
        wasAnswered = false;

        updateState(call, call.getState());

        // Bring MainActivity up so the in-call UI can render.
        Intent intent = new Intent(this, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        intent.putExtra("call_state", currentState);
        startActivity(intent);
    }

    // Choose the visible call: prefer one that is not HOLDING or DISCONNECTED.
    private Call pickVisibleCall() {
        try {
            java.util.List<Call> calls = getCalls();
            if (calls == null || calls.isEmpty()) return null;
            Call fallback = null;
            for (Call c : calls) {
                if (c == null) continue;
                int st = c.getState();
                if (st == Call.STATE_DISCONNECTED) continue;
                if (st == Call.STATE_HOLDING) {
                    if (fallback == null) fallback = c;
                    continue;
                }
                return c;
            }
            return fallback;
        } catch (Exception e) {
            Log.w(TAG, "pickVisibleCall failed", e);
            return null;
        }
    }

    @Override
    public void onCallRemoved(Call call) {
        super.onCallRemoved(call);
        try { call.unregisterCallback(callCallback); } catch (Exception ignore) {}

        // Detect missed call: was ringing, never answered, was incoming.
        if (wasRinging && !wasAnswered && isIncoming) {
            try {
                // Write to CallLog as missed
                android.content.ContentValues cv = new android.content.ContentValues();
                cv.put(android.provider.CallLog.Calls.NUMBER, currentNumber);
                cv.put(android.provider.CallLog.Calls.TYPE,
                    android.provider.CallLog.Calls.MISSED_TYPE);
                cv.put(android.provider.CallLog.Calls.DATE, System.currentTimeMillis());
                cv.put(android.provider.CallLog.Calls.DURATION, 0);
                cv.put(android.provider.CallLog.Calls.NEW, 1);
                if (currentName != null && !currentName.isEmpty()) {
                    cv.put(android.provider.CallLog.Calls.CACHED_NAME, currentName);
                }
                getContentResolver().insert(
                    android.provider.CallLog.Calls.CONTENT_URI, cv);
                Log.d(TAG, "missed call logged: " + currentNumber);
            } catch (Exception e) {
                Log.w(TAG, "CallLog insert failed", e);
            }

            // Show missed call notification
            try {
                CallNotifier.showMissed(getApplicationContext(), currentNumber, currentName);
            } catch (Exception e) {
                Log.w(TAG, "missed notification failed", e);
            }

            // Emit event so the JS layer can persist it into the app DB.
            try {
                TelecomPlugin.dispatchMissedCall(currentNumber, currentName, System.currentTimeMillis());
            } catch (Exception e) {
                Log.w(TAG, "dispatchMissedCall failed", e);
            }
        }

        // If other calls remain (e.g. a held call), switch the UI to them
        // instead of tearing everything down.
        Call next = pickVisibleCall();
        if (next != null) {
            activeCall = next;
            updateState(next, next.getState());
            wasRinging = false;
            wasAnswered = true;
            return;
        }

        // No calls remain — full teardown.
        if (activeCall == call) {
            activeCall = null;
        }
        currentState = "DISCONNECTED";
        TelecomPlugin.dispatchCallState("DISCONNECTED", currentNumber, currentName, isIncoming);
        // Reset flags shortly after so the UI hides.
        isMuted = false;
        isSpeakerOn = false;
        isHeld = false;
        callStartedAt = 0L;
        wasRinging = false;
        wasAnswered = false;
    }

    private void updateState(Call call, int state) {
        String stateStr = getStateString(state);
        currentState = stateStr;
        currentNumber = getNumber(call);
        currentName = lookupName(currentNumber);

        if (state == Call.STATE_ACTIVE) {
            if (callStartedAt == 0L) callStartedAt = System.currentTimeMillis();
            wasAnswered = true;
        }
        if (state == Call.STATE_DISCONNECTED) {
            callStartedAt = 0L;
        }

        Log.d(TAG, "state=" + stateStr + " number=" + currentNumber + " name=" + currentName);
        TelecomPlugin.dispatchCallState(stateStr, currentNumber, currentName, isIncoming);
    }

    private String getStateString(int state) {
        switch (state) {
            case Call.STATE_RINGING: return "RINGING";
            case Call.STATE_DIALING: return "DIALING";
            case Call.STATE_ACTIVE: return "ACTIVE";
            case Call.STATE_HOLDING: return "HOLDING";
            case Call.STATE_DISCONNECTED: return "DISCONNECTED";
            case Call.STATE_SELECT_PHONE_ACCOUNT: return "SELECT_PHONE_ACCOUNT";
            case Call.STATE_CONNECTING: return "CONNECTING";
            default: return "UNKNOWN";
        }
    }

    private String getNumber(Call call) {
        if (call != null && call.getDetails() != null && call.getDetails().getHandle() != null) {
            String s = call.getDetails().getHandle().getSchemeSpecificPart();
            return s != null ? s : "";
        }
        return "";
    }

    // Look up a contact name for the given number.
    private String lookupName(String number) {
        if (number == null || number.isEmpty()) return "";
        Cursor c = null;
        try {
            Uri uri = Uri.withAppendedPath(
                ContactsContract.PhoneLookup.CONTENT_FILTER_URI,
                Uri.encode(number)
            );
            c = getContentResolver().query(
                uri,
                new String[] { ContactsContract.PhoneLookup.DISPLAY_NAME },
                null, null, null
            );
            if (c != null && c.moveToFirst()) {
                String n = c.getString(0);
                if (n != null) return n;
            }
        } catch (Exception e) {
            Log.w(TAG, "lookupName failed", e);
        } finally {
            if (c != null) c.close();
        }
        return "";
    }

    // Public wrapper so TelecomPlugin can call the protected platform method.
    public void applyAudioRoute(int route) {
        try {
            setAudioRoute(route);
            Log.d(TAG, "applyAudioRoute -> " + route);
        } catch (Exception e) {
            Log.w(TAG, "applyAudioRoute failed", e);
        }
    }
}
