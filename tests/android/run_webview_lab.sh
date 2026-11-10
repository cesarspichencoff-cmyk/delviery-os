#!/usr/bin/env bash
# Disposable Android emulator runner ONLY. No field device or live endpoint.
set -euo pipefail
if [[ ! -f app/build.gradle.kts || ! -f ../src/entregas/ui/rider-mobile/gps-review-status.js ]]; then
  echo "LAB_WEBVIEW_MUST_RUN_IN_EPHEMERAL_CI_WORKSPACE"
  exit 1
fi
for name in DELIVERYOS_DATABASE_URL TATA_READER_ROOT ENTREGAS_DEVICE_SECRET; do
  if [[ -n "${!name:-}" ]]; then
    echo "LAB_WEBVIEW_REFUSES_EXTERNAL_CONFIGURATION"
    exit 1
  fi
done
expected="${1:-}"
case "$expected" in modern|legacy) ;; *)
  echo "LAB_WEBVIEW_UNKNOWN_VARIANT"
  exit 1 ;;
esac
classes="br.com.tata.entregas.RiderWebViewBridgeInstrumentedTest,br.com.tata.entregas.RiderRealScreenInstrumentedTest"
if [[ "$expected" == "modern" ]]; then
  classes="$classes,br.com.tata.entregas.RiderGpsReviewInstrumentedTest"
fi

bash ./gradlew --no-daemon --console=plain :app:connectedDebugAndroidTest \
  "-Pandroid.testInstrumentationRunnerArguments.class=$classes" \
  "-Pandroid.testInstrumentationRunnerArguments.webviewExpected=$expected"

if [[ "$expected" == "modern" ]]; then
  mkdir -p ../tests/android/visual-proof
  adb pull /sdcard/Android/data/br.com.tata.entregas.debug/files/gps-review-hold-lab.png \
    ../tests/android/visual-proof/gps-review-hold-lab.png
  test -s ../tests/android/visual-proof/gps-review-hold-lab.png
  echo "GPS_REVIEW_REAL_WEBVIEW_SCREENSHOT_CAPTURED"
fi
