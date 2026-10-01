package com.neurasamu.build.chat;

import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.graphics.PixelFormat;
import android.net.Uri;
import android.os.Build;
import android.os.IBinder;
import android.provider.Settings;
import android.telecom.Call;
import android.util.Log;
import android.view.Gravity;
import android.view.LayoutInflater;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;

// Floating heads-up banner drawn over any app (incl. camera) using
// TYPE_APPLICATION_OVERLAY. Requires SYSTEM_ALERT_WINDOW granted.
// If permission is missing, CallService falls back to the full activity.
public class IncomingCallOverlay extends Service {

    private static final String TAG = "NeuraCallOverlay";

    private static IncomingCallOverlay instance = null;
    private static String activeNumber = null;

    private WindowManager windowManager;
    private View rootView;
    private String number = "";
    private String displayName = "";

    // ---- Public API ------------------------------------------------

    public static boolean canShow(Context ctx) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                return Settings.canDrawOverlays(ctx);
            }
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    public static void show(Context ctx, String num, String name) {
        if (ctx == null) return;
        if (!canShow(ctx)) {
            Log.w(TAG, "overlay permission missing");
            return;
        }
        try {
            Intent i = new Intent(ctx, IncomingCallOverlay.class);
            i.putExtra("number", num == null ? "" : num);
            i.putExtra("name", name == null ? "" : name);
            if (instance != null) {
                // Already showing — just update text
                instance.update(num, name);
                return;
            }
            ctx.startService(i);
        } catch (Exception e) {
            Log.e(TAG, "show failed", e);
        }
    }

    public static void hide(Context ctx) {
        try {
            if (instance != null) {
                instance.teardown();
            }
        } catch (Exception e) {
            Log.w(TAG, "hide failed", e);
        }
    }

    public static boolean isShowing() {
        return instance != null;
    }

    // ---- Service lifecycle -----------------------------------------

    @Override
    public IBinder onBind(Intent intent) { return null; }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) {
            stopSelf();
            return START_NOT_STICKY;
        }
        String num = intent.getStringExtra("number");
        String name = intent.getStringExtra("name");
        number = num == null ? "" : num;
        displayName = name == null ? "" : name;

        if (instance != null && rootView != null) {
            instance.update(number, displayName);
            return START_NOT_STICKY;
        }

        instance = this;
        activeNumber = number;
        try {
            attachView();
        } catch (Exception e) {
            Log.e(TAG, "attachView failed", e);
            teardown();
        }
        return START_NOT_STICKY;
    }

    private void update(String num, String name) {
        number = num == null ? "" : num;
        displayName = name == null ? "" : name;
        if (rootView == null) return;
        bindText();
    }

    @Override
    public void onDestroy() {
        teardown();
        super.onDestroy();
    }

    private void teardown() {
        try {
            if (rootView != null && windowManager != null) {
                windowManager.removeView(rootView);
            }
        } catch (Exception ignore) {}
        rootView = null;
        if (instance == this) {
            instance = null;
            activeNumber = null;
        }
        stopSelf();
    }

    // ---- View building ---------------------------------------------

    private void attachView() {
        windowManager = (WindowManager) getSystemService(Context.WINDOW_SERVICE);
        if (windowManager == null) { teardown(); return; }

        LayoutInflater inflater = (LayoutInflater) getSystemService(Context.LAYOUT_INFLATER_SERVICE);
        rootView = inflater.inflate(R.layout.overlay_incoming_call, null, false);

        int type = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            : WindowManager.LayoutParams.TYPE_PHONE;

        WindowManager.LayoutParams lp = new WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            type,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN
                | WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED,
            PixelFormat.TRANSLUCENT
        );
        lp.gravity = Gravity.TOP | Gravity.CENTER_HORIZONTAL;
        lp.x = 0;
        lp.y = dp(72);
        lp.width = (int) (getResources().getDisplayMetrics().widthPixels * 0.94);

        bindText();
        wireButtons();

        try {
            windowManager.addView(rootView, lp);
        } catch (Exception e) {
            Log.e(TAG, "addView failed", e);
            teardown();
        }
    }

    private void bindText() {
        TextView title = rootView.findViewById(R.id.overlay_title);
        TextView subtitle = rootView.findViewById(R.id.overlay_subtitle);
        TextView initial = rootView.findViewById(R.id.overlay_avatar_initial);
        ImageView avatar = rootView.findViewById(R.id.overlay_avatar_img);

        String shownName = (displayName != null && !displayName.isEmpty())
            ? displayName
            : (number == null || number.isEmpty() ? "Unknown" : number);

        if (title != null) title.setText(shownName);
        if (subtitle != null) subtitle.setText("Incoming call · NeuraChat");

        // Contact photo lookup
        android.graphics.Bitmap bmp = loadContactPhoto(number);
        if (bmp != null && avatar != null) {
            avatar.setImageBitmap(bmp);
            avatar.setVisibility(View.VISIBLE);
            if (initial != null) initial.setVisibility(View.GONE);
        } else {
            if (avatar != null) avatar.setVisibility(View.GONE);
            if (initial != null) {
                initial.setVisibility(View.VISIBLE);
                String src = (displayName != null && !displayName.isEmpty()) ? displayName : number;
                String ch = (src == null || src.isEmpty()) ? "?" : src.substring(0, 1).toUpperCase();
                initial.setText(ch);
            }
        }
    }

    private void wireButtons() {
        TextView attend = rootView.findViewById(R.id.overlay_btn_attend);
        TextView dismiss = rootView.findViewById(R.id.overlay_btn_dismiss);
        TextView snooze = rootView.findViewById(R.id.overlay_btn_snooze);
        LinearLayout snoozePanel = rootView.findViewById(R.id.overlay_snooze_panel);

        if (attend != null) attend.setOnClickListener(v -> doAnswer());
        if (dismiss != null) dismiss.setOnClickListener(v -> doReject());
        if (snooze != null && snoozePanel != null) {
            snooze.setOnClickListener(v ->
                snoozePanel.setVisibility(snoozePanel.getVisibility() == View.VISIBLE ? View.GONE : View.VISIBLE));
        }

        // Snooze options
        int[] ids = { R.id.overlay_snooze_5, R.id.overlay_snooze_10, R.id.overlay_snooze_15,
                      R.id.overlay_snooze_20, R.id.overlay_snooze_25, R.id.overlay_snooze_30 };
        int[] mins = { 5, 10, 15, 20, 25, 30 };
        for (int i = 0; i < ids.length; i++) {
            final int m = mins[i];
            TextView btn = rootView.findViewById(ids[i]);
            if (btn != null) btn.setOnClickListener(v -> doSnooze(m));
        }
        TextView cancel = rootView.findViewById(R.id.overlay_snooze_cancel);
        if (cancel != null && snoozePanel != null) {
            cancel.setOnClickListener(v -> snoozePanel.setVisibility(View.GONE));
        }

        // Hide button: dismiss overlay only. Ongoing notification stays.
        TextView hideBtn = rootView.findViewById(R.id.overlay_btn_hide);
        if (hideBtn != null) hideBtn.setOnClickListener(v -> hide(getApplicationContext()));

        // Body tap → open full call UI (without answering)
        TextView title = rootView.findViewById(R.id.overlay_title);
        TextView subtitle = rootView.findViewById(R.id.overlay_subtitle);
        View.OnClickListener openUi = v -> openFullUi();
        if (title != null) title.setOnClickListener(openUi);
        if (subtitle != null) subtitle.setOnClickListener(openUi);
        FrameLayout avatarWrap = null;
        try { avatarWrap = (FrameLayout) rootView.findViewById(R.id.overlay_avatar_img).getParent(); } catch (Exception ignore) {}
        if (avatarWrap != null) avatarWrap.setOnClickListener(openUi);
    }

    // ---- Actions ---------------------------------------------------

    private void doAnswer() {
        try {
            Call c = CallService.activeCall;
            if (c != null) {
                c.answer(0);
                Log.d(TAG, "answered via overlay");
            }
        } catch (Exception e) {
            Log.w(TAG, "answer failed", e);
        }
        openFullUi();
        hide(getApplicationContext());
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
        hide(getApplicationContext());
    }

    private void doSnooze(int minutes) {
        try {
            if (number != null && !number.isEmpty()) {
                SnoozeStore.setSnooze(getApplicationContext(), number, minutes);
                Log.d(TAG, "snoozed " + number + " for " + minutes + " min");
            }
        } catch (Exception e) {
            Log.w(TAG, "snooze failed", e);
        }
        doReject();
    }

    private void openFullUi() {
        // Remove the overlay, then open the native call screen — never
        // MainActivity, so the WebView app is not brought forward by a call.
        hide(getApplicationContext());
        try {
            Intent i = new Intent(this, CallActivity.class);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK
                | Intent.FLAG_ACTIVITY_CLEAR_TOP
                | Intent.FLAG_ACTIVITY_SINGLE_TOP
                | Intent.FLAG_ACTIVITY_NO_USER_ACTION);
            i.putExtra(CallActivity.EXTRA_STATE, CallActivity.STATE_INCOMING);
            i.putExtra(CallActivity.EXTRA_NUMBER, number == null ? "" : number);
            i.putExtra(CallActivity.EXTRA_NAME, displayName == null ? "" : displayName);
            i.putExtra(CallActivity.EXTRA_INCOMING, true);
            startActivity(i);
        } catch (Exception e) {
            Log.w(TAG, "openFullUi failed", e);
        }
    }

    // ---- Helpers ---------------------------------------------------

    private int dp(int v) {
        return (int) (v * getResources().getDisplayMetrics().density);
    }

    private android.graphics.Bitmap loadContactPhoto(String num) {
        if (num == null || num.isEmpty()) return null;
        android.database.Cursor c = null;
        try {
            Uri uri = Uri.withAppendedPath(
                android.provider.ContactsContract.PhoneLookup.CONTENT_FILTER_URI,
                Uri.encode(num));
            c = getContentResolver().query(uri,
                new String[] { android.provider.ContactsContract.PhoneLookup.PHOTO_URI },
                null, null, null);
            if (c != null && c.moveToFirst()) {
                String photo = c.getString(0);
                if (photo != null && !photo.isEmpty()) {
                    java.io.InputStream is = getContentResolver().openInputStream(Uri.parse(photo));
                    if (is != null) {
                        android.graphics.Bitmap b = android.graphics.BitmapFactory.decodeStream(is);
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
