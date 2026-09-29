package com.neurasamu.build.chat;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.provider.Telephony;
import android.telephony.SmsManager;
import android.util.Log;
import android.widget.RemoteViews;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.app.RemoteInput;

public class SmsNotifier {

    private static final String TAG = "NeuraSmsNotifier";
    private static final String CHANNEL_ID = "neura_sms_incoming_v2";
    private static final String CHANNEL_NAME = "Incoming SMS";
    private static final String KEY_REPLY_TEXT = "neura_reply_text";
    private static final int NOTIFICATION_ID = 8001;

    public static void show(Context context, String sender, String body, long timestamp) {
        try {
            ensureChannel(context);

            // Look up the display name for the sender, if any.
            String displayName = lookupName(context, sender);

            // 1. Tap notification → open app chat for this sender
            Intent openIntent = new Intent(context, MainActivity.class);
            openIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            openIntent.putExtra("open_chat_with", sender);
            openIntent.putExtra("open_chat_name", sender);
            PendingIntent openPending = PendingIntent.getActivity(
                context,
                1001,
                openIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );

            // 2. Reply action (RemoteInput)
            RemoteInput remoteInput = new RemoteInput.Builder(KEY_REPLY_TEXT)
                .setLabel("Reply")
                .build();

            Intent replyIntent = new Intent(context, SmsReplyReceiver.class);
            replyIntent.setAction(SmsReplyReceiver.ACTION_REPLY);
            replyIntent.putExtra("sender", sender);
            replyIntent.putExtra("notification_id", NOTIFICATION_ID);

            PendingIntent replyPending = PendingIntent.getBroadcast(
                context,
                1002,
                replyIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_MUTABLE
            );

            NotificationCompat.Action replyAction = new NotificationCompat.Action.Builder(
                R.drawable.ic_stat_sms,
                "Reply",
                replyPending
            ).addRemoteInput(remoteInput).build();

            // 3. Mark as read action
            Intent markReadIntent = new Intent(context, SmsReplyReceiver.class);
            markReadIntent.setAction(SmsReplyReceiver.ACTION_MARK_READ);
            markReadIntent.putExtra("sender", sender);
            markReadIntent.putExtra("notification_id", NOTIFICATION_ID);
            PendingIntent markReadPending = PendingIntent.getBroadcast(
                context,
                1003,
                markReadIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );

            NotificationCompat.Action markReadAction = new NotificationCompat.Action.Builder(
                R.drawable.ic_stat_sms,
                "Mark as read",
                markReadPending
            ).build();

            String title = (displayName != null && !displayName.isEmpty()) ? displayName : sender;
            String timeStr;
            try {
                timeStr = android.text.format.DateFormat.getTimeFormat(context).format(new java.util.Date(timestamp));
            } catch (Exception e) {
                timeStr = "";
            }

            RemoteViews customView = null;
            try {
                customView = new RemoteViews(context.getPackageName(), R.layout.notification_neura_card);
                customView.setTextViewText(R.id.neura_card_title, title);
                customView.setTextViewText(R.id.neura_card_body, body == null ? "" : body);
                customView.setTextViewText(R.id.neura_card_time, timeStr);
                customView.setImageViewResource(R.id.neura_card_icon, R.drawable.ic_stat_sms);
            } catch (Exception e) {
                Log.w(TAG, "RemoteViews build failed, falling back", e);
                customView = null;
            }

            NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_stat_sms)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setCategory(NotificationCompat.CATEGORY_MESSAGE)
                .setAutoCancel(true)
                .setContentIntent(openPending)
                .setDefaults(android.app.Notification.DEFAULT_ALL)
                .setVibrate(new long[]{0, 250, 200, 250})
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .addAction(replyAction)
                .addAction(markReadAction)
                .setWhen(timestamp);

            if (customView != null) {
                builder.setStyle(new NotificationCompat.DecoratedCustomViewStyle());
                builder.setCustomContentView(customView);
                builder.setCustomBigContentView(customView);
            }

            NotificationManagerCompat nm = NotificationManagerCompat.from(context);
            try {
                nm.notify(NOTIFICATION_ID, builder.build());
            } catch (SecurityException se) {
                Log.w(TAG, "notify denied (POST_NOTIFICATIONS)", se);
            }
        } catch (Exception e) {
            Log.e(TAG, "show failed", e);
        }
    }

    private static void ensureChannel(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        NotificationChannel existing = nm.getNotificationChannel(CHANNEL_ID);
        if (existing != null) return;
        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            CHANNEL_NAME,
            NotificationManager.IMPORTANCE_HIGH
        );
        channel.setDescription("Incoming SMS notifications");
        channel.enableLights(true);
        channel.enableVibration(true);
        channel.setShowBadge(true);
        channel.setVibrationPattern(new long[]{0, 250, 200, 250});
        try {
            channel.setSound(
                android.media.RingtoneManager.getDefaultUri(android.media.RingtoneManager.TYPE_NOTIFICATION),
                new android.media.AudioAttributes.Builder()
                    .setContentType(android.media.AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .setUsage(android.media.AudioAttributes.USAGE_NOTIFICATION)
                    .build()
            );
        } catch (Exception ignored) {}
        nm.createNotificationChannel(channel);
    }

    private static String lookupName(Context context, String number) {
        if (number == null || number.isEmpty()) return "";
        android.database.Cursor c = null;
        try {
            android.net.Uri uri = android.net.Uri.withAppendedPath(
                android.provider.ContactsContract.PhoneLookup.CONTENT_FILTER_URI,
                android.net.Uri.encode(number));
            c = context.getContentResolver().query(
                uri,
                new String[] { android.provider.ContactsContract.PhoneLookup.DISPLAY_NAME },
                null, null, null);
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
}
