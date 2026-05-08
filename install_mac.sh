#!/bin/bash
# ============================================================
#  Red Light Alert — One-Time Mac Desktop App Installer
#  Run this once: bash install_mac.sh
#  Creates "Red Light Alert.app" on your Desktop.
# ============================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_NAME="Red Light Alert"
DESKTOP="$HOME/Desktop"
APP_PATH="$DESKTOP/${APP_NAME}.app"

echo "============================================================"
echo "  Red Light Alert — Desktop App Installer"
echo "============================================================"
echo ""

# ── Build .app bundle structure ───────────────────────────────
echo "Creating ${APP_NAME}.app on your Desktop..."

rm -rf "$APP_PATH"
mkdir -p "$APP_PATH/Contents/MacOS"
mkdir -p "$APP_PATH/Contents/Resources"

# ── Launcher script (what runs on double-click) ───────────────
cat > "$APP_PATH/Contents/MacOS/launcher" << LAUNCHER
#!/bin/bash
# Open a Terminal window and run start_mac.sh
SCRIPT_DIR="${SCRIPT_DIR}"

osascript <<OSA
tell application "Terminal"
    activate
    do script "bash '\$SCRIPT_DIR/start_mac.sh'"
end tell
OSA
LAUNCHER

chmod +x "$APP_PATH/Contents/MacOS/launcher"

# ── Info.plist ────────────────────────────────────────────────
cat > "$APP_PATH/Contents/Info.plist" << 'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key>
    <string>launcher</string>
    <key>CFBundleIdentifier</key>
    <string>com.redlightalert.app</string>
    <key>CFBundleName</key>
    <string>Red Light Alert</string>
    <key>CFBundleDisplayName</key>
    <string>Red Light Alert</string>
    <key>CFBundleVersion</key>
    <string>1.0</string>
    <key>CFBundleShortVersionString</key>
    <string>1.0</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleSignature</key>
    <string>????</string>
    <key>LSUIElement</key>
    <false/>
    <key>NSHighResolutionCapable</key>
    <true/>
</dict>
</plist>
PLIST

# ── Use project icon if available ─────────────────────────────
ICON_SRC="$SCRIPT_DIR/frontend/public/favicon.ico"
if [ -f "$ICON_SRC" ]; then
    # Convert .ico -> .icns via sips (built-in on macOS)
    TMP_PNG="/tmp/rla_icon.png"
    ICONSET="/tmp/rla.iconset"
    mkdir -p "$ICONSET"

    sips -s format png "$ICON_SRC" --out "$TMP_PNG" &>/dev/null || true

    if [ -f "$TMP_PNG" ]; then
        for size in 16 32 64 128 256 512; do
            sips -z $size $size "$TMP_PNG" --out "$ICONSET/icon_${size}x${size}.png" &>/dev/null || true
        done
        iconutil -c icns "$ICONSET" -o "$APP_PATH/Contents/Resources/AppIcon.icns" &>/dev/null || true
        rm -rf "$TMP_PNG" "$ICONSET"

        # Register icon in plist
        /usr/libexec/PlistBuddy -c \
            "Add :CFBundleIconFile string AppIcon" \
            "$APP_PATH/Contents/Info.plist" &>/dev/null || true
    fi
fi

# ── Remove quarantine flag so macOS doesn't block it ─────────
xattr -dr com.apple.quarantine "$APP_PATH" 2>/dev/null || true

echo ""
echo "============================================================"
echo "  Done!  \"${APP_NAME}\" is now on your Desktop."
echo ""
echo "  Double-click it any time to start Red Light Alert."
echo "  (This installer only needs to run once.)"
echo "============================================================"
echo ""
