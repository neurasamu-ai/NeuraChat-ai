package com.neurasamu.build.chat;

import android.app.Activity;
import android.app.DownloadManager;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.util.Log;
import android.view.KeyEvent;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.DownloadListener;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "AiWebViewPlugin")
public class AiWebViewPlugin extends Plugin {

    private static final String TAG = "NeuraAiWebView";

    // Static reference so the Activity can call back into the plugin.
    private static AiWebViewPlugin instance;
    private static AiWebViewActivity currentActivity;

    @Override
    public void load() {
        super.load();
        instance = this;
        // Enable third-party cookies for the AI sites to work correctly.
        try {
            CookieManager cm = CookieManager.getInstance();
            cm.setAcceptCookie(true);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                cm.setAcceptThirdPartyCookies(new WebView(getContext()), true);
            }
        } catch (Exception e) {
            Log.w(TAG, "cookie setup failed", e);
        }
    }

    @PluginMethod
    public void openAi(PluginCall call) {
        String url = call.getString("url");
        String title = call.getString("title");
        String modelId = call.getString("modelId");
        if (url == null || url.isEmpty()) {
            call.reject("url is required");
            return;
        }
        try {
            Intent intent = new Intent(getContext(), AiWebViewActivity.class);
            intent.putExtra("url", url);
            intent.putExtra("title", title == null ? "AI" : title);
            intent.putExtra("modelId", modelId == null ? "" : modelId);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            Log.e(TAG, "openAi failed", e);
            call.reject("Failed: " + e.getMessage());
        }
    }

    // ---- Download handling (called by the activity) ----
    static void startDownload(Context context, String url, String userAgent, String contentDisposition, String mimeType, String suggestedFilename) {
        try {
            String name = suggestedFilename;
            if (name == null || name.isEmpty()) {
                name = android.webkit.URLUtil.guessFileName(url, contentDisposition, mimeType);
            }
            DownloadManager.Request req = new DownloadManager.Request(Uri.parse(url));
            req.setMimeType(mimeType);
            req.addRequestHeader("User-Agent", userAgent);
            req.setTitle(name);
            req.setDescription("Downloading from NeuraChat");
            req.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            req.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, name);
            DownloadManager dm = (DownloadManager) context.getSystemService(Context.DOWNLOAD_SERVICE);
            if (dm != null) {
                long id = dm.enqueue(req);
                CallNotifier.showDownloadStarted(context, name);
                Log.d(TAG, "download enqueued id=" + id);
            }
        } catch (Exception e) {
            Log.e(TAG, "startDownload failed", e);
        }
    }

    // ---- In-app WebView Activity ----
    public static class AiWebViewActivity extends Activity {
        private WebView webView;
        private String modelId;

        @Override
        protected void onCreate(Bundle savedInstanceState) {
            super.onCreate(savedInstanceState);

            String url = getIntent().getStringExtra("url");
            String title = getIntent().getStringExtra("title");
            modelId = getIntent().getStringExtra("modelId");
            if (url == null) { finish(); return; }

            FrameLayout root = new FrameLayout(this);
            root.setLayoutParams(new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
            root.setBackgroundColor(0xFF000000);

            webView = new WebView(this);
            webView.setLayoutParams(new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
            root.addView(webView);
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
            settings.setUserAgentString(settings.getUserAgentString() + " NeuraChat/1.0");
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

            webView.setWebChromeClient(new WebChromeClient() {
                @Override
                public void onProgressChanged(WebView view, int newProgress) {
                    super.onProgressChanged(view, newProgress);
                }
            });

            webView.setDownloadListener(new DownloadListener() {
                @Override
                public void onDownloadStart(String u, String userAgent, String contentDisposition, String mime, long contentLength) {
                    startDownload(AiWebViewActivity.this, u, userAgent, contentDisposition, mime, null);
                }
            });

            webView.loadUrl(url);
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
}
