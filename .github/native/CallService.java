package com.neurasamu.build.chat;

import android.app.KeyguardManager;
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
    public static boolean isRecording = false;
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
    // Name hints captured at call start (from web layer). Keyed by Call so
    // the same name survives across all state changes for that call.
    private static final java.util.Map<Call, String> hintedNames =
        new java.util.concurrent.ConcurrentHashMap<>();

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

        // Drop blocked incoming calls before we do anything else.
        try {
            String num = "";
            if (call.getDetails() != null && call.getDetails().getHandle() != null) {
                num = call.getDetails().getHandle().getSchemeSpecificPart();
            }
            boolean isIncoming = call.getDetails() != null
                && call.getDetails().getCallDirection() == Call.Details.DIRECTION_INCOMING;
            if (isIncoming && num != null && !num.isEmpty()
                    && BlockedStore.isBlocked(getApplicationContext(), num)) {
                Log.d(TAG, "rejecting blocked incoming call from " + num);
                try { call.reject(false, null); } catch (Exception ignore) {}
                try { call.disconnect(); } catch (Exception ignore) {}
                return;
            }
            // Snoozed number: silently reject until the window expires.
            if (isIncoming && num != null && !num.isEmpty()
                    && SnoozeStore.isSnoozed(getApplicationContext(), num)) {
                Log.d(TAG, "rejecting snoozed incoming call from " + num);
                try { call.reject(false, null); } catch (Exception ignore) {}
                try { call.disconnect(); } catch (Exception ignore) {}
                return;
            }
        } catch (Exception e) {
            Log.w(TAG, "blocked check failed", e);
        }

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

        // Outgoing call: emit immediately so the JS layer can log it in
        // app history regardless of which screen placed the call.
        if (!pc.isIncoming) {
            try {
                String num = getNumber(call);
                String nm = lookupNameForCall(num, call);
                // If the web layer passed a name hint (user tapped a specific
                // contact variant), it wins over the resolved name.
                try {
                    String hint = TelecomPlugin.consumePendingNameHint(num);
                    if (hint != null && !hint.isEmpty()) {
                        nm = hint;
                        hintedNames.put(call, hint);
                    }
                } catch (Exception ignore) {}
                pc.number = num;
                pc.name = nm;
                pc.wasLogged = true;
                TelecomPlugin.dispatchOutgoingCall(num, nm, System.currentTimeMillis());

                // Present the native call screen immediately (state=ACTIVE,
                // but the status label shows "Calling..." until the call is
                // answered — updateState will refresh it).
                try {
                    Intent ca = new Intent(this, CallActivity.class);
                    ca.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK
                        | Intent.FLAG_ACTIVITY_CLEAR_TOP
                        | Intent.FLAG_ACTIVITY_SINGLE_TOP
                        | Intent.FLAG_ACTIVITY_NO_USER_ACTION);
                    ca.putExtra(CallActivity.EXTRA_STATE, CallActivity.STATE_DIALING);
                    ca.putExtra(CallActivity.EXTRA_NUMBER, num);
                    ca.putExtra(CallActivity.EXTRA_NAME, nm);
                    ca.putExtra(CallActivity.EXTRA_INCOMING, false);
                    startActivity(ca);
                    Log.d(TAG, "CallActivity launched for outgoing call " + num);
                } catch (Exception e) {
                    Log.w(TAG, "outgoing CallActivity launch failed", e);
                }
            } catch (Exception e) {
                Log.w(TAG, "dispatchOutgoingCall failed", e);
            }
        }

        updateState(call, call.getState());

        // Incoming call presentation. Three mutually exclusive paths:
        //   1. Screen locked or off  -> CallActivity (full native UI over keyguard)
        //   2. App in foreground    -> nothing (web ActiveCallScreen renders)
        //   3. App backgrounded     -> floating overlay banner
        // MainActivity is never launched here, so a call never boots the WebView.
        if (pc.isIncoming) {
            String num = getNumber(call);
            String nm = lookupNameForCall(num, call);
            pc.number = num;
            pc.name = nm;

            boolean appInForeground = false;
            try { appInForeground = MainActivity.isForeground(); } catch (Exception ignore) {}

            boolean screenLocked = false;
            boolean screenOff = false;
            try {
                KeyguardManager km = (KeyguardManager) getSystemService(KEYGUARD_SERVICE);
                if (km != null) screenLocked = km.isKeyguardLocked();
            } catch (Exception ignore) {}
            try {
                android.os.PowerManager pm = (android.os.PowerManager) getSystemService(POWER_SERVICE);
                if (pm != null) screenOff = !pm.isInteractive();
            } catch (Exception ignore) {}

            if (screenLocked || screenOff) {
                // Path 1: lock screen / screen off. Full native UI over the
                // keyguard, driven by a CallStyle notification with a
                // fullScreenIntent.
                try {
                    CallNotifier.showIncoming(getApplicationContext(), num, nm);
                } catch (Exception e) {
                    Log.w(TAG, "showIncoming failed", e);
                }
                try {
                    Intent ca = new Intent(this, CallActivity.class);
                    ca.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK
                        | Intent.FLAG_ACTIVITY_CLEAR_TOP
                        | Intent.FLAG_ACTIVITY_SINGLE_TOP
                        | Intent.FLAG_ACTIVITY_NO_USER_ACTION);
                    ca.putExtra(CallActivity.EXTRA_STATE, CallActivity.STATE_INCOMING);
                    ca.putExtra(CallActivity.EXTRA_NUMBER, num);
                    ca.putExtra(CallActivity.EXTRA_NAME, nm);
                    ca.putExtra(CallActivity.EXTRA_INCOMING, true);
                    startActivity(ca);
                    Log.d(TAG, "CallActivity launched (locked/off) for " + num);
                } catch (Exception e) {
                    Log.w(TAG, "CallActivity launch failed", e);
                }
            } else if (!appInForeground) {
                // Path 3: unlocked + app in background. Prefer the floating
                // overlay banner (compact, non-interrupting). Only fall back
                // to notification + CallActivity when the overlay permission
                // is missing.
                boolean overlayShown = false;
                try {
                    if (IncomingCallOverlay.canShow(getApplicationContext())) {
                        IncomingCallOverlay.show(getApplicationContext(), num, nm);
                        overlayShown = true;
                        Log.d(TAG, "overlay shown for incoming call " + num);
                    }
                } catch (Exception e) {
                    Log.w(TAG, "overlay show failed", e);
                }
                if (!overlayShown) {
                    try {
                        CallNotifier.showIncoming(getApplicationContext(), num, nm);
                    } catch (Exception e) {
                        Log.w(TAG, "showIncoming failed", e);
                    }
                    try {
                        Intent ca = new Intent(this, CallActivity.class);
                        ca.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK
                            | Intent.FLAG_ACTIVITY_CLEAR_TOP
                            | Intent.FLAG_ACTIVITY_SINGLE_TOP
                            | Intent.FLAG_ACTIVITY_NO_USER_ACTION);
                        ca.putExtra(CallActivity.EXTRA_STATE, CallActivity.STATE_INCOMING);
                        ca.putExtra(CallActivity.EXTRA_NUMBER, num);
                        ca.putExtra(CallActivity.EXTRA_NAME, nm);
                        ca.putExtra(CallActivity.EXTRA_INCOMING, true);
                        startActivity(ca);
                        Log.d(TAG, "CallActivity launched (no overlay perm) for " + num);
                    } catch (Exception e) {
                        Log.w(TAG, "CallActivity launch failed", e);
                    }
                }
            } else {
                // Path 2: app is in foreground - web UI handles it.
                Log.d(TAG, "app foreground, web ActiveCallScreen handles " + num);
            }
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
        try { hintedNames.remove(call); } catch (Exception ignore) {}

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
        try { IncomingCallOverlay.hide(getApplicationContext()); } catch (Exception ignore) {}
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
        String name = lookupNameForCall(number, call);
        // If a web-layer name hint was captured for this call, it wins.
        try {
            String hint = hintedNames.get(call);
            if (hint != null && !hint.isEmpty()) {
                name = hint;
            }
        } catch (Exception ignore) {}

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

        // Hide the incoming-call overlay once the call is no longer ringing.
        try {
            if (!stateStr.equals("RINGING") && !stateStr.equals("CONNECTING")) {
                IncomingCallOverlay.hide(getApplicationContext());
            }
        } catch (Exception e) {
            Log.w(TAG, "overlay hide failed", e);
        }

        // Native call screen sync + incoming notification cleanup.
        // In ACTIVE state, ONLY launch the native call screen when the app
        // is not visible — otherwise the web ActiveCallScreen already owns
        // the UI and launching CallActivity would show both at once.
        try {
            if (stateStr.equals("ACTIVE")) {
                CallNotifier.cancelIncoming(getApplicationContext());
                boolean appInForeground = false;
                try { appInForeground = MainActivity.isForeground(); } catch (Exception ignore) {}

                if (CallActivity.isVisible()) {
                    CallActivity.updateIfVisible(
                        CallActivity.STATE_ACTIVE, currentNumber, currentName, false);
                } else if (!appInForeground) {
                    Intent ca = new Intent(this, CallActivity.class);
                    ca.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK
                        | Intent.FLAG_ACTIVITY_CLEAR_TOP
                        | Intent.FLAG_ACTIVITY_SINGLE_TOP
                        | Intent.FLAG_ACTIVITY_NO_USER_ACTION);
                    ca.putExtra(CallActivity.EXTRA_STATE, CallActivity.STATE_ACTIVE);
                    ca.putExtra(CallActivity.EXTRA_NUMBER, currentNumber);
                    ca.putExtra(CallActivity.EXTRA_NAME, currentName);
                    ca.putExtra(CallActivity.EXTRA_INCOMING, false);
                    try { startActivity(ca); } catch (Exception ignore) {}
                } else {
                    Log.d(TAG, "ACTIVE: app foreground, web UI handles call");
                }
            } else if (stateStr.equals("DIALING") || stateStr.equals("CONNECTING")) {
                // Outgoing: keep CallActivity showing "Calling…" while the
                // remote side has not answered yet.
                if (CallActivity.isVisible()) {
                    CallActivity.updateIfVisible(
                        CallActivity.STATE_DIALING, currentNumber, currentName, false);
                }
            } else if (stateStr.equals("DISCONNECTED") || stateStr.equals("IDLE")) {
                CallNotifier.cancelIncoming(getApplicationContext());
                android.os.Handler h = new android.os.Handler(android.os.Looper.getMainLooper());
                h.postDelayed(() -> {
                    try { CallActivity.closeIfVisible(); } catch (Exception ignore) {}
                }, 800);
            }
        } catch (Exception e) {
            Log.w(TAG, "CallActivity sync failed", e);
        }

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
        return NameResolver.resolve(getApplicationContext(), number);
    }

    // Subscription id for the SIM that owns this call, or -1 if unknown.
    // TelecomManager.getSubscriptionId(PhoneAccountHandle) is not public API;
    // for SIM-backed accounts the PhoneAccountHandle id is typically the
    // subscription id as a string ("0", "1", ...). We parse it defensively
    // and fall back to -1 (default resolver) if it does not look numeric.
    private int subIdForCall(Call call) {
        try {
            if (call == null || call.getDetails() == null) return -1;
            android.telecom.PhoneAccountHandle handle = call.getDetails().getAccountHandle();
            if (handle == null) return -1;
            String id = handle.getId();
            if (id == null || id.isEmpty()) return -1;
            // Common formats: "1", "0", "SIM1", "subscription:1"
            java.util.regex.Matcher m =
                java.util.regex.Pattern.compile("(\\d+)").matcher(id);
            if (m.find()) {
                try {
                    return Integer.parseInt(m.group(1));
                } catch (Exception ignore) {}
            }
        } catch (Exception e) {
            Log.w(TAG, "subIdForCall failed", e);
        }
        return -1;
    }

    // Name resolved against the SIM that carried this call. Falls back to
    // the generic resolver if the subscription is unknown.
    private String lookupNameForCall(String number, Call call) {
        int subId = subIdForCall(call);
        if (subId < 0) return lookupName(number);
        return NameResolver.resolveForSubscription(getApplicationContext(), number, subId);
    }

    // Public wrapper so TelecomPlugin can call the protected platform method.
    // Called by CallActivity to toggle call recording without going through
    // the JS plugin bridge.
    public void startNativeRecording() {
        try {
            boolean ok = TelecomPlugin.startQuickRecording(getApplicationContext());
            isRecording = ok;
        } catch (Exception e) {
            android.util.Log.w(TAG, "startNativeRecording failed", e);
            isRecording = false;
        }
    }

    public void stopNativeRecording() {
        try {
            TelecomPlugin.stopQuickRecording();
        } catch (Exception e) {
            android.util.Log.w(TAG, "stopNativeRecording failed", e);
        }
        isRecording = false;
    }

    public void applyAudioRoute(int route) {
        try {
            setAudioRoute(route);
            Log.d(TAG, "applyAudioRoute -> " + route);
        } catch (Exception e) {
            Log.w(TAG, "applyAudioRoute failed", e);
        }
    }
}
