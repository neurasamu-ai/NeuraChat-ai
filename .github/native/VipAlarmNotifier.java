package com.neurasamu.build.chat;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.util.Log;

import androidx.core.app.NotificationCompat;

// Posts a HIGH-importance notification with a full-screen intent that
// launches VipAlarmActivity. This is the only reliable way to bring up
// an activity from a background BroadcastReceiver on Android 10+ —
// direct startActivity() from the receiver gets silently blocked.
public class VipAlarmNotifier {

    private static final String TAG = "NeuraVipNotif";
    private static final String CHANNEL_ID = "neura_vip_alarm";
    private static final String CHANNEL_NAME = "VIP Wake-Up Alarm";
    private static final int NOTIF_ID = 0x56504C41; // "VPLA"

    public static void show(Context ctx, String sender, String name, String body) {
        if (ctx == null) return;
        try {
            NotificationManager nm =
                (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null) return;

            // Channel (Android 8+)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                NotificationChannel ch = nm.getNotificationChannel(CHANNEL_ID);
                if (ch == null) {
                    ch = new NotificationChannel(
                        CHANNEL_ID, CHANNEL_NAME, NotificationManager.IMPORTANCE_HIGH);
                    ch.setDescription("Wake-up alarm for VIP contacts");
                    ch.setBypassDnd(true);
                    ch.enableLights(true);
                    ch.enableVibration(true);
                    ch.setShowBadge(false);
                    ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
                    nm.createNotificationChannel(ch);
                }
            }

            // Intent to launch the alarm activity (full-screen intent + tap)
            Intent fullIntent = new Intent(ctx, VipAlarmActivity.class);
            fullIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK
                | Intent.FLAG_ACTIVITY_CLEAR_TOP
                | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            fullIntent.putExtra("sender", sender == null ? "" : sender);
            fullIntent.putExtra("name", name == null ? "" : name);
            fullIntent.putExtra("body", body == null ? "" : body);

            int piFlags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                piFlags |= PendingIntent.FLAG_IMMUTABLE;
            }
            PendingIntent pi = PendingIntent.getActivity(
                ctx, 0, fullIntent, piFlags);

            NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, CHANNEL_ID)
                .setSmallIcon(com.neurasamu.build.chat.R.mipmap.ic_launcher)
                .setContentTitle("NeuraChat SMS")
                .setContentText("VIP wake-up alarm")
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setCategory(NotificationCompat.CATEGORY_ALARM)
                .setAutoCancel(true)
                .setOngoing(false)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setFullScreenIntent(pi, true)
                .setContentIntent(pi);

            nm.notify(NOTIF_ID, b.build());
            Log.d(TAG, "posted full-screen VIP alarm notification for " + sender);
        } catch (Exception e) {
            Log.w(TAG, "show failed", e);
        }
    }

    public static void cancel(Context ctx) {
        if (ctx == null) return;
        try {
            NotificationManager nm =
                (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) nm.cancel(NOTIF_ID);
        } catch (Exception e) {
            Log.w(TAG, "cancel failed", e);
        }
    }
}
