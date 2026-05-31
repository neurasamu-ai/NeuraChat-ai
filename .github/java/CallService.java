package com.neurasamu.neurachat;

import android.telecom.Call;
import android.telecom.InCallService;
import android.content.Intent;

public class CallService extends InCallService {

    @Override
    public void onCallAdded(Call call) {
        super.onCallAdded(call);
        // Incoming/outgoing call aaya - MainActivity ko notify karo
        Intent intent = new Intent(this, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        intent.putExtra("call_state", call.getState());
        startActivity(intent);
    }

    @Override
    public void onCallRemoved(Call call) {
        super.onCallRemoved(call);
    }
}
