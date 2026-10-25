#!/bin/bash
set -euo pipefail
TASK_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
if [ ! -d "$TASK_ROOT/safari/Feed Window/Feed Window.xcodeproj" ]; then
  mkdir -p "$TASK_ROOT/safari"
  xcrun safari-web-extension-converter "$TASK_ROOT/extension" --project-location "$TASK_ROOT/safari" --app-name "Feed Window" --bundle-identifier "net.szkk.feedwindow" --swift --macos-only --no-open --no-prompt
fi
FEED_WINDOW_RESOLVED_SIGNING="$(node "$TASK_ROOT/scripts/signing.cjs")"
FEED_WINDOW_RESOLVED_SIGNING="$FEED_WINDOW_RESOLVED_SIGNING" node "$TASK_ROOT/scripts/configure-safari.cjs"
xcodebuild -project "$TASK_ROOT/safari/Feed Window/Feed Window.xcodeproj" -scheme "Feed Window" -configuration Debug -derivedDataPath "$TASK_ROOT/work/DerivedData" -xcconfig "$TASK_ROOT/work/Signing.generated.xcconfig" build
mkdir -p "$TASK_ROOT/dist"
ditto "$TASK_ROOT/work/DerivedData/Build/Products/Debug/Feed Window.app" "$TASK_ROOT/dist/Feed Window.app"
# Xcode registers its intermediate app automatically; keep just the stable copy.
FEED_WINDOW_LSREGISTER="/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister"
"$FEED_WINDOW_LSREGISTER" -u "$TASK_ROOT/work/DerivedData/Build/Products/Debug/Feed Window.app"
"$FEED_WINDOW_LSREGISTER" -f "$TASK_ROOT/dist/Feed Window.app"
printf '\nBuilt: %s\n' "$TASK_ROOT/dist/Feed Window.app"
