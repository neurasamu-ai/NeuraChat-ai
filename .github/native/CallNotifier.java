package com.neurasamu.build.chat;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.DownloadManager;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.util.Log;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

public class CallNotifier {

    private static final String TAG = "NeuraCallNotifier";
    private static final String CHANNEL_ID = "neura_call_missed";
    private static final String CHANNEL_NAME = "Missed Calls";
    private static final int NOTIFICATION_ID = 9001;

    public static void showMissed(Context context, String number, String name) {
        if (context == null) return;
        try {
            ensureChannel(context);

            // If name is missing, try a fresh lookup — CallService may have
            // fired before the contact provider was ready.
            if ((name == null || name.isEmpty()) && number != null && !number.isEmpty()) {
                name = lookupName(context, number);
            }

            String title = (name != null && !name.isEmpty()) ? name : (number == null ? "Unknown" : number);

            // Tap → open app
            Intent openIntent = new Intent(context, MainActivity.class);
            openIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            openIntent.putExtra("open_call_log", true);
            PendingIntent openPending = PendingIntent.getActivity(
                context, 2001, openIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

            // Call back action. Uses ACTION_DIAL so the system dialer
            // handles the call (or NeuraChat itself when it is the default
            // dialer). ACTION_CALL used to loop back into our own
            // CallIntentProcessor and did nothing.
            Intent callIntent = new Intent(Intent.ACTION_DIAL);
            if (number != null && !number.isEmpty()) {
                callIntent.setData(Uri.parse("tel:" + number));
            }
            callIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            PendingIntent callPending = PendingIntent.getActivity(
                context, 2002, callIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

            // Message action → open chat with number
            Intent msgIntent = new Intent(context, MainActivity.class);
            msgIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            msgIntent.putExtra("open_chat_with", number);
            msgIntent.putExtra("open_chat_name", title);
            PendingIntent msgPending = PendingIntent.getActivity(
                context, 2003, msgIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

            NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_stat_call)
                .setContentTitle("Missed call")
                .setContentText(title)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(title))
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setCategory(NotificationCompat.CATEGORY_MISSED_CALL)
                .setAutoCancel(true)
                .setContentIntent(openPending)
                .addAction(R.drawable.ic_stat_call, "Call back", callPending)
                .addAction(R.drawable.ic_stat_call, "Message", msgPending);

            try {
                NotificationManagerCompat.from(context).notify(NOTIFICATION_ID, builder.build());
            } catch (SecurityException se) {
                Log.w(TAG, "notify denied", se);
            }
        } catch (Exception e) {
            Log.e(TAG, "showMissed failed", e);
        }
    }

    private static void ensureChannel(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        if (nm.getNotificationChannel(CHANNEL_ID) != null) return;
        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID, CHANNEL_NAME, NotificationManager.IMPORTANCE_HIGH);
        channel.setDescription("Missed call notifications");
        nm.createNotificationChannel(channel);
    }

    private static String lookupName(Context context, String number) {
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

    // ---- Ongoing call notification (in-call UI can be reopened from here) ----
    private static final String ACTIVE_CHANNEL_ID = "neura_call_active";
    private static final String ACTIVE_CHANNEL_NAME = "Ongoing Call";
    private static final int ACTIVE_NOTIFICATION_ID = 9002;

    public static void showActive(Context context, String number, String name) {
        if (context == null) return;
        try {
            ensureActiveChannel(context);

            String title = (name != null && !name.isEmpty())
                ? name
                : (number == null ? "Unknown" : number);

            Intent openIntent = new Intent(context, MainActivity.class);
            openIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            openIntent.putExtra("open_active_call", true);
            PendingIntent openPending = PendingIntent.getActivity(
                context, 3001, openIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

            Intent endIntent = new Intent(context, SmsReplyReceiver.class);
            endIntent.setAction(SmsReplyReceiver.ACTION_END_CALL);
            PendingIntent endPending = PendingIntent.getBroadcast(
                context, 3002, endIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

            NotificationCompat.Builder builder = new NotificationCompat.Builder(context, ACTIVE_CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_stat_call)
                .setContentTitle("In call")
                .setContentText(title)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setCategory(NotificationCompat.CATEGORY_CALL)
                .setOngoing(true)
                .setAutoCancel(false)
                .setContentIntent(openPending)
                .addAction(R.drawable.ic_stat_call, "End", endPending);

            try {
                NotificationManagerCompat.from(context).notify(ACTIVE_NOTIFICATION_ID, builder.build());
            } catch (SecurityException se) {
                Log.w(TAG, "active notify denied", se);
            }
        } catch (Exception e) {
            Log.e(TAG, "showActive failed", e);
        }
    }

    public static void cancelActive(Context context) {
        if (context == null) return;
        try {
            NotificationManagerCompat.from(context).cancel(ACTIVE_NOTIFICATION_ID);
        } catch (Exception e) {
            Log.w(TAG, "cancelActive failed", e);
        }
    }

    private static void ensureActiveChannel(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        if (nm.getNotificationChannel(ACTIVE_CHANNEL_ID) != null) return;
        NotificationChannel channel = new NotificationChannel(
            ACTIVE_CHANNEL_ID, ACTIVE_CHANNEL_NAME, NotificationManager.IMPORTANCE_LOW);
        channel.setDescription("Ongoing call");
        nm.createNotificationChannel(channel);
    }

    // ---- Download notifications ----
    private static final String DL_CHANNEL_ID = "neura_downloads";
    private static final String DL_CHANNEL_NAME = "Downloads";
    private static final int DL_NOTIFICATION_ID = 9003;

    public static void showDownloadStarted(Context context, String fileName) {
        if (context == null) return;
        try {
            ensureDownloadChannel(context);

            Intent openIntent = new Intent(DownloadManager.ACTION_VIEW_DOWNLOADS);
            openIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            PendingIntent openPending = PendingIntent.getActivity(
                context, 4001, openIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

            NotificationCompat.Builder builder = new NotificationCompat.Builder(context, DL_CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_stat_sms)
                .setContentTitle("Downloading")
                .setContentText(fileName == null ? "File" : fileName)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setCategory(NotificationCompat.CATEGORY_PROGRESS)
                .setOngoing(true)
                .setProgress(0, 0, true)
                .setContentIntent(openPending);

            try {
                NotificationManagerCompat.from(context).notify(DL_NOTIFICATION_ID, builder.build());
            } catch (SecurityException se) {
                Log.w(TAG, "download notify denied", se);
            }
        } catch (Exception e) {
            Log.e(TAG, "showDownloadStarted failed", e);
        }
    }

    private static void ensureDownloadChannel(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        if (nm.getNotificationChannel(DL_CHANNEL_ID) != null) return;
        NotificationChannel channel = new NotificationChannel(
            DL_CHANNEL_ID, DL_CHANNEL_NAME, NotificationManager.IMPORTANCE_LOW);
        channel.setDescription("NeuraChat downloads");
        nm.createNotificationChannel(channel);
    }
}
