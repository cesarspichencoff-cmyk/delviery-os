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
work="$(mktemp -d)"
chmod 700 "$work"
server_pid=""
cleanup() {
  if [[ -n "$server_pid" ]]; then kill "$server_pid" 2>/dev/null || true; fi
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
  --cert "$work/leaf.crt" --key "$work/leaf.key" > "$work/fixture.log" 2>&1 &
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

# Duas classes, um processo: primeiro a morte do renderizador do WebView na
# MainActivity real (o app tem de sobreviver), depois o ponta a ponta HTTPS.
classes="br.com.tata.entregas.RendererGoneRecoveryInstrumentedTest"
classes="$classes,br.com.tata.entregas.RiderHttpsWorkerEndToEndInstrumentedTest"
if ! bash ./gradlew --no-daemon --console=plain :app:connectedDebugAndroidTest \
  "-Pandroid.testInstrumentationRunnerArguments.class=$classes" \
  -Pentregas.baseUrl=https://10.0.2.2:5193 \
  -Pentregas.platformUrl=https://10.0.2.2:8080; then
  # Em falha, recolher somente CLASSE de excecao e frames Kotlin locais.
  # Nunca imprimir logcat bruto, mensagens, tokens, GPS, HTTP ou payloads.
  # Collect fixed JUnit assertion categories only; never print raw XML.
  python3 ../tests/android/https_failure_category_v1.py \
    app/build/outputs/androidTest-results/connected || true
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
