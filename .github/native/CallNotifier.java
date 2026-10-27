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
        return NameResolver.resolve(context, number);
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

            // Tap on the notification reopens the native call screen.
            Intent openIntent = new Intent(context, CallActivity.class);
            openIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK
                | Intent.FLAG_ACTIVITY_CLEAR_TOP
                | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            openIntent.putExtra(CallActivity.EXTRA_STATE, CallActivity.STATE_ACTIVE);
            openIntent.putExtra(CallActivity.EXTRA_NUMBER, number == null ? "" : number);
            openIntent.putExtra(CallActivity.EXTRA_NAME, name == null ? "" : name);
            openIntent.putExtra(CallActivity.EXTRA_INCOMING, false);
            PendingIntent openPending = PendingIntent.getActivity(
                context, 3001, openIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

            // Mute toggle action.
            boolean muted = CallService.isMuted;
            Intent muteIntent = new Intent(context, SmsReplyReceiver.class);
            muteIntent.setAction(SmsReplyReceiver.ACTION_TOGGLE_MUTE);
            PendingIntent mutePending = PendingIntent.getBroadcast(
                context, 3003, muteIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

            // End call action.
            Intent endIntent = new Intent(context, SmsReplyReceiver.class);
            endIntent.setAction(SmsReplyReceiver.ACTION_END_CALL);
            PendingIntent endPending = PendingIntent.getBroadcast(
                context, 3002, endIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

            long startedAt = CallService.callStartedAt > 0
                ? CallService.callStartedAt
                : System.currentTimeMillis();

            NotificationCompat.Builder builder = new NotificationCompat.Builder(context, ACTIVE_CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_stat_call)
                .setContentTitle(title)
                .setContentText(muted ? "In call · Muted" : "In call")
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setCategory(NotificationCompat.CATEGORY_CALL)
                .setOngoing(true)
                .setAutoCancel(false)
                .setUsesChronometer(true)
                .setShowWhen(true)
                .setWhen(startedAt)
                .setOnlyAlertOnce(true)
                .setContentIntent(openPending)
                .addAction(R.drawable.ic_call_mic, muted ? "Unmute" : "Mute", mutePending)
                .addAction(R.drawable.ic_call_phone_down, "End", endPending);

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

    // ---- Incoming call: CallStyle notification (Android 12+) --------
    // Presents the system call UI (Answer / Decline) plus a
    // fullScreenIntent pointing at CallActivity. On lock screen or screen
    // off, Android launches CallActivity directly via the full-screen
    // intent, so the user sees the call screen immediately.

    private static final String INCOMING_CHANNEL_ID = "neura_call_incoming_v3";
    private static final String INCOMING_CHANNEL_NAME = "Incoming Calls";
    private static final int INCOMING_NOTIFICATION_ID = 9100;

    public static void showIncoming(Context context, String number, String name) {
        if (context == null) return;
        try {
            ensureIncomingChannel(context);

            String title = (name != null && !name.isEmpty())
                ? name
                : (number == null || number.isEmpty() ? "Unknown" : number);

            Intent fullIntent = new Intent(context, CallActivity.class);
            fullIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK
                | Intent.FLAG_ACTIVITY_CLEAR_TOP
                | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            fullIntent.putExtra(CallActivity.EXTRA_STATE, CallActivity.STATE_INCOMING);
            fullIntent.putExtra(CallActivity.EXTRA_NUMBER, number == null ? "" : number);
            fullIntent.putExtra(CallActivity.EXTRA_NAME, name == null ? "" : name);
            fullIntent.putExtra(CallActivity.EXTRA_INCOMING, true);

            PendingIntent fullPending = PendingIntent.getActivity(
                context, 5001, fullIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

            Intent answerIntent = new Intent(context, SmsReplyReceiver.class);
            answerIntent.setAction(SmsReplyReceiver.ACTION_ANSWER_CALL);
            PendingIntent answerPending = PendingIntent.getBroadcast(
                context, 5002, answerIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

            Intent declineIntent = new Intent(context, SmsReplyReceiver.class);
            declineIntent.setAction(SmsReplyReceiver.ACTION_END_CALL);
            PendingIntent declinePending = PendingIntent.getBroadcast(
                context, 5003, declineIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

            NotificationCompat.Builder builder = new NotificationCompat.Builder(
                context, INCOMING_CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_stat_call)
                .setContentTitle(title)
                .setContentText("Incoming call")
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setCategory(NotificationCompat.CATEGORY_CALL)
                .setOngoing(true)
                .setAutoCancel(false)
                .setShowWhen(false)
                .setContentIntent(fullPending)
                .setFullScreenIntent(fullPending, true)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC);

            try {
                androidx.core.app.Person caller = new androidx.core.app.Person.Builder()
                    .setName(title)
                    .build();
                // CallStyle.forIncomingCall already wires Decline + Answer
                // actions, so we do NOT add them again (that showed up as
                // duplicate "Answer Answer" buttons on some ROMs).
                NotificationCompat.CallStyle callStyle =
                    NotificationCompat.CallStyle.forIncomingCall(
                        caller, declinePending, answerPending);
                builder.setStyle(callStyle);
            } catch (Throwable t) {
                Log.w(TAG, "CallStyle unavailable, falling back", t);
                builder.addAction(R.drawable.ic_stat_call, "Answer", answerPending);
                builder.addAction(R.drawable.ic_stat_call, "Decline", declinePending);
            }

            try {
                NotificationManagerCompat.from(context).notify(
                    INCOMING_NOTIFICATION_ID, builder.build());
                Log.d(TAG, "incoming call notification posted for " + number);
            } catch (SecurityException se) {
                Log.w(TAG, "notify denied", se);
            }
        } catch (Exception e) {
            Log.e(TAG, "showIncoming failed", e);
        }
    }

    public static void cancelIncoming(Context context) {
        if (context == null) return;
        try {
            NotificationManagerCompat.from(context).cancel(INCOMING_NOTIFICATION_ID);
        } catch (Exception e) {
            Log.w(TAG, "cancelIncoming failed", e);
        }
    }

    private static void ensureIncomingChannel(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        if (nm.getNotificationChannel(INCOMING_CHANNEL_ID) != null) return;
        NotificationChannel channel = new NotificationChannel(
            INCOMING_CHANNEL_ID, INCOMING_CHANNEL_NAME,
            NotificationManager.IMPORTANCE_HIGH);
        channel.setDescription("Incoming call notifications");
        channel.enableVibration(true);
        channel.setShowBadge(false);
        try {
            android.net.Uri soundUri = SoundPreferenceStore.effectiveUri(context, "call");
            if (soundUri != null) {
                channel.setSound(
                    soundUri,
                    new android.media.AudioAttributes.Builder()
                        .setContentType(android.media.AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .setUsage(android.media.AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                        .build()
                );
            }
        } catch (Exception ignore) {}
        nm.createNotificationChannel(channel);
    }
}
