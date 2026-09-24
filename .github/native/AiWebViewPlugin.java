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


    // Downloads are handled directly by AiWebViewActivity (separate file).
}
