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
    public static final String STATE_DIALING = "DIALING";

    private String state = STATE_INCOMING;
    private String number = "";
    private String name = "";
    private boolean incoming = true;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private Runnable ticker;
    private long startedAt = 0L;
    private final StringBuilder numpadText = new StringBuilder();

    private static CallActivity instance = null;
    private com.google.android.gms.ads.AdView adView = null;

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

        // Load the native banner ad at the top of the call screen.
        try {
            com.google.android.gms.ads.MobileAds.initialize(getApplicationContext());
            adView = findViewById(R.id.call_ad_view);
            if (adView != null) {
                com.google.android.gms.ads.AdRequest req =
                    new com.google.android.gms.ads.AdRequest.Builder().build();
                adView.loadAd(req);
            }
        } catch (Exception e) {
            Log.w(TAG, "ad load failed", e);
        }

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
        try {
            if (adView != null) {
                adView.destroy();
                adView = null;
            }
        } catch (Exception ignore) {}
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
        View attend = findViewById(R.id.call_btn_attend);
        View dismiss = findViewById(R.id.call_btn_dismiss);
        View snooze = findViewById(R.id.call_btn_snooze);
        View end = findViewById(R.id.call_btn_end);
        View mute = findViewById(R.id.call_btn_mute);
        View speaker = findViewById(R.id.call_btn_speaker);
        View hold = findViewById(R.id.call_btn_hold);
        View keypad = findViewById(R.id.call_btn_keypad);

        if (attend != null) attend.setOnClickListener(v -> doAnswer());
        if (dismiss != null) dismiss.setOnClickListener(v -> doReject());
        if (snooze != null) snooze.setOnClickListener(v -> doRejectThenSnooze());
        if (end != null) end.setOnClickListener(v -> doEnd());
        if (mute != null) mute.setOnClickListener(v -> doToggleMute());
        if (speaker != null) speaker.setOnClickListener(v -> doToggleSpeaker());
        if (hold != null) hold.setOnClickListener(v -> doToggleHold());
        if (keypad != null) keypad.setOnClickListener(v -> openNumpad());

        // Numpad keys 0-9 * #
        int[] ids = { R.id.np_0, R.id.np_1, R.id.np_2, R.id.np_3, R.id.np_4,
                      R.id.np_5, R.id.np_6, R.id.np_7, R.id.np_8, R.id.np_9,
                      R.id.np_star, R.id.np_hash };
        for (int id : ids) {
            View k = findViewById(id);
            if (k instanceof TextView) {
                TextView tv = (TextView) k;
                final String ch = tv.getText().toString();
                k.setOnClickListener(v -> onNumpadKey(ch));
            }
        }

        View backspace = findViewById(R.id.call_numpad_backspace);
        if (backspace != null) backspace.setOnClickListener(v -> onNumpadBackspace());
        View numpadBack = findViewById(R.id.call_numpad_back);
        if (numpadBack != null) numpadBack.setOnClickListener(v -> closeNumpad());
    }

    private void openNumpad() {
        View main = findViewById(R.id.call_main);
        View pad = findViewById(R.id.call_numpad);
        if (main != null) main.setVisibility(View.GONE);
        if (pad != null) pad.setVisibility(View.VISIBLE);
        TextView nm = findViewById(R.id.call_numpad_name);
        if (nm != null) nm.setText(name == null ? number : name);
        renderNumpad();
    }

    private void closeNumpad() {
        View main = findViewById(R.id.call_main);
        View pad = findViewById(R.id.call_numpad);
        if (pad != null) pad.setVisibility(View.GONE);
        if (main != null) main.setVisibility(View.VISIBLE);
    }

    private void onNumpadKey(String ch) {
        if (ch == null || ch.isEmpty()) return;
        numpadText.append(ch);
        renderNumpad();
        // Send DTMF tone through the active call, if any.
        try {
            android.telecom.Call c = CallService.activeCall;
            if (c != null) c.playDtmfTone(ch.charAt(0));
            android.os.Handler h = new android.os.Handler(android.os.Looper.getMainLooper());
            h.postDelayed(() -> {
                try {
                    android.telecom.Call cc = CallService.activeCall;
                    if (cc != null) cc.stopDtmfTone();
                } catch (Exception ignore) {}
            }, 180);
        } catch (Exception e) {
            Log.w(TAG, "DTMF play failed", e);
        }
    }

    private void onNumpadBackspace() {
        if (numpadText.length() == 0) return;
        numpadText.deleteCharAt(numpadText.length() - 1);
        renderNumpad();
    }

    private void renderNumpad() {
        TextView d = findViewById(R.id.call_numpad_display);
        if (d != null) d.setText(numpadText.toString());
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

    private void updateCtrlHighlight(int viewId, boolean active) {
        try {
            View v = findViewById(viewId);
            if (v == null) return;
            int color = active ? 0xFF00D4FF : 0xFFE4E4E7;
            if (v instanceof android.view.ViewGroup) {
                android.view.ViewGroup g = (android.view.ViewGroup) v;
                for (int i = 0; i < g.getChildCount(); i++) {
                    View child = g.getChildAt(i);
                    if (child instanceof ImageView) {
                        ((ImageView) child).setColorFilter(color);
                    } else if (child instanceof TextView) {
                        ((TextView) child).setTextColor(color);
                    }
                }
            }
            if (active) {
                v.setBackgroundResource(R.drawable.bg_call_ctrl_active);
            } else {
                v.setBackgroundResource(0);
            }
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

        boolean isDialing = STATE_DIALING.equalsIgnoreCase(state);

        if (isIncoming) {
            if (status != null) status.setText("Incoming call");
            if (incomingRow != null) incomingRow.setVisibility(View.VISIBLE);
            if (snoozeBtn != null) snoozeBtn.setVisibility(View.VISIBLE);
            if (activeRow != null) activeRow.setVisibility(View.GONE);
            stopTicker();
            startedAt = 0L;
        } else {
            if (status != null) status.setText(isDialing ? "Calling…" : "Connected");
            if (incomingRow != null) incomingRow.setVisibility(View.GONE);
            if (snoozeBtn != null) snoozeBtn.setVisibility(View.GONE);
            if (activeRow != null) activeRow.setVisibility(View.VISIBLE);
            updateCtrlHighlight(R.id.call_btn_mute, CallService.isMuted);
            updateCtrlHighlight(R.id.call_btn_speaker, CallService.isSpeakerOn);
            updateCtrlHighlight(R.id.call_btn_hold, CallService.isHeld);
            if (isDialing) {
                stopTicker();
                startedAt = 0L;
            } else {
                startTickerIfNeeded();
            }
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

    @Override
    public void onBackPressed() {
        View pad = findViewById(R.id.call_numpad);
        if (pad != null && pad.getVisibility() == View.VISIBLE) {
            closeNumpad();
            return;
        }
        super.onBackPressed();
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
                    // Two-pass decode: read bounds, compute inSampleSize for
                    // a target size ~2x display (300px), then decode scaled.
                    BitmapFactory.Options opts = new BitmapFactory.Options();
                    opts.inJustDecodeBounds = true;
                    try (InputStream is1 = getContentResolver().openInputStream(Uri.parse(photo))) {
                        if (is1 != null) BitmapFactory.decodeStream(is1, null, opts);
                    } catch (Exception ignore) {}
                    int target = 300;
                    int sample = 1;
                    int w = opts.outWidth, h = opts.outHeight;
                    while (w / sample > target * 2 && h / sample > target * 2) {
                        sample *= 2;
                    }
                    BitmapFactory.Options opts2 = new BitmapFactory.Options();
                    opts2.inSampleSize = sample;
                    opts2.inPreferredConfig = Bitmap.Config.ARGB_8888;
                    Bitmap b = null;
                    try (InputStream is2 = getContentResolver().openInputStream(Uri.parse(photo))) {
                        if (is2 != null) b = BitmapFactory.decodeStream(is2, null, opts2);
                    } catch (Exception e) {
                        Log.w(TAG, "photo decode failed", e);
                    }
                    if (b != null) {
                        return circleCrop(b);
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

    // Center-crop to a square then mask to a circle. Result is square with
    // diameter == min(width, height) of the original.
    private Bitmap circleCrop(Bitmap src) {
        try {
            int size = Math.min(src.getWidth(), src.getHeight());
            int x = (src.getWidth() - size) / 2;
            int y = (src.getHeight() - size) / 2;
            Bitmap squared = Bitmap.createBitmap(src, x, y, size, size);
            if (squared != src) {
                // keep squared, recycle original later by GC
            }
            Bitmap output = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
            android.graphics.Canvas canvas = new android.graphics.Canvas(output);
            android.graphics.Paint paint = new android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG);
            paint.setShader(new android.graphics.BitmapShader(
                squared, android.graphics.Shader.TileMode.CLAMP, android.graphics.Shader.TileMode.CLAMP));
            float r = size / 2f;
            canvas.drawCircle(r, r, r, paint);
            return output;
        } catch (Exception e) {
            Log.w(TAG, "circleCrop failed", e);
            return src;
        }
    }
}
