package com.neurasamu.build.chat;

import android.app.Activity;
import android.app.KeyguardManager;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.ContactsContract;
import android.util.Log;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.TextView;

import java.io.File;

// Full-screen alarm that plays when a VIP contact sends an SMS.
// Continues ringing until the user dismisses it (button, back, or power button).
public class VipAlarmActivity extends Activity {

    private static final String TAG = "NeuraVipAlarm";
    private MediaPlayer player = null;
    private final Handler clockHandler = new Handler(Looper.getMainLooper());
    private Runnable clockTicker;

    public static void launch(Context ctx, String number, String name, String body) {
        if (ctx == null) return;
        try {
            Intent i = new Intent(ctx, VipAlarmActivity.class);
            i.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK
                | Intent.FLAG_ACTIVITY_CLEAR_TOP
                | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            i.putExtra("sender", number == null ? "" : number);
            i.putExtra("name", name == null ? "" : name);
            i.putExtra("body", body == null ? "" : body);
            ctx.startActivity(i);
        } catch (Exception e) {
            Log.w(TAG, "launch failed", e);
        }
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        } else {
            getWindow().addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
                    | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
            );
        }
        getWindow().addFlags(
            WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
                | WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD
        );

        setContentView(R.layout.activity_vip_alarm);

        String sender = getIntent().getStringExtra("sender");
        String name = getIntent().getStringExtra("name");
        String body = getIntent().getStringExtra("body");

        String displayName = (name != null && !name.isEmpty()) ? name : (sender == null ? "Unknown" : sender);
        // If the web layer did not supply a name, try to resolve from contacts.
        if ((name == null || name.isEmpty()) && sender != null) {
            String resolved = lookupName(sender);
            if (resolved != null && !resolved.isEmpty()) displayName = resolved;
        }

        TextView nameView = findViewById(R.id.vip_alarm_name);
        TextView msgView = findViewById(R.id.vip_alarm_message);
        TextView timeView = findViewById(R.id.vip_alarm_time);
        if (nameView != null) nameView.setText(displayName);
        if (msgView != null) msgView.setText(body == null ? "" : body);

        // Live clock
        clockTicker = new Runnable() {
            @Override public void run() {
                if (timeView != null) {
                    java.text.SimpleDateFormat sdf = new java.text.SimpleDateFormat("HH:mm", java.util.Locale.getDefault());
                    timeView.setText(sdf.format(new java.util.Date()));
                }
                clockHandler.postDelayed(this, 15_000);
            }
        };
        clockHandler.post(clockTicker);

        View dismiss = findViewById(R.id.vip_alarm_dismiss);
        if (dismiss != null) dismiss.setOnClickListener(v -> finishAndDismiss());

        startRinging(sender);
    }

    private void startRinging(String sender) {
        try {
            // Determine the ringtone path.
            String path = VipContactStore.getRingtonePath(getApplicationContext(), sender);
            Uri sound;
            if (path != null && !path.isEmpty()) {
                File f = new File(path);
                if (f.exists()) {
                    sound = Uri.fromFile(f);
                } else {
                    sound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
                }
            } else {
                sound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
            }
            if (sound == null) sound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);

            player = new MediaPlayer();
            player.setAudioAttributes(new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ALARM)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build());
            player.setDataSource(this, sound);
            player.setLooping(true);
            player.prepare();
            player.start();

            // Also max out the alarm stream volume so a quiet phone still rings.
            try {
                AudioManager am = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
                if (am != null) {
                    int max = am.getStreamMaxVolume(AudioManager.STREAM_ALARM);
                    am.setStreamVolume(AudioManager.STREAM_ALARM, max, 0);
                }
            } catch (Exception ignore) {}
            Log.d(TAG, "ringing with " + sound);
        } catch (Exception e) {
            Log.w(TAG, "startRinging failed", e);
        }
    }

    private void stopRinging() {
        try {
            if (player != null) {
                if (player.isPlaying()) player.stop();
                player.release();
            }
        } catch (Exception ignore) {}
        player = null;
    }

    private void finishAndDismiss() {
        stopRinging();
        finishAndRemoveTask();
    }

    @Override
    public void onBackPressed() {
        finishAndDismiss();
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_POWER) {
            finishAndDismiss();
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    @Override
    protected void onDestroy() {
        clockHandler.removeCallbacks(clockTicker);
        stopRinging();
        super.onDestroy();
    }

    private String lookupName(String number) {
        android.database.Cursor c = null;
        try {
            Uri uri = Uri.withAppendedPath(
                ContactsContract.PhoneLookup.CONTENT_FILTER_URI,
                Uri.encode(number));
            c = getContentResolver().query(uri,
                new String[] { ContactsContract.PhoneLookup.DISPLAY_NAME },
                null, null, null);
            if (c != null && c.moveToFirst()) return c.getString(0);
        } catch (Exception ignore) {}
        finally { if (c != null) c.close(); }
        return "";
    }
}
