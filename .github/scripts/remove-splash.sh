#!/bin/bash
set -e

ROOT="$1"
if [ -z "$ROOT" ]; then
  echo "Usage: remove-splash.sh <android_project_dir>"
  exit 1
fi

DRAWABLE_DIR="$ROOT/app/src/main/res/drawable"
STYLES="$ROOT/app/src/main/res/values/styles.xml"

mkdir -p "$DRAWABLE_DIR"

# 1x1 transparent drawable
cat > "$DRAWABLE_DIR/transparent_splash.xml" << 'XMLEOF'
<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android"
    android:shape="rectangle">
    <solid android:color="@android:color/transparent" />
    <size android:width="1dp" android:height="1dp" />
</shape>
XMLEOF

# Also replace the base splash drawable if it exists (Capacitor's logo)
if [ -f "$DRAWABLE_DIR/splash.png" ]; then
  rm -f "$DRAWABLE_DIR/splash.png"
fi

if [ ! -f "$STYLES" ]; then
  echo "WARNING: $STYLES not found — skipping style patch"
  exit 0
fi

echo "--- before ---"
cat "$STYLES"

# Replace Capacitor splash drawable with black
sed -i 's|@drawable/splash|@android:color/black|g' "$STYLES"

# Inject overrides into AppTheme.NoActionBarLaunch to kill Android 12+ system splash
python3 - "$STYLES" << 'PYEOF'
import re, sys
p = sys.argv[1]
s = open(p).read()

pattern = re.compile(
    r'(<style name="AppTheme\.NoActionBarLaunch"[^>]*>)(.*?)(</style>)',
    re.DOTALL
)

injections = (
    '\n        <item name="android:windowSplashScreenBackground">@android:color/black</item>'
    '\n        <item name="android:windowSplashScreenAnimatedIcon">@drawable/transparent_splash</item>'
    '\n        <item name="android:windowSplashScreenIconBackgroundColor">@android:color/black</item>'
    '\n        <item name="android:windowDisablePreview">true</item>'
    '\n        <item name="postSplashScreenTheme">@style/AppTheme</item>'
)

def repl(m):
    head, body, tail = m.group(1), m.group(2), m.group(3)
    return head + body + injections + '\n    ' + tail

s2, n = pattern.subn(repl, s, count=1)
if n == 0:
    print("WARNING: AppTheme.NoActionBarLaunch not found — nothing injected")
else:
    print(f"patched {n} style block(s)")

open(p, 'w').write(s2)
PYEOF

echo "--- after ---"
cat "$STYLES"
