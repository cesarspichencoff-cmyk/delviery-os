#!/usr/bin/env bash
# Prova de sinal do mesmo dumb-init fornecido pelo Debian Bookworm.
# Não instala pacote, não usa Docker e não toca banco. Tudo vive em mktemp.
set -euo pipefail
cd "$(dirname "$0")/.."
R=$(pwd)

for bin in curl sha256sum dpkg-deb unshare pgrep node; do
  command -v "$bin" >/dev/null || { echo "PULADO: falta $bin"; exit 0; }
done
unshare -Ur true >/dev/null 2>&1 || {
  echo "PULADO: user namespace indisponivel; PID1 nao foi exercitado"
  exit 0
}
SOURCE="$R/dist/src/platform/bin/entregas-source-ingest.js"
[ -f "$SOURCE" ] || {
  echo "PRECONDICAO: dist ausente; rode npx tsc antes desta prova" >&2
  exit 3
}

URL=https://deb.debian.org/debian/pool/main/d/dumb-init/dumb-init_1.2.5-2_amd64.deb
EXPECTED=a8eae71eb01d0b1c378708a8dbef0247615e9f9d43dd7b37ca77958963360afd
T=$(mktemp -d)
trap 'rm -rf "$T"' EXIT
curl -fsSL "$URL" -o "$T/dumb-init.deb"
ACTUAL=$(sha256sum "$T/dumb-init.deb" | awk '{print $1}')
[ "$ACTUAL" = "$EXPECTED" ] || {
  echo "DUMB_INIT_BOOKWORM_SHA256_MISMATCH expected=$EXPECTED actual=$ACTUAL" >&2
  exit 4
}
echo "BOOKWORM_DEB_SHA256_PASS $ACTUAL"

dpkg-deb -x "$T/dumb-init.deb" "$T/root"
DUMB="$T/root/usr/bin/dumb-init"
[ -x "$DUMB" ] || { echo "dumb-init ausente no pacote" >&2; exit 4; }
"$DUMB" --version

cat > "$T/inside.sh" <<'INNER'
#!/usr/bin/env bash
set -e
awk '/^NSpid:/{print "DUMB_INIT_" $0}' /proc/1/status
exec "$DUMB_BIN" -- node "$SOURCE_INGEST"
INNER
chmod +x "$T/inside.sh"

LOG="$T/run.log"
DUMB_BIN="$DUMB" SOURCE_INGEST="$SOURCE" \
DELIVERYOS_ENTREGAS_SOURCE_INGEST_ENABLED=false \
  unshare -Urpf --mount-proc "$T/inside.sh" >"$LOG" 2>&1 &
LAUNCHER=$!
for _ in $(seq 1 100); do
  grep -q 'DUMB_INIT_NSpid:' "$LOG" &&
    grep -q '\[source-ingest\] DESLIGADO' "$LOG" && break
  sleep 0.05
done
cat "$LOG"
grep -q $'DUMB_INIT_NSpid:\t1' "$LOG" || {
  echo "PID1_NOT_PROVEN" >&2
  kill -KILL "$LAUNCHER" 2>/dev/null || true
  exit 5
}
grep -q '\[source-ingest\] DESLIGADO' "$LOG" || {
  echo "SOURCE_INGEST_NOT_READY" >&2
  kill -KILL "$LAUNCHER" 2>/dev/null || true
  exit 5
}

OUTER=""
for _ in $(seq 1 40); do
  OUTER=$(pgrep -P "$LAUNCHER" | head -1 || true)
  [ -n "$OUTER" ] && break
  sleep 0.05
done
[ -n "$OUTER" ] || {
  echo "DUMB_INIT_OUTER_PID_NOT_FOUND" >&2
  kill -KILL "$LAUNCHER" 2>/dev/null || true
  exit 6
}
echo "DUMB_INIT_PID1_PROVEN inner=1 outer=$OUTER"
kill -TERM "$OUTER"
set +e
wait "$LAUNCHER"
CODE=$?
set -e
sleep 0.1
cat "$LOG"
echo "LAUNCHER_EXIT=$CODE"
[ "$CODE" = 0 ] || {
  echo "DUMB_INIT_FORWARDING_FAILED" >&2
  exit 7
}
echo "DUMB_INIT_PID1_SIGTERM_PASS"
