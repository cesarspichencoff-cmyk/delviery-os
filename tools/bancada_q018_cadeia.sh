#!/usr/bin/env bash
# Bancada Q-018 — a cadeia do emulador, medida com os binários reais, SEM o
# emulador. Ver docs/etapa-4-8/Q018-RIDER-CAPTURA.md e BANCADA-EMULADOR.md.
#
# A topologia é a do Foxxy (tools/bancada_tls_real.sh), agora com o que a
# Q-018 trouxe:
#   crítico de dist/ (DELIVERYOS_SOURCE_MODE=simulated) atrás de socat TLS;
#   assíncrono de dist/ no mesmo banco isolado;
#   piloto com HTTPS nativo, laboratório DECLARADO (ENTREGAS_LABORATORIO=1),
#     termo sintético (tools/bancada_termo_sintetico.json) e flag de GPS ligada;
#   relays em 10.0.2.2, como o emulador vê o Windows.
# O motoboy: tools/bancada_q018_rider.ts — Chromium na rider-mobile, termo
# aceito PELA INTERFACE, permissão, saída pelo domínio, startTripCapture; o
# lado nativo de rede feito no formato exato do app.
#
# NÃO mede Kotlin: Room, TripLocationService, Fused e WorkManager ficam para
# o Foxxy. Termina com BANCADA_Q018_GREEN ou _RED.
#
# Patrimônio: banco próprio (recusa se o nome existir), diretório temporário
# próprio, recusa rodar se 8080/18080/5193/5290 estiverem ocupadas. Precisa de
# root (alias de loopback), ip, socat, openssl, psql, node/npx com playwright,
# DELIVERYOS_PG_URL (URL administrativa) e dist/ construído
# (npm run build:platform && npx tsc).
set -u
R=$(pwd)
URL_ADMIN=${DELIVERYOS_PG_URL:?DELIVERYOS_PG_URL obrigatória}
BASE=${URL_ADMIN%/*}
DB="bancada_q018_$$"
DEV=dev-bancada-q018-01
T=$(mktemp -d)
PIDS=()
FALHAS=0

for bin in ip socat openssl psql node npx; do
  command -v "$bin" >/dev/null || { echo "falta $bin"; exit 3; }
done
[ -f dist/src/platform/bin/critical.js ] && [ -f dist/tools/entregas_pilot_server.js ] || { echo "dist/ incompleto"; exit 3; }
if ss -ltn | grep -qE ":(8080|18080|5193|5290) "; then echo "porta de bancada ocupada — recusado"; exit 2; fi
[ "$(psql "$URL_ADMIN" -qAtc "SELECT count(*) FROM pg_database WHERE datname='$DB'")" = "0" ] || { echo "banco $DB existe — recusado"; exit 2; }

limpar() {
  for p in "${PIDS[@]}"; do kill -- "-$p" 2>/dev/null; done
  sleep 1
  for p in "${PIDS[@]}"; do kill -9 -- "-$p" 2>/dev/null; done
  psql "$URL_ADMIN" -qAtc "DROP DATABASE IF EXISTS $DB WITH (FORCE)" >/dev/null 2>&1
  ip addr del 10.0.2.2/32 dev lo 2>/dev/null
  rm -rf "$T"
}
trap limpar EXIT
checa() { if [ "$1" = 0 ]; then echo "  ok  $2"; else echo "  XX  $2"; FALHAS=$((FALHAS + 1)); fi; }
esperar() { for _ in $(seq 1 "$2"); do curl --noproxy '*' -skf -o /dev/null "$1" && return 0; sleep 0.5; done; return 1; }
sobe() { setsid "$@" & PIDS+=($!); }
q() { psql "$BASE/$DB" -qAtc "$1"; }

echo "== PKI de laboratório"
openssl req -x509 -newkey rsa:2048 -nodes -days 30 -sha256 -keyout "$T/ca.key" -out "$T/ca.pem" \
  -subj "/CN=DeliveryOS Bancada CA (laboratorio)" \
  -addext "basicConstraints=critical,CA:TRUE" -addext "keyUsage=critical,keyCertSign,cRLSign" 2>/dev/null
openssl req -newkey rsa:2048 -nodes -keyout "$T/srv.key" -out "$T/srv.csr" -subj "/CN=bancada 10.0.2.2" 2>/dev/null
printf 'basicConstraints=CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\nsubjectAltName=IP:10.0.2.2,IP:127.0.0.1,DNS:localhost\n' > "$T/srv.ext"
openssl x509 -req -in "$T/srv.csr" -CA "$T/ca.pem" -CAkey "$T/ca.key" -CAcreateserial -days 30 -sha256 \
  -extfile "$T/srv.ext" -out "$T/srv.pem" 2>/dev/null
openssl verify -CAfile "$T/ca.pem" "$T/srv.pem" >/dev/null 2>&1; checa $? "o certificado de bancada fecha na CA de laboratório, SAN com 10.0.2.2"
# O Chromium confia SÓ neste certificado: pino de SPKI, nada de trust-all.
SPKI=$(openssl x509 -in "$T/srv.pem" -pubkey -noout | openssl pkey -pubin -outform der 2>/dev/null | openssl dgst -sha256 -binary | base64)
ip addr add 10.0.2.2/32 dev lo || { echo "sem permissão para alias de loopback"; exit 3; }

echo "== banco isolado, crítico (simulated) e assíncrono"
psql "$URL_ADMIN" -qAtc "CREATE DATABASE $DB" || exit 1
SEG=$(openssl rand -hex 32)
DELIVERYOS_ENV=local DELIVERYOS_DATABASE_URL="$BASE/$DB" DELIVERYOS_DEVICE_TOKEN_SECRET="$SEG" \
DELIVERYOS_PORT=18080 DELIVERYOS_HOST=127.0.0.1 DELIVERYOS_SOURCE_MODE=simulated \
  sobe node dist/src/platform/bin/critical.js > "$T/critico.log" 2>&1
esperar http://127.0.0.1:18080/ready 60; checa $? "crítico pronto (simulated)"
grep -q "simulated" "$T/critico.log"; checa $? "o boot do crítico declara o modo simulated"
# Ato humano de laboratório: autorizar o aparelho (FIELD-GATE §2.5).
psql "$BASE/$DB" -qAt >/dev/null <<SQL
INSERT INTO identity.unit (unit_id, display_name) VALUES ('unit-emulator-lab','Bancada Q-018');
INSERT INTO identity.actor (actor_id, unit_id, role, label) VALUES ('rider-emulator-lab','unit-emulator-lab','motoboy_interno','bancada');
INSERT INTO identity.device (device_id, unit_id, actor_id, label) VALUES ('$DEV','unit-emulator-lab','rider-emulator-lab','bancada Q-018');
SQL
[ "$(q "SELECT (secret_hash IS NULL AND last_session_at IS NULL) FROM identity.device WHERE device_id='$DEV'")" = t ]
checa $? "antes: aparelho autorizado, não vinculado, sem sessão"
DELIVERYOS_ENV=local DELIVERYOS_DATABASE_URL="$BASE/$DB" DELIVERYOS_TICK_MS=200 \
  sobe node dist/src/platform/bin/async-runtime.js > "$T/assincrono.log" 2>&1
ASSINCRONO=${PIDS[-1]}
for _ in $(seq 1 40); do grep -q "\[assincrono\] replay" "$T/assincrono.log" && break; sleep 0.5; done
grep -q '"estado":"completo","lidas":0' "$T/assincrono.log"; checa $? "assíncrono: replay completo com o log vazio"

echo "== TLS de bancada e o piloto de LABORATÓRIO"
sobe socat OPENSSL-LISTEN:8080,bind=127.0.0.1,reuseaddr,fork,cert="$T/srv.pem",key="$T/srv.key",verify=0 TCP:127.0.0.1:18080
mkdir -p "$T/piloto"
printf '{"gps_capture_enabled": true, "offline_queue_enabled": true}\n' > "$T/flags.json"
ENTREGAS_HTTPS=1 ENTREGAS_TLS_CERT="$T/srv.pem" ENTREGAS_TLS_KEY="$T/srv.key" ENTREGAS_UI_PORT=5193 \
ENTREGAS_PILOT_CONFIG=config/entregas-pilot.example.json ENTREGAS_DATA_DIR="$T/piloto" \
ENTREGAS_LABORATORIO=1 ENTREGAS_TERM_CONFIG="$R/tools/bancada_termo_sintetico.json" \
ENTREGAS_GPS_FLAGS_CONFIG="$T/flags.json" ENTREGAS_UNIT_CONFIG="$T/sem-unidade.json" \
  sobe node dist/tools/entregas_pilot_server.js > "$T/piloto.log" 2>&1
sobe socat TCP-LISTEN:8080,bind=10.0.2.2,reuseaddr,fork TCP:127.0.0.1:8080
sobe socat TCP-LISTEN:5193,bind=10.0.2.2,reuseaddr,fork TCP:127.0.0.1:5193
esperar https://127.0.0.1:8080/health 40; checa $? "socat TLS na frente do crítico"
esperar https://127.0.0.1:5193/rider-mobile/ 60; checa $? "piloto de laboratório com HTTPS nativo, modo local"

echo
NO_PROXY="*" npx tsx tools/bancada_q018_rider.ts https://10.0.2.2:5193 https://10.0.2.2:8080 "$T/ca.pem" "$SPKI" "$DEV" "$T/rider.json" 2>&1 \
  | tee "$T/rider.log"
grep -q "RIDER_Q018_GREEN" "$T/rider.log"; checa $? "a rider-mobile, pelo caminho do emulador"
TRIP=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["trip_id"])' "$T/rider.json" 2>/dev/null)
HASH=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["term_hash"])' "$T/rider.json" 2>/dev/null)

echo
echo "== o piloto depois: o aceite é do motoboy, pela interface, deste aparelho"
python3 - "$T/piloto/term-acks.jsonl" "$DEV" "$HASH" <<'PY'
import json, sys
linhas = [json.loads(l) for l in open(sys.argv[1]) if l.strip()]
ok = (len(linhas) == 1 and linhas[0]["status"] == "accepted" and linhas[0]["rider_id"] == "rid-1"
      and linhas[0]["device_id"] == sys.argv[2] and linhas[0]["term_hash"] == sys.argv[3]
      and linhas[0]["unit_id"] == "LABORATORIO")
print(("  ok  " if ok else "  XX  ") + f"term-acks.jsonl: {len(linhas)} registro, accepted, rid-1, este aparelho, hash do termo sintético")
sys.exit(0 if ok else 1)
PY
[ $? = 0 ] || FALHAS=$((FALHAS + 1))

echo "== o banco depois (nada de token nem segredo)"
[ "$(q "SELECT (secret_hash IS NOT NULL AND secret_bound_at IS NOT NULL AND last_session_at IS NOT NULL) FROM identity.device WHERE device_id='$DEV'")" = t ]
checa $? "identity.device: vinculado no primeiro contato"
[ "$(q "SELECT count(*) FROM platform.audit WHERE object_id='$DEV' AND action='device_session_issued'")" -ge 1 ]
checa $? "platform.audit: device_session_issued"
N=$(q "SELECT count(*) FROM platform.event_log WHERE device_id='$DEV' AND event_type='gps_batch_received' AND object_type='trip' AND object_id='$TRIP' AND source_mode='simulated' AND clock_trust='trusted'")
[ "$N" = 1 ]; checa $? "platform.event_log: 1 fato gps_batch_received da viagem $TRIP (a da página), simulated, trusted"
[ "$(q "SELECT count(*) FROM platform.event_log WHERE source_mode IS DISTINCT FROM 'simulated'")" = 0 ]
checa $? "nenhum fato fora de simulated"
for _ in $(seq 1 30); do [ "$(q "SELECT count(*) FROM platform.outbox WHERE state<>'done'")" = 0 ] && break; sleep 0.5; done
[ "$(q "SELECT count(*) FROM platform.outbox WHERE state<>'done'")" = 0 ]; checa $? "outbox drenada pelo assíncrono"
grep -q '\[assincrono\] operacao-viva {"aplicados":1' "$T/assincrono.log"; checa $? "Operação Viva aplicou o fato"

echo "== reinício do assíncrono: replay do event log"
kill -- "-$ASSINCRONO"; sleep 1
DELIVERYOS_ENV=local DELIVERYOS_DATABASE_URL="$BASE/$DB" DELIVERYOS_TICK_MS=200 \
  sobe node dist/src/platform/bin/async-runtime.js > "$T/assincrono2.log" 2>&1
for _ in $(seq 1 40); do grep -q "\[assincrono\] replay" "$T/assincrono2.log" && break; sleep 0.5; done
grep -q '"estado":"completo","lidas":1,"aptos":1' "$T/assincrono2.log"; checa $? "replay: 1 fato lido, apto"

echo "== Entregas: /api/entregas lendo o banco"
PRODUCT_UI_PORT=5290 DELIVERYOS_DATABASE_URL="$BASE/$DB" sobe npx tsx tools/product_system_server.ts > "$T/product.log" 2>&1
esperar http://127.0.0.1:5290/api/entregas 90; checa $? "Product System no ar"
curl --noproxy '*' -s http://127.0.0.1:5290/api/entregas > "$T/entregas.json"
python3 - "$T/entregas.json" "$DEV" <<'PY'
import json, sys
d = json.load(open(sys.argv[1])); dev = sys.argv[2]
r = d["realidade"]
a = next((x for x in r["aparelhos"] if x.get("device_id") == dev), None)
ok = (a is not None and r["fonte"]["valor"].startswith("platform.event_log")
      and a["credencial"]["valor"] == "vinculada" and a["gps"]["valor"] == "fresh"
      and a["modo_dos_fatos"]["valor"] == "simulated" and a["fatos"]["valor"] == 1)
print(("  ok  " if ok else "  XX  ") + "/api/entregas: o aparelho na realidade — credencial vinculada, GPS fresh, modo simulated, 1 fato")
sys.exit(0 if ok else 1)
PY
[ $? = 0 ] || FALHAS=$((FALHAS + 1))

echo
[ "$FALHAS" = 0 ] && echo "BANCADA_Q018_GREEN" || { echo "BANCADA_Q018_RED ($FALHAS)"; exit 1; }
