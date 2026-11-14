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

# Preserve the FULL instrumented test and its original failure semantics.
# When the ephemeral Android 34 runner fails, Gradle's summary alone hides
# whether a WebView assertion failed or the emulator process crashed.
# Report ONLY the fixed test class, exception type and selected lab-only
# diagnostic markers; no Room rows, request bodies, addresses or client data.
if ! bash ./gradlew --no-daemon --console=plain :app:connectedDebugAndroidTest \
  "-Pandroid.testInstrumentationRunnerArguments.class=$classes" \
  "-Pandroid.testInstrumentationRunnerArguments.webviewExpected=$expected"; then
  python3 - <<'PY'
from pathlib import Path
import xml.etree.ElementTree as ET
root = Path("app/build/outputs/androidTest-results/connected")
found = 0
for path in root.rglob("*.xml") if root.exists() else []:
    try:
        suite = ET.parse(path).getroot()
    except ET.ParseError:
        continue
    for case in suite.findall(".//testcase"):
        failure = case.find("failure")
        if failure is None:
            failure = case.find("error")
        if failure is None:
            continue
        found += 1
        classname = case.attrib.get("classname", "")
        testname = case.attrib.get("name", "")
        kind = failure.attrib.get("type", "unknown")
        # Class/test/type are provided by our fixed synthetic test suite.
        if classname.startswith("br.com.tata.entregas.") and all(
            v.replace("_", "").replace(".", "").isalnum()
            for v in (classname, testname.split("[")[0], kind)
        ):
            print("ANDROID_WEBVIEW_FAILED_CASE", classname, testname.split("[")[0], kind)
        msg = failure.attrib.get("message", "")
        for marker in (
            "REAL_RIDER_PENDING_NOT_SHOWN",
            "RIDER_SYNC_REQUEST_NOT_SHOWN",
            "Actual Android rider.js did not show the matched Room confirmation",
            "Timed out waiting for real WebView JS",
            "Modern emulator must NOT be on compatibility HOLD",
        ):
            if marker in msg:
                print("ANDROID_WEBVIEW_FAILURE_MARKER", marker.replace(" ", "_"))
                break
print("ANDROID_WEBVIEW_FAILURE_CASE_COUNT", found)
PY
  # Read only the crash buffer of this disposable emulator, never native
  # production logs or raw event payloads. Filter to generic failure classes.
  if command -v adb >/dev/null 2>&1; then
    adb logcat -b crash -d -v brief 2>/dev/null |
      grep -E 'FATAL EXCEPTION|Process: br\.com\.tata\.entregas|AndroidRuntime.*(Fatal|Exception|Error)|^.*(SIGSEGV|SIGABRT|Fatal signal)' |
      cut -c 1-220 | tail -n 18 || true
  fi
  echo "ANDROID_WEBVIEW_INSTRUMENTATION_FAILED_NO_GATE_BYPASS"
  exit 1
fi

if [[ "$expected" == "modern" ]]; then
  mkdir -p ../tests/android/visual-proof
  adb pull /sdcard/Pictures/DeliveryOSLab/gps-review-hold-lab.png \
    ../tests/android/visual-proof/gps-review-hold-lab.png
  test -s ../tests/android/visual-proof/gps-review-hold-lab.png
  echo "GPS_REVIEW_REAL_WEBVIEW_SCREENSHOT_CAPTURED"
fi
