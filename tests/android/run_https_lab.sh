#!/usr/bin/env bash
# Disposable runner-only strict HTTPS fixture for Android WebView + actual
# SyncWorker. Do NOT invoke on a restaurant workstation or field device.
set -euo pipefail
if [[ ! -f app/build.gradle.kts || ! -f ../tests/android/https_two_server_fixture.py ]]; then
  echo "LAB_MUST_RUN_ONLY_FROM_ANDROID_CI_WORKSPACE"
  exit 1
fi
for name in DELIVERYOS_DATABASE_URL TATA_READER_ROOT ENTREGAS_DEVICE_SECRET; do
  if [[ -n "${!name:-}" ]]; then
    echo "LAB_REFUSES_EXTERNAL_CONFIGURATION"
    exit 1
  fi
done
# Cenario opcional do MESMO ponta a ponta, sempre com fixture nova:
#   renderer-death     o renderizador morre com a acao ja guardada no aparelho;
#   offline-reconnect  acao tomada em modo aviao, WorkManager real, rede volta.
#   two-riders         BANCADA, exige DOIS emuladores ligados: dois motoboys em
#                      dois aparelhos ao mesmo tempo, cada um pre-vinculado, com
#                      a sua viagem; o segundo age em modo aviao e volta.
scenario="${LAB_HTTPS_SCENARIO:-}"
case "$scenario" in
  ""|renderer-death|offline-reconnect|two-riders) ;;
  *) echo "LAB_UNKNOWN_SCENARIO"; exit 1 ;;
esac
two_rider_devices=()
fixture_args=()
if [[ "$scenario" == "two-riders" ]]; then fixture_args=(--riders 2); fi
work="$(mktemp -d)"
chmod 700 "$work"
server_pid=""
cleanup() {
  if [[ -n "$server_pid" ]]; then kill "$server_pid" 2>/dev/null || true; fi
  # O cenario offline liga o modo aviao; nunca deixar o emulador sem rede.
  if [[ "$scenario" == "offline-reconnect" ]]; then
    adb shell cmd connectivity airplane-mode disable >/dev/null 2>&1 || true
  fi
  for serial in ${two_rider_devices[@]+"${two_rider_devices[@]}"}; do
    adb -s "$serial" shell cmd connectivity airplane-mode disable >/dev/null 2>&1 || true
    adb -s "$serial" uninstall br.com.tata.entregas.debug.test >/dev/null 2>&1 || true
    adb -s "$serial" uninstall br.com.tata.entregas.debug >/dev/null 2>&1 || true
  done
  rm -rf "$work"
  rm -f app/src/debug/res/raw/deliveryos_lab_ca.crt
  rm -f app/src/debug/res/xml/network_security_config_debug.xml
}
trap cleanup EXIT

# Fresh ephemeral CA and server cert. No certificate/private key is stored in
# GitHub. A nonpersistent debug resource overlay trusts ONLY this CA; normal
# debug, pilot and release configurations in GitHub remain unchanged.
openssl req -x509 -newkey rsa:2048 -sha256 -nodes -days 1 \
  -keyout "$work/ca.key" -out "$work/ca.crt" \
  -subj "/CN=DeliveryOS CI Disposable CA" \
  -addext "basicConstraints=critical,CA:TRUE" >/dev/null 2>&1
openssl req -newkey rsa:2048 -sha256 -nodes \
  -keyout "$work/leaf.key" -out "$work/leaf.csr" \
  -subj "/CN=10.0.2.2" >/dev/null 2>&1
printf '%s\n' 'subjectAltName=IP:10.0.2.2' \
  'extendedKeyUsage=serverAuth' \
  'basicConstraints=critical,CA:FALSE' \
  'keyUsage=critical,digitalSignature,keyEncipherment' > "$work/leaf.ext"
openssl x509 -req -sha256 -days 1 \
  -in "$work/leaf.csr" -CA "$work/ca.crt" -CAkey "$work/ca.key" \
  -CAcreateserial -extfile "$work/leaf.ext" \
  -out "$work/leaf.crt" >/dev/null 2>&1
openssl verify -CAfile "$work/ca.crt" "$work/leaf.crt"

mkdir -p app/src/debug/res/raw app/src/debug/res/xml
cp "$work/ca.crt" app/src/debug/res/raw/deliveryos_lab_ca.crt
cat > app/src/debug/res/xml/network_security_config_debug.xml <<'XML'
<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <base-config cleartextTrafficPermitted="false">
    <trust-anchors>
      <certificates src="system"/>
      <certificates src="@raw/deliveryos_lab_ca"/>
    </trust-anchors>
  </base-config>
</network-security-config>
XML
python3 -u ../tests/android/https_two_server_fixture.py \
  --cert "$work/leaf.crt" --key "$work/leaf.key" \
  ${fixture_args[@]+"${fixture_args[@]}"} > "$work/fixture.log" 2>&1 &
server_pid="$!"
python3 - <<'PY'
import socket, time
for port in (5193, 8080):
    for attempt in range(80):
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=0.3):
                break
        except OSError:
            time.sleep(0.1)
    else:
        raise SystemExit("LAB_HTTPS_SERVER_NOT_READY")
print("LAB_HTTPS_LOCAL_SERVERS_REACHABLE")
PY

if [[ "$scenario" == "two-riders" ]]; then
  # Dois aparelhos nao cabem num connectedDebugAndroidTest: o Gradle daria os
  # MESMOS argumentos aos dois. Aqui o APK e montado uma vez, instalado nos
  # dois, e cada um recebe o seu motoboy.
  while read -r serial status _; do
    if [[ "$status" == "device" && "$serial" == emulator-* ]]; then two_rider_devices+=("$serial"); fi
  done < <(adb devices | tr -d '\r')
  if [[ "${#two_rider_devices[@]}" -ne 2 ]]; then
    echo "LAB_TWO_RIDERS_NEEDS_EXACTLY_TWO_EMULATORS found=${#two_rider_devices[@]}"
    exit 1
  fi
  echo "LAB_HTTPS_SCENARIO=two-riders"
  bash ./gradlew --no-daemon --console=plain :app:assembleDebug :app:assembleDebugAndroidTest \
    -Pentregas.baseUrl=https://10.0.2.2:5193 \
    -Pentregas.platformUrl=https://10.0.2.2:8080
  app_apk="app/build/outputs/apk/debug/app-debug.apk"
  test_apk="app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk"
  for serial in "${two_rider_devices[@]}"; do
    adb -s "$serial" install -r -t "$app_apk" >/dev/null
    adb -s "$serial" install -r -t "$test_apk" >/dev/null
  done
  ride() { # <serial> <motoboy> [cenario]
    adb -s "$1" shell am instrument -w \
      -e class br.com.tata.entregas.RiderHttpsWorkerEndToEndInstrumentedTest \
      -e deliveryosLabRider "$2" ${3:+-e deliveryosLabScenario "$3"} \
      br.com.tata.entregas.debug.test/androidx.test.runner.AndroidJUnitRunner \
      > "$work/rider-$2.txt" 2>&1 || true
  }
  # Ao mesmo tempo: A faz o ponta a ponta de sempre; B age SEM rede e volta.
  ride "${two_rider_devices[0]}" a &
  ride_a="$!"
  ride "${two_rider_devices[1]}" b offline-reconnect &
  ride_b="$!"
  wait "$ride_a" "$ride_b" || true
  failed=0
  for rider in a b; do
    label="LAB_HTTPS_RIDER_$(printf '%s' "$rider" | tr a-z A-Z)_INSTRUMENTATION"
    if grep -q '^OK (' "$work/rider-$rider.txt" &&
       ! grep -qE 'FAILURES!!!|Process crashed' "$work/rider-$rider.txt"; then
      echo "$label=OK"
    else
      echo "$label=FAILED"
      # So rotulos fixos do proprio teste; nunca a saida crua.
      grep -oE '(LAB|REAL)_[A-Z0-9_]{6,80}|Process crashed' "$work/rider-$rider.txt" |
        sort -u | head -n 8 || true
      python3 - "$work/rider-$rider.txt" <<'PY' || true
import sys
sys.path.insert(0, "../tests/android")
from https_failure_category_v1 import LABELS
text = open(sys.argv[1], encoding="utf-8", errors="replace").read()
seen = sorted({v for k, v in LABELS.items() if k in text})
for category in seen: print("ANDROID_HTTPS_FAILURE_CATEGORY " + category)
if not seen: print("ANDROID_HTTPS_FAILURE_CATEGORY UNCLASSIFIED")
PY
      failed=1
    fi
  done
  for rider in A B; do
    grep -qx "LAB_HTTPS_RIDER_${rider}_DEVICE_PREBOUND" "$work/fixture.log" || failed=1
    grep -qx "LAB_HTTPS_RIDER_${rider}_EVENT_BATCH_ATTEMPT=1" "$work/fixture.log" || failed=1
    grep -qx "LAB_HTTPS_RIDER_${rider}_EVENT_BATCH_ATTEMPT=2" "$work/fixture.log" || failed=1
    if grep -qx "LAB_HTTPS_RIDER_${rider}_EVENT_BATCH_ATTEMPT=3" "$work/fixture.log"; then
      echo "LAB_UNEXPECTED_THIRD_BATCH_RIDER_$rider"; failed=1
    fi
  done
  grep -qx 'LAB_HTTPS_DEVICES_PREBOUND=2' "$work/fixture.log" || failed=1
  # Qualquer mistura entre os dois e fatal, mesmo com os dois testes verdes.
  for mark in LAB_HTTPS_CROSS_RIDER_VIOLATION LAB_HTTPS_EVENT_ID_SHARED_BY_TWO_DEVICES \
      LAB_HTTPS_SECRET_MISMATCH_REFUSED LAB_HTTPS_UNBOUND_DEVICE_REFUSED \
      LAB_HTTPS_RIDER_ALREADY_HAS_A_DEVICE; do
    if grep -qx "$mark" "$work/fixture.log"; then echo "$mark"; failed=1; fi
  done
  grep -E '^LAB_HTTPS_(RIDER_[AB]_|DEVICES_PREBOUND)' "$work/fixture.log" | sort | uniq -c | sed -E 's/^ +//'
  if [[ "$failed" -ne 0 ]]; then
    echo "LAB_HTTPS_TWO_RIDERS_NOT_PROVEN"
    exit 1
  fi
  echo "LAB_HTTPS_TWO_RIDERS_TWO_DEVICES_NO_MIX"
  exit 0
fi

# Duas classes, um processo: primeiro a morte do renderizador do WebView na
# MainActivity real (o app tem de sobreviver), depois o ponta a ponta HTTPS.
classes="br.com.tata.entregas.RendererGoneRecoveryInstrumentedTest"
classes="$classes,br.com.tata.entregas.RiderHttpsWorkerEndToEndInstrumentedTest"
scenario_args=()
if [[ -n "$scenario" ]]; then
  # Um cenario roda so a classe do ponta a ponta; o teste escolhe o caso.
  classes="br.com.tata.entregas.RiderHttpsWorkerEndToEndInstrumentedTest"
  scenario_args=("-Pandroid.testInstrumentationRunnerArguments.deliveryosLabScenario=$scenario")
  echo "LAB_HTTPS_SCENARIO=$scenario"
fi
if ! bash ./gradlew --no-daemon --console=plain :app:connectedDebugAndroidTest \
  "-Pandroid.testInstrumentationRunnerArguments.class=$classes" \
  ${scenario_args[@]+"${scenario_args[@]}"} \
  -Pentregas.baseUrl=https://10.0.2.2:5193 \
  -Pentregas.platformUrl=https://10.0.2.2:8080; then
  # Em falha, recolher somente CLASSE de excecao e frames Kotlin locais.
  # Nunca imprimir logcat bruto, mensagens, tokens, GPS, HTTP ou payloads.
  # Collect fixed JUnit assertion categories only; never print raw XML.
  python3 ../tests/android/https_failure_category_v1.py \
    app/build/outputs/androidTest-results/connected || true
  if [[ -z "$scenario" ]]; then
    # O teste do renderizador quebra UM renderizador de proposito
    # (chrome://crash). Um SIGSEGV de renderizador nos rotulos abaixo e esse,
    # esperado; so ele nao explica a falha.
    echo "LAB_HTTPS_ONE_RENDERER_SIGSEGV_IS_DELIBERATE"
  fi
  echo "LAB_HTTPS_INSTRUMENTATION_CRASH_CLASS_DIAGNOSTIC"
  adb logcat -d -v brief -s AndroidRuntime:E 2>/dev/null | python3 -c '
import re, sys
seen=set()
for line in sys.stdin:
    kind=re.search(r"\b((?:java|kotlin|android|androidx)\.[A-Za-z0-9_.$]+(?:Exception|Error))\b",line)
    frame=re.search(r"\bbr\.com\.tata\.entregas\.[A-Za-z0-9_.$]+\(([A-Za-z0-9_.$]+\.kt):(\d{1,5})\)",line)
    label="EXCEPTION_CLASS "+kind.group(1) if kind else (
        "LOCAL_FRAME "+frame.group(1)+":"+frame.group(2) if frame else None)
    if label and label not in seen and len(seen)<20:
        seen.add(label);print(label)
print("DIAGNOSTIC_CLASSES_AND_SOURCE_LINES_ONLY "+str(len(seen)))
' || true
  # O filtro AndroidRuntime acima nao captura crash nativo do processo
  # WebView/emulador. Reusar a via do runner WebView existente, emitindo
  # somente CLASSES/sinais conhecidos da bancada, nunca logcat bruto.
  if command -v adb >/dev/null 2>&1; then
    adb logcat -b crash -d -v brief 2>/dev/null | python3 -c '
import re, sys
seen=set()
for line in sys.stdin:
    label=None
    m=re.search(r"Fatal signal\s+(\d+)",line)
    if m: label="LAB_HTTPS_NATIVE_FATAL_SIGNAL_"+m.group(1)
    elif "SIGSEGV" in line: label="LAB_HTTPS_NATIVE_SIGSEGV"
    elif "SIGABRT" in line: label="LAB_HTTPS_NATIVE_SIGABRT"
    elif "FATAL EXCEPTION" in line: label="LAB_HTTPS_JAVA_FATAL"
    elif "Process: br.com.tata.entregas" in line: label="LAB_HTTPS_APP_PROCESS_CRASH"
    if label and label not in seen and len(seen)<12:
        seen.add(label); print(label)
print("LAB_HTTPS_CRASH_CLASSES_ONLY",len(seen))
' || true
  fi
  # Processo morto por SIGKILL nao deixa NADA nos dois filtros acima: nem
  # excecao Java, nem sinal no buffer de crash. E o caso do renderizador do
  # WebView morto pelo sistema sem tratamento, e o do app morto pelo lmkd.
  # A assinatura fica so em main/system; saem rotulos fixos e contagens.
  if command -v adb >/dev/null 2>&1; then
    adb logcat -b main,system -d -v brief 2>/dev/null |
      python3 ../tests/android/https_process_death_signature_v1.py || true
  fi
  # Uma anotacao PUBLICA (::error title=...::) com diagnostico SANITIZADO, para
  # a proxima falha ficar legivel pela API de check-runs SEM credencial. Isto
  # NAO altera o que o teste prova: so le artefatos ja produzidos. Tudo scrubado.
  if command -v adb >/dev/null 2>&1; then
    { echo "emulator_uptime_s=$(adb shell cat /proc/uptime 2>/dev/null | awk '{print int($1)}')"
      echo "mem_available_kb=$(adb shell cat /proc/meminfo 2>/dev/null | awk '/MemAvailable/{print $2}')"; } \
      > "$work/ci-facts.txt" 2>/dev/null || true
    adb logcat -d -v brief AndroidRuntime:* chromium:* ActivityManager:* lowmemorykiller:* cr_AwContents:* WebView:* '*:S' \
      > "$work/ci-logcat.txt" 2>/dev/null || true
  fi
  python3 ../tests/android/ci_lab_failure_annotation_v1.py \
    --title "DeliveryOS HTTPS lab failed (sanitized)" \
    --results app/build/outputs/androidTest-results/connected \
    --logcat "$work/ci-logcat.txt" --facts "$work/ci-facts.txt" || true
  # Preservar vermelho: diagnostico nao e reparo, e jamais vira sucesso.
  exit 1
fi

grep -qx 'LAB_HTTPS_EVENT_BATCH_ATTEMPT=1' "$work/fixture.log"
grep -qx 'LAB_HTTPS_EVENT_BATCH_ATTEMPT=2' "$work/fixture.log"
if grep -q '^LAB_HTTPS_EVENT_BATCH_ATTEMPT=3$' "$work/fixture.log"; then
  echo "LAB_UNEXPECTED_THIRD_BATCH"
  exit 1
fi
echo "LAB_HTTPS_TWO_IDENTICAL_EVENT_ATTEMPTS_RECEIVED"
