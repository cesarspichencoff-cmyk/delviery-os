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
case "$expected" in modern|legacy|detect) ;; *)
  echo "LAB_WEBVIEW_UNKNOWN_VARIANT"
  exit 1 ;;
esac
# A grade usa um emulador isolado. Confere a API e aplica o perfil de tela
# antes de instalar o app. A mesma rotina pode rodar fora do GitHub Actions.
mapfile -t devices < <(adb devices | tr -d '\r' | awk 'NR > 1 && NF {print $1, $2}')
if [[ "${#devices[@]}" -ne 1 || ! "${devices[0]}" =~ ^emulator-[0-9]+\ device$ ]]; then
  echo "LAB_WEBVIEW_REQUIRES_ONE_EMULATOR"
  exit 1
fi
export ANDROID_SERIAL="${devices[0]%% *}"
api="$(adb shell getprop ro.build.version.sdk | tr -d '\r')"
if [[ ! "$api" =~ ^[0-9]+$ || "$api" != "${2:-$api}" ]]; then
  echo "LAB_WEBVIEW_WRONG_ANDROID_API"
  exit 1
fi
screen="${3:-standard}"
case "$screen" in
  small) size=720x1280; density=320 ;;
  standard) size=1080x1920; density=420 ;;
  large) size=1440x2560; density=480 ;;
  *) echo "LAB_WEBVIEW_UNKNOWN_SCREEN"; exit 1 ;;
esac
adb shell wm size "$size"
adb shell wm density "$density"
proof_id="$(date +%s)-$$"
proof=../tests/android/visual-proof/android-compat.txt
mkdir -p "$(dirname "$proof")"
printf 'api=%s\nprofile=%s\nsize=%s\ndensity=%s\nexpected=%s\n' \
  "$api" "$screen" "$size" "$density" "$expected" > "$proof"
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
  "-Pandroid.testInstrumentationRunnerArguments.webviewExpected=$expected" \
  "-Pandroid.testInstrumentationRunnerArguments.entregasCompatRunId=$proof_id"; then
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
  # Uma anotacao PUBLICA (::error title=...::) com diagnostico SANITIZADO, para
  # a proxima falha ficar legivel pela API de check-runs SEM credencial. Isto
  # NAO altera o que o teste prova: so le artefatos ja produzidos. Tudo scrubado.
  ci_tmp="$(mktemp -d)"
  if command -v adb >/dev/null 2>&1; then
    { echo "emulator_uptime_s=$(adb shell cat /proc/uptime 2>/dev/null | awk '{print int($1)}')"
      echo "mem_available_kb=$(adb shell cat /proc/meminfo 2>/dev/null | awk '/MemAvailable/{print $2}')"; } \
      > "$ci_tmp/ci-facts.txt" 2>/dev/null || true
    adb logcat -d -v brief TestRunner:* AndroidRuntime:* chromium:* ActivityManager:* lowmemorykiller:* cr_AwContents:* WebView:* '*:S' \
      > "$ci_tmp/ci-logcat.txt" 2>/dev/null || true
  fi
  python3 ../tests/android/ci_lab_failure_annotation_v1.py \
    --title "DeliveryOS WebView lab failed (sanitized)" \
    --results app/build/outputs/androidTest-results/connected \
    --logcat "$ci_tmp/ci-logcat.txt" --facts "$ci_tmp/ci-facts.txt" || true
  rm -rf "$ci_tmp"
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

# O teste Kotlin emite este recibo somente depois de verificar a tela real.
mapfile -t evidence < <(adb logcat -d -v brief -s EntregasCompat:I '*:S' |
  sed -nE "s/^I\/EntregasCompat *\( *[0-9]+\): run=$proof_id (mode=(modern|legacy) webview=[0-9.]+ viewport=[0-9]+)$/\\1/p")
if [[ "${#evidence[@]}" -ne 1 || ("$expected" != detect && "${evidence[0]}" != "mode=$expected "*) ]]; then
  echo "LAB_WEBVIEW_COMPATIBILITY_PROOF_MISSING"
  exit 1
fi
printf '%s\n' "${evidence[0]}" | tee -a "$proof"
