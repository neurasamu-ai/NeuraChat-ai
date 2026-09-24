package com.neurasamu.build.chat;

import android.Manifest;
import android.app.Activity;
import android.app.DownloadManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Typeface;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.util.Base64;
import android.util.Log;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.DownloadListener;
import android.webkit.PermissionRequest;
import android.webkit.URLUtil;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import androidx.core.content.ContextCompat;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

public class AiWebViewActivity extends Activity {

    private static final String TAG = "NeuraAiWebView";
    private static final int COLOR_NEON_YELLOW = 0xFFCBFE00;
    private static final int COLOR_BLACK = 0xFF000000;
    private static final int REQ_WEB_PERMS = 4001;
    private static final int REQ_FILE_CHOOSER = 4002;

    private WebView webView;
    private TextView titleView;
    private ValueCallback<Uri[]> filePathCallback;
    private PermissionRequest pendingWebPermissionRequest;

    private int dp(int v) {
        return (int) TypedValue.applyDimension(
            TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics());
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        String url = getIntent().getStringExtra("url");
        String title = getIntent().getStringExtra("title");
        String modelId = getIntent().getStringExtra("modelId");
        if (url == null) { finish(); return; }
        if (title == null || title.isEmpty()) title = "AI";

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setLayoutParams(new ViewGroup.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        root.setBackgroundColor(COLOR_BLACK);

        LinearLayout topBar = new LinearLayout(this);
        topBar.setOrientation(LinearLayout.HORIZONTAL);
        topBar.setGravity(Gravity.CENTER_VERTICAL);
        topBar.setBackgroundColor(COLOR_NEON_YELLOW);
        int padH = dp(12);
        topBar.setPadding(padH, dp(10), padH, dp(10));
        topBar.setLayoutParams(new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, dp(56)));

        TextView closeBtn = new TextView(this);
        closeBtn.setText("X");
        closeBtn.setTextSize(TypedValue.COMPLEX_UNIT_SP, 22);
        closeBtn.setTextColor(COLOR_BLACK);
        closeBtn.setTypeface(null, Typeface.BOLD);
        closeBtn.setGravity(Gravity.CENTER);
        closeBtn.setLayoutParams(new LinearLayout.LayoutParams(dp(36), dp(36)));
        closeBtn.setOnClickListener(v -> finish());
        topBar.addView(closeBtn);

        titleView = new TextView(this);
        titleView.setText(title);
        titleView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        titleView.setTextColor(COLOR_BLACK);
        titleView.setTypeface(null, Typeface.BOLD);
        titleView.setSingleLine(true);
        titleView.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams titleLp = new LinearLayout.LayoutParams(
            0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        titleLp.setMargins(dp(8), 0, dp(8), 0);
        titleView.setLayoutParams(titleLp);
        topBar.addView(titleView);

        TextView modelBadge = new TextView(this);
        modelBadge.setText((modelId != null && !modelId.isEmpty() ? modelId : "AI").toUpperCase());
        modelBadge.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11);
        modelBadge.setTextColor(COLOR_BLACK);
        modelBadge.setTypeface(null, Typeface.BOLD);
        modelBadge.setPadding(dp(10), dp(6), dp(10), dp(6));
        modelBadge.setBackgroundColor(0x33000000);
        topBar.addView(modelBadge);

        root.addView(topBar);

        FrameLayout webContainer = new FrameLayout(this);
        webContainer.setLayoutParams(new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));
        webContainer.setBackgroundColor(COLOR_BLACK);

        webView = new WebView(this);
        webView.setLayoutParams(new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        webContainer.addView(webView);
        root.addView(webContainer);

        setContentView(root);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setBuiltInZoomControls(true);
        settings.setDisplayZoomControls(false);
        settings.setSupportMultipleWindows(true);
        settings.setJavaScriptCanOpenWindowsAutomatically(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setGeolocationEnabled(true);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        }

        CookieManager cm = CookieManager.getInstance();
        cm.setAcceptCookie(true);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            cm.setAcceptThirdPartyCookies(webView, true);
        }

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return false;
            }
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String u) {
                return false;
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onReceivedTitle(WebView view, String pageTitle) {
                super.onReceivedTitle(view, pageTitle);
                if (pageTitle != null && !pageTitle.isEmpty() && titleView != null) {
                    titleView.setText(pageTitle);
                }
            }

            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                Log.d(TAG, "onPermissionRequest: " + java.util.Arrays.toString(request.getResources()));
                runOnUiThread(() -> {
                    boolean needsMic = false;
                    boolean needsCamera = false;
                    for (String r : request.getResources()) {
                        if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(r)) needsMic = true;
                        if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(r)) needsCamera = true;
                    }
                    java.util.List<String> missing = new java.util.ArrayList<>();
                    if (needsMic && ContextCompat.checkSelfPermission(AiWebViewActivity.this, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
                        missing.add(Manifest.permission.RECORD_AUDIO);
                    }
                    if (needsCamera && ContextCompat.checkSelfPermission(AiWebViewActivity.this, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
                        missing.add(Manifest.permission.CAMERA);
                    }
                    if (missing.isEmpty()) {
                        request.grant(request.getResources());
                        Log.d(TAG, "granted web permission request");
                    } else {
                        pendingWebPermissionRequest = request;
                        requestPermissions(missing.toArray(new String[0]), REQ_WEB_PERMS);
                    }
                });
            }

            @Override
            public boolean onShowFileChooser(WebView wv, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (filePathCallback != null) {
                    filePathCallback.onReceiveValue(null);
                }
                filePathCallback = callback;
                try {
                    Intent intent = params.createIntent();
                    intent.addCategory(Intent.CATEGORY_OPENABLE);
                    startActivityForResult(intent, REQ_FILE_CHOOSER);
                    return true;
                } catch (Exception e) {
                    Log.e(TAG, "file chooser failed", e);
                    filePathCallback = null;
                    return false;
                }
            }
        });

        webView.addJavascriptInterface(new BlobDownloadBridge(this), "NeuraBlobBridge");

        webView.setDownloadListener(new DownloadListener() {
            @Override
            public void onDownloadStart(String u, String userAgent, String contentDisposition, String mime, long contentLength) {
                if (u != null && u.startsWith("blob:")) {
                    String name = sanitizeName(contentDisposition, mime);
                    String js = "javascript:(function(){var x=new XMLHttpRequest();x.open('GET','" + u + "',true);x.responseType='blob';x.onload=function(){var r=new FileReader();r.onloadend=function(){NeuraBlobBridge.saveBase64(r.result,'" + name + "');};r.readAsDataURL(x.response);};x.send();})();";
                    webView.loadUrl(js);
                    return;
                }
                startDownload(AiWebViewActivity.this, u, userAgent, contentDisposition, mime);
            }
        });

        webView.loadUrl(url);
    }

    private String sanitizeName(String contentDisposition, String mime) {
        String name = URLUtil.guessFileName("blob:download", contentDisposition, mime);
        if (name == null || name.isEmpty()) {
            name = "neurachat_" + System.currentTimeMillis() + guessExt(mime);
        }
        return name.replace("'", "").replace("\"", "");
    }

    private String guessExt(String mime) {
        if (mime == null) return ".bin";
        if (mime.startsWith("image/")) return "." + mime.substring(6);
        if (mime.startsWith("audio/")) return ".m4a";
        if (mime.startsWith("video/")) return ".mp4";
        if (mime.equals("application/pdf")) return ".pdf";
        if (mime.startsWith("text/")) return ".txt";
        return ".bin";
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQ_WEB_PERMS) {
            boolean allGranted = true;
            for (int r : grantResults) {
                if (r != PackageManager.PERMISSION_GRANTED) { allGranted = false; break; }
            }
            if (pendingWebPermissionRequest != null) {
                if (allGranted) {
                    pendingWebPermissionRequest.grant(pendingWebPermissionRequest.getResources());
                    Log.d(TAG, "granted pending web permission after runtime grant");
                } else {
                    pendingWebPermissionRequest.deny();
                    Toast.makeText(this, "Microphone/Camera permission required", Toast.LENGTH_LONG).show();
                }
                pendingWebPermissionRequest = null;
            }
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQ_FILE_CHOOSER) {
            if (filePathCallback == null) return;
            Uri[] results = null;
            if (resultCode == RESULT_OK && data != null) {
                if (data.getClipData() != null) {
                    int count = data.getClipData().getItemCount();
                    results = new Uri[count];
                    for (int i = 0; i < count; i++) {
                        results[i] = data.getClipData().getItemAt(i).getUri();
                    }
                } else if (data.getData() != null) {
                    results = new Uri[] { data.getData() };
                }
            }
            filePathCallback.onReceiveValue(results);
            filePathCallback = null;
        }
    }

    static void startDownload(Context context, String url, String userAgent, String contentDisposition, String mimeType) {
        try {
            String name = URLUtil.guessFileName(url, contentDisposition, mimeType);
            DownloadManager.Request req = new DownloadManager.Request(Uri.parse(url));
            req.setMimeType(mimeType);
            req.addRequestHeader("User-Agent", userAgent);
            req.setTitle(name);
            req.setDescription("Downloading from NeuraChat");
            req.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            req.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, name);
            DownloadManager dm = (DownloadManager) context.getSystemService(Context.DOWNLOAD_SERVICE);
            if (dm != null) {
                dm.enqueue(req);
                CallNotifier.showDownloadStarted(context, name);
                Log.d(TAG, "download enqueued: " + name);
            }
        } catch (Exception e) {
            Log.e(TAG, "startDownload failed", e);
        }
    }

    public class BlobDownloadBridge {
        private final Context ctx;
        BlobDownloadBridge(Context ctx) { this.ctx = ctx; }

        @android.webkit.JavascriptInterface
        public void saveBase64(String dataUrl, String filename) {
            try {
                if (dataUrl == null || !dataUrl.contains(",")) return;
                String b64 = dataUrl.substring(dataUrl.indexOf(',') + 1);
                byte[] bytes = Base64.decode(b64, Base64.DEFAULT);
                File dir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
                if (!dir.exists() && !dir.mkdirs()) return;
                File out = new File(dir, filename);
                OutputStream os = new FileOutputStream(out);
                os.write(bytes);
                os.close();
                runOnUiThread(() -> {
                    CallNotifier.showDownloadStarted(AiWebViewActivity.this, filename);
                    Toast.makeText(AiWebViewActivity.this, "Saved to Downloads: " + filename, Toast.LENGTH_LONG).show();
                });
                Log.d(TAG, "blob saved: " + filename + " (" + bytes.length + " bytes)");
            } catch (Exception e) {
                Log.e(TAG, "saveBase64 failed", e);
            }
        }
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onPause() {
        super.onPause();
        try { CookieManager.getInstance().flush(); } catch (Exception ignore) {}
        if (webView != null) webView.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) webView.onResume();
    }

    @Override
    protected void onDestroy() {
        try {
            if (filePathCallback != null) {
                filePathCallback.onReceiveValue(null);
                filePathCallback = null;
            }
            if (webView != null) {
                webView.loadUrl("about:blank");
                webView.destroy();
                webView = null;
            }
        } catch (Exception ignore) {}
        super.onDestroy();
    }
}
