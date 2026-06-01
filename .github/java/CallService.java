package com.neurasamu.neurachat;

import android.telecom.Call;
import android.telecom.InCallService;
import android.content.Intent;
import android.util.Log;

public class CallService extends InCallService {
    
    // Yahan store hoga current call jisko TelecomPlugin access karega
    public static Call activeCall = null;

    private Call.Callback callCallback = new Call.Callback() {
        @Override
        public void onStateChanged(Call call, int state) {
            super.onStateChanged(call, state);
            String stateStr = getStateString(state);
            TelecomPlugin.dispatchCallState(stateStr, getNumber(call));
        }
    };

    @Override
    public void onCallAdded(Call call) {
        super.onCallAdded(call);
        activeCall = call;
        call.registerCallback(callCallback);
        
        // Frontend ko immediately notify kar rahe hain
        TelecomPlugin.dispatchCallState(getStateString(call.getState()), getNumber(call));

        // Activity wake up logic
        Intent intent = new Intent(this, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        intent.putExtra("call_state", call.getState());
        startActivity(intent);
    }

    @Override
    public void onCallRemoved(Call call) {
        super.onCallRemoved(call);
        call.unregisterCallback(callCallback);
        if (activeCall == call) {
            activeCall = null;
        }
        TelecomPlugin.dispatchCallState("DISCONNECTED", getNumber(call));
    }

    private String getStateString(int state) {
        switch (state) {
            case Call.STATE_RINGING: return "RINGING";
            case Call.STATE_DIALING: return "DIALING";
            case Call.STATE_ACTIVE: return "ACTIVE";
            case Call.STATE_DISCONNECTED: return "DISCONNECTED";
            default: return "UNKNOWN";
        }
    }

    private String getNumber(Call call) {
        if (call != null && call.getDetails() != null && call.getDetails().getHandle() != null) {
            return call.getDetails().getHandle().getSchemeSpecificPart();
        }
        return "Unknown";
    }
}
