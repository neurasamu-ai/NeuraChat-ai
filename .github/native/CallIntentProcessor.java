package com.neurasamu.build.chat;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;

public class CallIntentProcessor extends Activity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Intent intent = getIntent();
        if (intent != null) {
            Uri data = intent.getData();
            if (data != null && "tel".equals(data.getScheme())) {
                String number = data.getSchemeSpecificPart();
                // MainActivity ko pre-filled dial number pass karo
                Intent launchIntent = new Intent(this, MainActivity.class);
                launchIntent.putExtra("dialNumber", number);
                launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
                startActivity(launchIntent);
            }
        }
        finish();
    }
}
