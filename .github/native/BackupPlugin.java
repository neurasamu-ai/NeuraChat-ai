package com.neurasamu.build.chat;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Log;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

@CapacitorPlugin(name = "BackupPlugin")
public class BackupPlugin extends Plugin {

    private static final String TAG = "NeuraBackup";
    private static final String SUBDIR = "NeuraChat";

    // Write a JSON backup to Downloads/NeuraChat/<filename>
    @PluginMethod
    public void writeBackup(PluginCall call) {
        String filename = call.getString("filename");
        String content = call.getString("content");
        if (filename == null || filename.isEmpty() || content == null) {
            call.reject("filename and content are required");
            return;
        }

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                writeViaMediaStore(filename, content, call);
            } else {
                writeViaLegacy(filename, content, call);
            }
        } catch (Exception e) {
            Log.e(TAG, "writeBackup failed", e);
            call.reject("Backup failed: " + e.getMessage());
        }
    }

    private void writeViaMediaStore(String filename, String content, PluginCall call) throws Exception {
        ContentResolver cr = getContext().getContentResolver();
        ContentValues values = new ContentValues();
        values.put(MediaStore.Downloads.DISPLAY_NAME, filename);
        values.put(MediaStore.Downloads.MIME_TYPE, "application/json");
        values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/" + SUBDIR);
        values.put(MediaStore.Downloads.IS_PENDING, 1);

        Uri uri = cr.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
        if (uri == null) {
            call.reject("Could not create file");
            return;
        }

        try (OutputStream os = cr.openOutputStream(uri)) {
            if (os == null) throw new Exception("openOutputStream returned null");
            os.write(content.getBytes(StandardCharsets.UTF_8));
        }

        ContentValues done = new ContentValues();
        done.put(MediaStore.Downloads.IS_PENDING, 0);
        cr.update(uri, done, null, null);

        JSObject ret = new JSObject();
        ret.put("ok", true);
        ret.put("path", "Downloads/" + SUBDIR + "/" + filename);
        call.resolve(ret);
    }

    private void writeViaLegacy(String filename, String content, PluginCall call) throws Exception {
        File dir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), SUBDIR);
        if (!dir.exists() && !dir.mkdirs()) throw new Exception("mkdirs failed");
        File out = new File(dir, filename);
        try (FileOutputStream fos = new FileOutputStream(out)) {
            fos.write(content.getBytes(StandardCharsets.UTF_8));
        }
        JSObject ret = new JSObject();
        ret.put("ok", true);
        ret.put("path", "Downloads/" + SUBDIR + "/" + filename);
        call.resolve(ret);
    }

    // List existing backup files in Downloads/NeuraChat/
    @PluginMethod
    public void listBackups(PluginCall call) {
        JSArray out = new JSArray();
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ContentResolver cr = getContext().getContentResolver();
                String[] projection = new String[] {
                    MediaStore.Downloads.DISPLAY_NAME,
                    MediaStore.Downloads._ID,
                    MediaStore.Downloads.DATE_MODIFIED,
                    MediaStore.Downloads.SIZE
                };
                String selection = MediaStore.Downloads.RELATIVE_PATH + " LIKE ?";
                String[] args = new String[] { Environment.DIRECTORY_DOWNLOADS + "/" + SUBDIR + "%" };
                try (Cursor c = cr.query(MediaStore.Downloads.EXTERNAL_CONTENT_URI, projection, selection, args, MediaStore.Downloads.DATE_MODIFIED + " DESC")) {
                    if (c != null) {
                        int nameIdx = c.getColumnIndexOrThrow(MediaStore.Downloads.DISPLAY_NAME);
                        int dateIdx = c.getColumnIndexOrThrow(MediaStore.Downloads.DATE_MODIFIED);
                        int sizeIdx = c.getColumnIndexOrThrow(MediaStore.Downloads.SIZE);
                        while (c.moveToNext()) {
                            String name = c.getString(nameIdx);
                            if (name == null || !name.endsWith(".json")) continue;
                            JSObject item = new JSObject();
                            item.put("filename", name);
                            item.put("modified", c.getLong(dateIdx) * 1000L);
                            item.put("size", c.getLong(sizeIdx));
                            out.put(item);
                        }
                    }
                }
            } else {
                File dir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), SUBDIR);
                if (dir.exists()) {
                    File[] files = dir.listFiles();
                    if (files != null) {
                        for (File f : files) {
                            if (!f.getName().endsWith(".json")) continue;
                            JSObject item = new JSObject();
                            item.put("filename", f.getName());
                            item.put("modified", f.lastModified());
                            item.put("size", f.length());
                            out.put(item);
                        }
                    }
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "listBackups failed", e);
            call.reject("List failed: " + e.getMessage());
            return;
        }
        JSObject ret = new JSObject();
        ret.put("backups", out);
        call.resolve(ret);
    }

    // Read a backup file by filename
    @PluginMethod
    public void readBackup(PluginCall call) {
        String filename = call.getString("filename");
        if (filename == null || filename.isEmpty()) {
            call.reject("filename is required");
            return;
        }
        try {
            String content;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                content = readViaMediaStore(filename);
            } else {
                content = readViaLegacy(filename);
            }
            if (content == null) {
                call.reject("Backup not found");
                return;
            }
            JSObject ret = new JSObject();
            ret.put("content", content);
            call.resolve(ret);
        } catch (Exception e) {
            Log.e(TAG, "readBackup failed", e);
            call.reject("Read failed: " + e.getMessage());
        }
    }

    private String readViaMediaStore(String filename) throws Exception {
        ContentResolver cr = getContext().getContentResolver();
        String[] projection = new String[] { MediaStore.Downloads._ID };
        String selection = MediaStore.Downloads.DISPLAY_NAME + " = ? AND " + MediaStore.Downloads.RELATIVE_PATH + " LIKE ?";
        String[] args = new String[] { filename, Environment.DIRECTORY_DOWNLOADS + "/" + SUBDIR + "%" };
        try (Cursor c = cr.query(MediaStore.Downloads.EXTERNAL_CONTENT_URI, projection, selection, args, null)) {
            if (c == null || !c.moveToFirst()) return null;
            long id = c.getLong(0);
            Uri uri = Uri.withAppendedPath(MediaStore.Downloads.EXTERNAL_CONTENT_URI, String.valueOf(id));
            try (InputStream is = cr.openInputStream(uri)) {
                if (is == null) return null;
                java.io.ByteArrayOutputStream bos = new java.io.ByteArrayOutputStream();
                byte[] buf = new byte[8192];
                int n;
                while ((n = is.read(buf)) > 0) bos.write(buf, 0, n);
                return new String(bos.toByteArray(), StandardCharsets.UTF_8);
            }
        }
    }

    private String readViaLegacy(String filename) throws Exception {
        File dir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), SUBDIR);
        File f = new File(dir, filename);
        if (!f.exists()) return null;
        try (InputStream is = new java.io.FileInputStream(f)) {
            java.io.ByteArrayOutputStream bos = new java.io.ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while ((n = is.read(buf)) > 0) bos.write(buf, 0, n);
            return new String(bos.toByteArray(), StandardCharsets.UTF_8);
        }
    }

    // Write the auto-backup to the app-private external directory so it is
    // not visible in the file manager. Trade-off: it is wiped on uninstall.
    @PluginMethod
    public void writeAutoBackup(PluginCall call) {
        String filename = call.getString("filename");
        String content = call.getString("content");
        if (filename == null || filename.isEmpty() || content == null) {
            call.reject("filename and content are required");
            return;
        }
        try {
            File dir = getContext().getExternalFilesDir(null);
            if (dir == null) {
                call.reject("External files dir unavailable");
                return;
            }
            File sub = new File(dir, SUBDIR);
            if (!sub.exists() && !sub.mkdirs()) {
                call.reject("mkdirs failed");
                return;
            }
            File out = new File(sub, filename);
            try (FileOutputStream fos = new FileOutputStream(out)) {
                fos.write(content.getBytes(StandardCharsets.UTF_8));
            }
            JSObject ret = new JSObject();
            ret.put("ok", true);
            ret.put("path", "app-private/" + SUBDIR + "/" + filename);
            call.resolve(ret);
        } catch (Exception e) {
            Log.e(TAG, "writeAutoBackup failed", e);
            call.reject("Backup failed: " + e.getMessage());
        }
    }

    // List the private auto-backups.
    @PluginMethod
    public void listAutoBackups(PluginCall call) {
        JSArray out = new JSArray();
        try {
            File dir = getContext().getExternalFilesDir(null);
            if (dir != null) {
                File sub = new File(dir, SUBDIR);
                if (sub.exists()) {
                    File[] files = sub.listFiles();
                    if (files != null) {
                        for (File f : files) {
                            if (!f.getName().endsWith(".json")) continue;
                            JSObject item = new JSObject();
                            item.put("filename", f.getName());
                            item.put("modified", f.lastModified());
                            item.put("size", f.length());
                            out.put(item);
                        }
                    }
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "listAutoBackups failed", e);
            call.reject("List failed: " + e.getMessage());
            return;
        }
        JSObject ret = new JSObject();
        ret.put("backups", out);
        call.resolve(ret);
    }

    // Read a private auto-backup by filename.
    @PluginMethod
    public void readAutoBackup(PluginCall call) {
        String filename = call.getString("filename");
        if (filename == null || filename.isEmpty()) {
            call.reject("filename is required");
            return;
        }
        try {
            File dir = getContext().getExternalFilesDir(null);
            if (dir == null) { call.reject("No private dir"); return; }
            File f = new File(new File(dir, SUBDIR), filename);
            if (!f.exists()) { call.reject("Not found"); return; }
            String content;
            try (InputStream is = new java.io.FileInputStream(f)) {
                java.io.ByteArrayOutputStream bos = new java.io.ByteArrayOutputStream();
                byte[] buf = new byte[8192];
                int n;
                while ((n = is.read(buf)) > 0) bos.write(buf, 0, n);
                content = new String(bos.toByteArray(), StandardCharsets.UTF_8);
            }
            JSObject ret = new JSObject();
            ret.put("content", content);
            call.resolve(ret);
        } catch (Exception e) {
            Log.e(TAG, "readAutoBackup failed", e);
            call.reject("Read failed: " + e.getMessage());
        }
    }
}
