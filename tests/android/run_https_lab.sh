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

bash ./gradlew --no-daemon --console=plain :app:connectedDebugAndroidTest \
  -Pandroid.testInstrumentationRunnerArguments.class=br.com.tata.entregas.RiderHttpsWorkerEndToEndInstrumentedTest \
  -Pentregas.baseUrl=https://10.0.2.2:5193 \
  -Pentregas.platformUrl=https://10.0.2.2:8080

grep -qx 'LAB_HTTPS_EVENT_BATCH_ATTEMPT=1' "$work/fixture.log"
grep -qx 'LAB_HTTPS_EVENT_BATCH_ATTEMPT=2' "$work/fixture.log"
if grep -q '^LAB_HTTPS_EVENT_BATCH_ATTEMPT=3$' "$work/fixture.log"; then
  echo "LAB_UNEXPECTED_THIRD_BATCH"
  exit 1
fi
echo "LAB_HTTPS_TWO_IDENTICAL_EVENT_ATTEMPTS_RECEIVED"
