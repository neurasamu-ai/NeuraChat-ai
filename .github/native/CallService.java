package com.neurasamu.build.chat;

import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.ContactsContract;
import android.telecom.Call;
import android.telecom.InCallService;
import android.util.Log;
import android.os.PowerManager;

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
    public static boolean isMuted = false;
    public static boolean isSpeakerOn = false;
    public static boolean isHeld = false;
    public static long callStartedAt = 0L;

    // Proximity wake lock: turns the screen off while the phone is at the ear
    // during a call, and back on when moved away. It never locks the phone.
    private static PowerManager.WakeLock proximityLock = null;

    // Per-call bookkeeping so a call waiting scenario does not corrupt the
    // missed/answered detection of another call.
    private static class PerCall {
        boolean isIncoming;
        boolean wasRinging;
        boolean wasAnswered;
        boolean wasLogged;
        String number = "";
        String name = "";
    }
    private static final java.util.Map<Call, PerCall> perCallState =
        new java.util.concurrent.ConcurrentHashMap<>();

    // Stable ids for all calls currently tracked by the InCallService.
    private static final java.util.Map<Call, String> callIds =
        new java.util.concurrent.ConcurrentHashMap<>();
    private static int nextCallSeq = 1;
    public static String idFor(Call c) {
        if (c == null) return "";
        String existing = callIds.get(c);
        if (existing != null) return existing;
        String id = "c" + (nextCallSeq++);
        callIds.put(c, id);
        return id;
    }
    public static Call byId(String id) {
        for (java.util.Map.Entry<Call, String> e : callIds.entrySet()) {
            if (e.getValue().equals(id)) return e.getKey();
        }
        return null;
    }

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

        // Build per-call state so we never mix flags between calls.
        PerCall pc = new PerCall();
        try {
            pc.isIncoming = call.getDetails().getCallDirection() == Call.Details.DIRECTION_INCOMING;
        } catch (Exception ignore) {}
        pc.wasRinging = pc.isIncoming;
        pc.wasAnswered = false;
        pc.wasLogged = false;
        perCallState.put(call, pc);

        // Mirror the newly-added call to the shared "current" fields used
        // by the UI / getCurrentCall (best effort).
        isIncoming = pc.isIncoming;

        updateState(call, call.getState());

        // Bring MainActivity up so the in-call UI can render.
        Intent intent = new Intent(this, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        intent.putExtra("call_state", currentState);
        startActivity(intent);

        // Ask MainActivity to show over the lock screen for this call.
        try {
            if (MainActivity.instance != null) {
                MainActivity.instance.enableCallOverLockScreen();
            }
        } catch (Exception e) {
            Log.w(TAG, "enableCallOverLockScreen failed", e);
        }

        // Acquire proximity wake lock for the duration of the call.
        acquireProximityLock();

        dispatchCallsSnapshot();
    }

    private void acquireProximityLock() {
        try {
            if (proximityLock != null && proximityLock.isHeld()) return;
            PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
            if (pm == null) return;
            proximityLock = pm.newWakeLock(
                PowerManager.PROXIMITY_SCREEN_OFF_WAKE_LOCK, "NeuraChat:proximity");
            proximityLock.setReferenceCounted(false);
            proximityLock.acquire();
            Log.d(TAG, "proximity lock acquired");
        } catch (Exception e) {
            Log.w(TAG, "acquireProximityLock failed", e);
        }
    }

    private void releaseProximityLock() {
        try {
            if (proximityLock != null && proximityLock.isHeld()) {
                proximityLock.release();
                Log.d(TAG, "proximity lock released");
            }
        } catch (Exception e) {
            Log.w(TAG, "releaseProximityLock failed", e);
        } finally {
            proximityLock = null;
        }
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

        // Use this call's own bookkeeping so a call waiting scenario never
        // marks the wrong number as missed.
        PerCall pc = perCallState.get(call);
        boolean missed = pc != null
            && pc.wasRinging
            && !pc.wasAnswered
            && pc.isIncoming
            && call.getState() == Call.STATE_DISCONNECTED;

        if (missed) {
            String num = pc.number != null ? pc.number : "";
            String nm = pc.name != null ? pc.name : "";
            try {
                android.content.ContentValues cv = new android.content.ContentValues();
                cv.put(android.provider.CallLog.Calls.NUMBER, num);
                cv.put(android.provider.CallLog.Calls.TYPE,
                    android.provider.CallLog.Calls.MISSED_TYPE);
                cv.put(android.provider.CallLog.Calls.DATE, System.currentTimeMillis());
                cv.put(android.provider.CallLog.Calls.DURATION, 0);
                cv.put(android.provider.CallLog.Calls.NEW, 1);
                if (!nm.isEmpty()) {
                    cv.put(android.provider.CallLog.Calls.CACHED_NAME, nm);
                }
                getContentResolver().insert(
                    android.provider.CallLog.Calls.CONTENT_URI, cv);
                Log.d(TAG, "missed call logged: " + num);
            } catch (Exception e) {
                Log.w(TAG, "CallLog insert failed", e);
            }
            try {
                CallNotifier.showMissed(getApplicationContext(), num, nm);
            } catch (Exception e) {
                Log.w(TAG, "missed notification failed", e);
            }
            try {
                TelecomPlugin.dispatchMissedCall(num, nm, System.currentTimeMillis());
            } catch (Exception e) {
                Log.w(TAG, "dispatchMissedCall failed", e);
            }
        }

        // Remove the per-call bookkeeping for the disconnected call.
        perCallState.remove(call);

        // If other calls remain (e.g. a held call), switch the UI to them
        // instead of tearing everything down.
        Call next = pickVisibleCall();
        if (next != null) {
            activeCall = next;
            updateState(next, next.getState());
            return;
        }

        // No calls remain — full teardown.
        if (activeCall == call) {
            activeCall = null;
        }
        currentState = "DISCONNECTED";
        TelecomPlugin.dispatchCallState("DISCONNECTED", currentNumber, currentName, isIncoming);
        isMuted = false;
        isSpeakerOn = false;
        isHeld = false;
        callStartedAt = 0L;
        try { CallNotifier.cancelActive(getApplicationContext()); } catch (Exception ignore) {}
        releaseProximityLock();
        try {
            if (MainActivity.instance != null) {
                MainActivity.instance.disableCallOverLockScreen();
            }
        } catch (Exception ignore) {}
        dispatchCallsSnapshot();
    }

    // Emit a snapshot of all current calls so the UI can render a call
    // waiting card when more than one call is present.
    public static void dispatchCallsSnapshot() {
        if (instance == null) return;
        try {
            java.util.List<Call> list = instance.getCalls();
            com.getcapacitor.JSArray arr = new com.getcapacitor.JSArray();
            if (list != null) {
                for (Call c : list) {
                    if (c == null) continue;
                    int st = c.getState();
                    if (st == Call.STATE_DISCONNECTED) continue;
                    com.getcapacitor.JSObject o = new com.getcapacitor.JSObject();
                    o.put("id", idFor(c));
                    String num = getNumberStatic(c);
                    o.put("number", num == null ? "" : num);
                    o.put("name", instance.lookupName(num));
                    o.put("state", instance.getStateString(st));
                    boolean in;
                    try {
                        in = c.getDetails().getCallDirection() == Call.Details.DIRECTION_INCOMING;
                    } catch (Exception e) {
                        in = false;
                    }
                    o.put("incoming", in);
                    o.put("active", c == instance.activeCall);
                    arr.put(o);
                }
            }
            TelecomPlugin.dispatchCallsChanged(arr);
        } catch (Exception e) {
            Log.w(TAG, "dispatchCallsSnapshot failed", e);
        }
    }

    private static String getNumberStatic(Call call) {
        if (call != null && call.getDetails() != null && call.getDetails().getHandle() != null) {
            String v = call.getDetails().getHandle().getSchemeSpecificPart();
            return v != null ? v : "";
        }
        return "";
    }

    private void updateState(Call call, int state) {
        String stateStr = getStateString(state);
        String number = getNumber(call);
        String name = lookupName(number);

        PerCall pc = perCallState.get(call);
        if (pc != null) {
            pc.number = number;
            pc.name = name;
        }

        // Update the shared "current" fields only when this is the visible
        // call, so other calls' events don't clobber the UI title.
        if (call == activeCall) {
            currentState = stateStr;
            currentNumber = number;
            currentName = name;
            if (state == Call.STATE_ACTIVE) {
                if (callStartedAt == 0L) callStartedAt = System.currentTimeMillis();
            }
        }

        if (state == Call.STATE_ACTIVE && pc != null) {
            pc.wasAnswered = true;
            if (pc.isIncoming && !pc.wasLogged) {
                pc.wasLogged = true;
                try {
                    TelecomPlugin.dispatchAnsweredCall(pc.number, pc.name, System.currentTimeMillis());
                } catch (Exception e) {
                    Log.w(TAG, "dispatchAnsweredCall failed", e);
                }
            }
        }
        if (state == Call.STATE_DISCONNECTED) {
            callStartedAt = 0L;
        }

        Log.d(TAG, "state=" + stateStr + " number=" + currentNumber + " name=" + currentName);
        TelecomPlugin.dispatchCallState(stateStr, currentNumber, currentName, isIncoming);
        dispatchCallsSnapshot();

        // Ongoing-call notification: shows while a call is live, tap to
        // reopen the in-call UI.
        try {
            if (stateStr.equals("DISCONNECTED") || stateStr.equals("IDLE")) {
                CallNotifier.cancelActive(getApplicationContext());
            } else if (activeCall != null) {
                CallNotifier.showActive(getApplicationContext(), currentNumber, currentName);
            }
        } catch (Exception e) {
            Log.w(TAG, "active notification toggle failed", e);
        }
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
