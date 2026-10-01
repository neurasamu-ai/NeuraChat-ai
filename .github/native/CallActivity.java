package com.neurasamu.build.chat;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.ContactsContract;
import android.telecom.Call;
import android.util.Log;
import android.view.View;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.TextView;

import java.io.InputStream;

// Native call screen. Runs in its own task so opening it never brings the
// WebView (MainActivity) forward. Two states: INCOMING and ACTIVE.
public class CallActivity extends Activity {

    private static final String TAG = "NeuraCallActivity";

    public static final String EXTRA_STATE = "state";
    public static final String EXTRA_NUMBER = "number";
    public static final String EXTRA_NAME = "name";
    public static final String EXTRA_INCOMING = "incoming";

    public static final String STATE_INCOMING = "INCOMING";
    public static final String STATE_ACTIVE = "ACTIVE";

    private String state = STATE_INCOMING;
    private String number = "";
    private String name = "";
    private boolean incoming = true;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private Runnable ticker;
    private long startedAt = 0L;

    private static CallActivity instance = null;

    public static boolean isVisible() {
        return instance != null;
    }

    public static void updateIfVisible(String newState, String num, String nm, boolean in) {
        if (instance == null) return;
        instance.runOnUiThread(() -> instance.applyState(newState, num, nm, in));
    }

    public static void closeIfVisible() {
        if (instance == null) return;
        instance.runOnUiThread(() -> {
            try { instance.finishAndRemoveTask(); }
            catch (Exception e) { try { instance.finish(); } catch (Exception ignore) {} }
        });
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        instance = this;

        // Show over lock screen + turn screen on, without unlocking.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        } else {
            getWindow().addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
                    | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
            );
        }
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        setContentView(R.layout.activity_call);

        readIntent(getIntent());
        wireButtons();
        applyState(state, number, name, incoming);

        Log.d(TAG, "onCreate state=" + state + " number=" + number);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        readIntent(intent);
        applyState(state, number, name, incoming);
    }

    @Override
    protected void onDestroy() {
        if (instance == this) instance = null;
        stopTicker();
        super.onDestroy();
    }

    private void readIntent(Intent intent) {
        if (intent == null) return;
        String s = intent.getStringExtra(EXTRA_STATE);
        if (s != null && !s.isEmpty()) state = s;
        String n = intent.getStringExtra(EXTRA_NUMBER);
        if (n != null) number = n;
        String nm = intent.getStringExtra(EXTRA_NAME);
        if (nm != null) name = nm;
        incoming = intent.getBooleanExtra(EXTRA_INCOMING, true);
    }

    private void wireButtons() {
        TextView attend = findViewById(R.id.call_btn_attend);
        TextView dismiss = findViewById(R.id.call_btn_dismiss);
        TextView snooze = findViewById(R.id.call_btn_snooze);
        TextView end = findViewById(R.id.call_btn_end);
        TextView mute = findViewById(R.id.call_btn_mute);
        TextView speaker = findViewById(R.id.call_btn_speaker);
        TextView hold = findViewById(R.id.call_btn_hold);
        TextView record = findViewById(R.id.call_btn_record);

        if (attend != null) attend.setOnClickListener(v -> doAnswer());
        if (dismiss != null) dismiss.setOnClickListener(v -> doReject());
        if (snooze != null) snooze.setOnClickListener(v -> doRejectThenSnooze());
        if (end != null) end.setOnClickListener(v -> doEnd());
        if (mute != null) mute.setOnClickListener(v -> doToggleMute());
        if (speaker != null) speaker.setOnClickListener(v -> doToggleSpeaker());
        if (hold != null) hold.setOnClickListener(v -> doToggleHold());
        if (record != null) record.setOnClickListener(v -> doToggleRecord());
    }

    private void doToggleMute() {
        try {
            CallService.isMuted = !CallService.isMuted;
            android.media.AudioManager am =
                (android.media.AudioManager) getSystemService(AUDIO_SERVICE);
            if (am != null) am.setMicrophoneMute(CallService.isMuted);
            updateCtrlHighlight(R.id.call_btn_mute, CallService.isMuted);
        } catch (Exception e) {
            Log.w(TAG, "toggleMute failed", e);
        }
    }

    private void doToggleSpeaker() {
        try {
            CallService.isSpeakerOn = !CallService.isSpeakerOn;
            boolean on = CallService.isSpeakerOn;
            boolean routed = false;
            try {
                if (CallService.instance != null) {
                    int route = on
                        ? android.telecom.CallAudioState.ROUTE_SPEAKER
                        : android.telecom.CallAudioState.ROUTE_EARPIECE;
                    CallService.instance.applyAudioRoute(route);
                    routed = true;
                }
            } catch (Exception ignore) {}
            if (!routed) {
                android.media.AudioManager am =
                    (android.media.AudioManager) getSystemService(AUDIO_SERVICE);
                if (am != null) am.setSpeakerphoneOn(on);
            }
            updateCtrlHighlight(R.id.call_btn_speaker, on);
        } catch (Exception e) {
            Log.w(TAG, "toggleSpeaker failed", e);
        }
    }

    private void doToggleHold() {
        try {
            android.telecom.Call c = CallService.activeCall;
            if (c == null) return;
            boolean nowHeld = !CallService.isHeld;
            if (nowHeld) c.hold(); else c.unhold();
            CallService.isHeld = nowHeld;
            updateCtrlHighlight(R.id.call_btn_hold, nowHeld);
        } catch (Exception e) {
            Log.w(TAG, "toggleHold failed", e);
        }
    }

    private void doToggleRecord() {
        try {
            boolean rec = !CallService.isRecording;
            if (rec) {
                if (CallService.instance != null) {
                    CallService.instance.startNativeRecording();
                }
            } else {
                if (CallService.instance != null) {
                    CallService.instance.stopNativeRecording();
                }
            }
            CallService.isRecording = rec;
            updateCtrlHighlight(R.id.call_btn_record, rec);
        } catch (Exception e) {
            Log.w(TAG, "toggleRecord failed", e);
        }
    }

    private void updateCtrlHighlight(int viewId, boolean active) {
        try {
            TextView v = findViewById(viewId);
            if (v == null) return;
            v.setBackgroundResource(active
                ? R.drawable.bg_call_ctrl_active
                : R.drawable.bg_call_ctrl);
            v.setTextColor(active ? 0xFF00D4FF : 0xFFE4E4E7);
        } catch (Exception ignore) {}
    }

    private void applyState(String newState, String num, String nm, boolean in) {
        this.state = newState;
        this.number = num == null ? "" : num;
        this.name = nm == null ? "" : nm;
        this.incoming = in;

        TextView title = findViewById(R.id.call_title);
        TextView subtitle = findViewById(R.id.call_subtitle);
        TextView status = findViewById(R.id.call_status);
        ImageView avatarImg = findViewById(R.id.call_avatar_img);
        TextView avatarInitial = findViewById(R.id.call_avatar_initial);

        String shown = (name != null && !name.isEmpty())
            ? name
            : (number == null || number.isEmpty() ? "Unknown" : number);

        if (title != null) title.setText(shown);
        if (subtitle != null) subtitle.setText(number == null ? "" : number);

        Bitmap bmp = loadContactPhoto(number);
        if (bmp != null && avatarImg != null) {
            avatarImg.setImageBitmap(bmp);
            avatarImg.setVisibility(View.VISIBLE);
            if (avatarInitial != null) avatarInitial.setVisibility(View.GONE);
        } else {
            if (avatarImg != null) avatarImg.setVisibility(View.GONE);
            if (avatarInitial != null) {
                avatarInitial.setVisibility(View.VISIBLE);
                String src = !shown.isEmpty() ? shown : "?";
                String[] parts = src.trim().split("\\s+");
                String initials;
                if (parts.length >= 2 && !parts[0].isEmpty() && !parts[1].isEmpty()) {
                    initials = "" + parts[0].charAt(0) + parts[1].charAt(0);
                } else {
                    initials = src.substring(0, Math.min(2, src.length()));
                }
                avatarInitial.setText(initials.toUpperCase());
            }
        }

        boolean isIncoming = STATE_INCOMING.equalsIgnoreCase(state);
        View attendBtn = findViewById(R.id.call_btn_attend);
        View dismissBtn = findViewById(R.id.call_btn_dismiss);
        View snoozeBtn = findViewById(R.id.call_btn_snooze);
        View incomingRow = findViewById(R.id.call_incoming_row);
        View activeRow = findViewById(R.id.call_active_row);

        if (isIncoming) {
            if (status != null) status.setText("Incoming call");
            if (incomingRow != null) incomingRow.setVisibility(View.VISIBLE);
            if (snoozeBtn != null) snoozeBtn.setVisibility(View.VISIBLE);
            if (activeRow != null) activeRow.setVisibility(View.GONE);
            stopTicker();
        } else {
            if (status != null) status.setText("Connected");
            if (incomingRow != null) incomingRow.setVisibility(View.GONE);
            if (snoozeBtn != null) snoozeBtn.setVisibility(View.GONE);
            if (activeRow != null) activeRow.setVisibility(View.VISIBLE);
            updateCtrlHighlight(R.id.call_btn_mute, CallService.isMuted);
            updateCtrlHighlight(R.id.call_btn_speaker, CallService.isSpeakerOn);
            updateCtrlHighlight(R.id.call_btn_hold, CallService.isHeld);
            updateCtrlHighlight(R.id.call_btn_record, CallService.isRecording);
            startTickerIfNeeded();
        }
    }

    private void startTickerIfNeeded() {
        stopTicker();
        if (startedAt == 0L) startedAt = System.currentTimeMillis();
        ticker = new Runnable() {
            @Override public void run() {
                TextView status = findViewById(R.id.call_status);
                if (status != null && !STATE_INCOMING.equalsIgnoreCase(state)) {
                    long elapsed = System.currentTimeMillis() - startedAt;
                    long sec = (elapsed / 1000) % 60;
                    long min = (elapsed / 60000) % 60;
                    long hr = elapsed / 3600000;
                    String label = hr > 0
                        ? String.format("%d:%02d:%02d", hr, min, sec)
                        : String.format("%02d:%02d", min, sec);
                    status.setText(label);
                }
                handler.postDelayed(this, 1000);
            }
        };
        handler.post(ticker);
    }

    private void stopTicker() {
        if (ticker != null) {
            handler.removeCallbacks(ticker);
            ticker = null;
        }
    }

    // ---- Actions ----

    private void doAnswer() {
        try {
            Call c = CallService.activeCall;
            if (c != null) c.answer(0);
        } catch (Exception e) {
            Log.w(TAG, "answer failed", e);
        }
        applyState(STATE_ACTIVE, number, name, false);
    }

    private void doReject() {
        try {
            Call c = CallService.activeCall;
            if (c != null) {
                try { c.reject(false, null); } catch (Exception ignore) {}
            }
        } catch (Exception e) {
            Log.w(TAG, "reject failed", e);
        }
        finishSoon();
    }

    private void doRejectThenSnooze() {
        try {
            if (number != null && !number.isEmpty()) {
                SnoozeStore.setSnooze(getApplicationContext(), number, 5);
            }
        } catch (Exception ignore) {}
        doReject();
    }

    private void doEnd() {
        try {
            Call c = CallService.activeCall;
            if (c != null) c.disconnect();
        } catch (Exception e) {
            Log.w(TAG, "end failed", e);
        }
        finishSoon();
    }

    public void finishSoon() {
        handler.postDelayed(() -> {
            try { finishAndRemoveTask(); } catch (Exception e) { finish(); }
        }, 200);
    }

    // ---- Helpers ----

    private Bitmap loadContactPhoto(String num) {
        if (num == null || num.isEmpty()) return null;
        android.database.Cursor c = null;
        try {
            Uri uri = Uri.withAppendedPath(
                ContactsContract.PhoneLookup.CONTENT_FILTER_URI,
                Uri.encode(num));
            c = getContentResolver().query(uri,
                new String[] { ContactsContract.PhoneLookup.PHOTO_URI },
                null, null, null);
            if (c != null && c.moveToFirst()) {
                String photo = c.getString(0);
                if (photo != null && !photo.isEmpty()) {
                    InputStream is = getContentResolver().openInputStream(Uri.parse(photo));
                    if (is != null) {
                        Bitmap b = BitmapFactory.decodeStream(is);
                        try { is.close(); } catch (Exception ignore) {}
                        return b;
                    }
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "loadContactPhoto failed", e);
        } finally {
            if (c != null) c.close();
        }
        return null;
    }
}
