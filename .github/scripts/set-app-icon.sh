#!/bin/bash
set -e

ROOT="$1"
ICON="$2"

if [ -z "$ROOT" ] || [ -z "$ICON" ]; then
  echo "Usage: set-app-icon.sh <android_project_dir> <source_icon.png>"
  exit 1
fi

if [ ! -f "$ICON" ]; then
  echo "ERROR: source icon not found: $ICON"
  exit 1
fi

RES="$ROOT/app/src/main/res"
if [ ! -d "$RES" ]; then
  echo "ERROR: res dir not found: $RES"
  exit 1
fi

# size mapping: folder:launcher:foreground
# foreground for adaptive icons (Android 12+) is larger with padding
declare -A SIZES=(
  ["mipmap-mdpi"]=48
  ["mipmap-hdpi"]=72
  ["mipmap-xhdpi"]=96
  ["mipmap-xxhdpi"]=144
  ["mipmap-xxxhdpi"]=192
)

for DIR in "${!SIZES[@]}"; do
  SIZE="${SIZES[$DIR]}"
  TARGET_DIR="$RES/$DIR"
  mkdir -p "$TARGET_DIR"

  # Square launcher icon
  magick "$ICON" -resize "${SIZE}x${SIZE}" -strip "$TARGET_DIR/ic_launcher.png"

  # Round launcher icon (circular mask)
  magick "$ICON" -resize "${SIZE}x${SIZE}" \
    \( +clone -alpha extract \
       -draw 'fill black polygon 0,0 0,'"$SIZE"' '"$SIZE"','"$SIZE"' '"$SIZE"',0 fill white circle '"$((SIZE/2))"','"$((SIZE/2))"' '"$((SIZE/2))"',0' \
       \( +clone -flip \) -compose Multiply -composite \
       \( +clone -flop \) -compose Multiply -composite \
    \) -alpha off -compose CopyOpacity -composite -strip \
    "$TARGET_DIR/ic_launcher_round.png"

  # Adaptive foreground: canvas = 2x density size, icon content ~66% (safe zone)
  FG_CANVAS=$((SIZE * 2))
  FG_CONTENT=$((SIZE * 133 / 100))
  magick "$ICON" -resize "${FG_CONTENT}x${FG_CONTENT}" \
    -background none -gravity center -extent "${FG_CANVAS}x${FG_CANVAS}" -strip \
    "$TARGET_DIR/ic_launcher_foreground.png"

  echo "generated $DIR (${SIZE}x${SIZE})"
done

# Also update the mipmap-anydpi-v26 adaptive icon XML if present, else create it
ANYDPI="$RES/mipmap-anydpi-v26"
mkdir -p "$ANYDPI"
cat > "$ANYDPI/ic_launcher.xml" << 'XMLEOF'
<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background" />
    <foreground android:drawable="@mipmap/ic_launcher_foreground" />
</adaptive-icon>
XMLEOF
cp "$ANYDPI/ic_launcher.xml" "$ANYDPI/ic_launcher_round.xml"

# Ensure background color resource exists
VALUES_DIR="$RES/values"
mkdir -p "$VALUES_DIR"
if ! grep -q 'ic_launcher_background' "$VALUES_DIR/ic_launcher_background.xml" 2>/dev/null; then
  cat > "$VALUES_DIR/ic_launcher_background.xml" << 'XMLEOF'
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#0a0a0a</color>
</resources>
XMLEOF
fi

# Also replace splash.png if it exists (used before our React splash mounts)
DRAWABLE="$RES/drawable"
if [ -d "$DRAWABLE" ]; then
  magick "$ICON" -resize "512x512" -strip "$DRAWABLE/splash.png" 2>/dev/null || true
fi

echo "app icon updated"
