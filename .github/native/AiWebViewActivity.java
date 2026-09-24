package com.neurasamu.build.chat;

import android.app.Activity;
import android.app.DownloadManager;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.util.Log;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.DownloadListener;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

public class AiWebViewActivity extends Activity {

    private static final String TAG = "NeuraAiWebView";
    private static final int COLOR_NEON_YELLOW = 0xFFCBFE00;
    private static final int COLOR_BLACK = 0xFF000000;
    private static final int COLOR_ZINC_900 = 0xFF18181B;
    private static final int COLOR_WHITE = 0xFFFFFFFF;

    private WebView webView;
    private TextView titleView;

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

        // Root vertical layout: NeuraChat header bar + WebView
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setLayoutParams(new ViewGroup.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        root.setBackgroundColor(COLOR_BLACK);

        // ---- Top bar (mimics chat-detail header) ----
        LinearLayout topBar = new LinearLayout(this);
        topBar.setOrientation(LinearLayout.HORIZONTAL);
        topBar.setGravity(Gravity.CENTER_VERTICAL);
        topBar.setBackgroundColor(COLOR_NEON_YELLOW);
        int padH = dp(12);
        topBar.setPadding(padH, dp(10), padH, dp(10));
        topBar.setLayoutParams(new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, dp(56)));

        // Close button (X)
        TextView closeBtn = new TextView(this);
        closeBtn.setText("✕");
        closeBtn.setTextSize(TypedValue.COMPLEX_UNIT_SP, 22);
        closeBtn.setTextColor(COLOR_BLACK);
        closeBtn.setTypeface(null, Typeface.BOLD);
        closeBtn.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams closeLp = new LinearLayout.LayoutParams(dp(36), dp(36));
        closeBtn.setLayoutParams(closeLp);
        closeBtn.setBackgroundColor(0x00000000);
        closeBtn.setOnClickListener(v -> finish());
        topBar.addView(closeBtn);

        // Title (center, expands)
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

        // Model badge (right side)
        TextView modelBadge = new TextView(this);
        modelBadge.setText((modelId != null && !modelId.isEmpty() ? modelId : "AI").toUpperCase());
        modelBadge.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11);
        modelBadge.setTextColor(COLOR_BLACK);
        modelBadge.setTypeface(null, Typeface.BOLD);
        modelBadge.setPadding(dp(10), dp(6), dp(10), dp(6));
        modelBadge.setBackgroundColor(0x33000000);
        topBar.addView(modelBadge);

        root.addView(topBar);

        // ---- WebView ----
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

        // ---- WebView setup ----
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
            public boolean shouldOverrideUrlLoading(WebView view, String u) {
                view.loadUrl(u);
                return true;
            }
        });

        // Update title from <title>
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onReceivedTitle(WebView view, String pageTitle) {
                super.onReceivedTitle(view, pageTitle);
                if (pageTitle != null && !pageTitle.isEmpty() && titleView != null) {
                    titleView.setText(pageTitle);
                }
            }
        });

        webView.setDownloadListener(new DownloadListener() {
            @Override
            public void onDownloadStart(String u, String userAgent, String contentDisposition, String mime, long contentLength) {
                startDownload(AiWebViewActivity.this, u, userAgent, contentDisposition, mime);
            }
        });

        webView.loadUrl(url);
    }

    static void startDownload(Context context, String url, String userAgent, String contentDisposition, String mimeType) {
        try {
            String name = android.webkit.URLUtil.guessFileName(url, contentDisposition, mimeType);
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
            if (webView != null) {
                webView.loadUrl("about:blank");
                webView.destroy();
                webView = null;
            }
        } catch (Exception ignore) {}
        super.onDestroy();
    }
}
