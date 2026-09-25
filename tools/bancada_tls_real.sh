#!/usr/bin/env bash
# Bancada TLS do emulador — a topologia de laboratório do Foxxy, medida com os
# binários reais, sem emulador. Ver docs/etapa-4-8/BANCADA-EMULADOR.md.
#
#   lado "WSL" (tudo em loopback):
#     crítico de dist/ em 127.0.0.1:18080 (HTTP, DELIVERYOS_SOURCE_MODE=simulated)
#     socat TLS em 127.0.0.1:8080 -> 127.0.0.1:18080
#     piloto com HTTPS nativo em 127.0.0.1:5193 (loopback = modo local)
#     assíncrono de dist/ no mesmo banco
#   lado "Windows + emulador": relays TCP puros em 10.0.2.2 -> loopback, como o
#     encaminhamento de localhost do WSL e o NAT do emulador fazem.
#   cliente: tools/bancada_tls_cliente.java — o HttpsURLConnection do app,
#     confiando SÓ na CA de laboratório.
#
# Mede: TLS por IP com SAN (e os dois controles negativos), sessão do aparelho
# (vínculo + auditoria), lote de GPS até platform.event_log com
# source_mode=simulated, outbox drenada, projeção, replay depois de reinício,
# e /api/entregas mostrando o aparelho, separado da demonstração.
# NÃO mede nada de Android: CA de usuário, WebView, emulador e WSL ficam para
# o procedimento do documento. Termina com BANCADA_TLS_GREEN ou _RED.
#
# Patrimônio: banco próprio (recusa se o nome existir), diretório temporário
# próprio, e recusa rodar se 8080/18080/5193/5290 já estiverem ocupadas.
# Precisa de root (alias de loopback), ip, socat, openssl, java 17+, psql,
# DELIVERYOS_PG_URL (URL administrativa, ex.: postgres://postgres@127.0.0.1:5433/deliveryos),
# e dist/ construído (npm run build:platform && npx tsc).
set -u
cd "$(dirname "$0")/.." || exit 1
R=$(pwd)
URL_ADMIN=${DELIVERYOS_PG_URL:?DELIVERYOS_PG_URL obrigatória}
BASE=${URL_ADMIN%/*}
DB="bancada_tls_$$"
DEV=dev-bancada-tls-01
T=$(mktemp -d)
PIDS=()
FALHAS=0

for bin in ip socat openssl java psql node npx; do
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
  ip addr del 10.0.2.2/32 dev lo 2>/dev/null; ip addr del 10.0.2.3/32 dev lo 2>/dev/null
  rm -rf "$T"
}
trap limpar EXIT
checa() { if [ "$1" = 0 ]; then echo "  ok  $2"; else echo "  XX  $2"; FALHAS=$((FALHAS + 1)); fi; }
esperar() { for _ in $(seq 1 "$2"); do curl --noproxy '*' -skf -o /dev/null "$1" && return 0; sleep 0.5; done; return 1; }
sobe() { setsid "$@" & PIDS+=($!); }

echo "== PKI de laboratório (openssl) — o que o documento manda fazer no WSL"
openssl req -x509 -newkey rsa:2048 -nodes -days 30 -sha256 -keyout "$T/ca.key" -out "$T/ca.pem" \
  -subj "/CN=DeliveryOS Bancada CA (laboratorio)" \
  -addext "basicConstraints=critical,CA:TRUE" -addext "keyUsage=critical,keyCertSign,cRLSign" 2>/dev/null
openssl req -newkey rsa:2048 -nodes -keyout "$T/srv.key" -out "$T/srv.csr" -subj "/CN=bancada 10.0.2.2" 2>/dev/null
printf 'basicConstraints=CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\nsubjectAltName=IP:10.0.2.2,IP:127.0.0.1,DNS:localhost\n' > "$T/srv.ext"
openssl x509 -req -in "$T/srv.csr" -CA "$T/ca.pem" -CAkey "$T/ca.key" -CAcreateserial -days 30 -sha256 \
  -extfile "$T/srv.ext" -out "$T/srv.pem" 2>/dev/null
openssl verify -CAfile "$T/ca.pem" "$T/srv.pem" >/dev/null 2>&1; checa $? "o certificado de bancada fecha na CA de laboratório"
openssl x509 -in "$T/srv.pem" -noout -ext subjectAltName 2>/dev/null | grep -q "IP Address:10.0.2.2"; checa $? "o SAN cobre 10.0.2.2 (o host visto do emulador)"

ip addr add 10.0.2.2/32 dev lo && ip addr add 10.0.2.3/32 dev lo || { echo "sem permissão para alias de loopback"; exit 3; }

echo "== banco isolado, crítico (simulated, 18080) e assíncrono"
psql "$URL_ADMIN" -qAtc "CREATE DATABASE $DB" || exit 1
SEG=$(openssl rand -hex 32)
DELIVERYOS_ENV=local DELIVERYOS_DATABASE_URL="$BASE/$DB" DELIVERYOS_DEVICE_TOKEN_SECRET="$SEG" \
DELIVERYOS_PORT=18080 DELIVERYOS_HOST=127.0.0.1 DELIVERYOS_SOURCE_MODE=simulated \
  sobe node dist/src/platform/bin/critical.js > "$T/critico.log" 2>&1
esperar http://127.0.0.1:18080/ready 60; checa $? "crítico pronto em 127.0.0.1:18080"
psql "$BASE/$DB" -qAt >/dev/null <<SQL
INSERT INTO identity.unit (unit_id, display_name) VALUES ('unit-emulator-lab','Bancada TLS');
INSERT INTO identity.actor (actor_id, unit_id, role, label) VALUES ('rider-emulator-lab','unit-emulator-lab','motoboy_interno','bancada');
INSERT INTO identity.device (device_id, unit_id, actor_id, label) VALUES ('$DEV','unit-emulator-lab','rider-emulator-lab','bancada TLS');
SQL
[ "$(psql "$BASE/$DB" -qAtc "SELECT (secret_hash IS NULL AND last_session_at IS NULL) FROM identity.device WHERE device_id='$DEV'")" = t ]
checa $? "antes: autorizado, não vinculado, sem sessão"
DELIVERYOS_ENV=local DELIVERYOS_DATABASE_URL="$BASE/$DB" DELIVERYOS_TICK_MS=200 \
  sobe node dist/src/platform/bin/async-runtime.js > "$T/assincrono.log" 2>&1
ASSINCRONO=${PIDS[-1]}
for _ in $(seq 1 40); do grep -q "\[assincrono\] replay" "$T/assincrono.log" && break; sleep 0.5; done
grep -q '"estado":"completo","lidas":0' "$T/assincrono.log"; checa $? "assíncrono: replay completo com o log vazio"

echo "== TLS de bancada"
sobe socat OPENSSL-LISTEN:8080,bind=127.0.0.1,reuseaddr,fork,cert="$T/srv.pem",key="$T/srv.key",verify=0 TCP:127.0.0.1:18080
mkdir -p "$T/piloto"
ENTREGAS_HTTPS=1 ENTREGAS_TLS_CERT="$T/srv.pem" ENTREGAS_TLS_KEY="$T/srv.key" ENTREGAS_UI_PORT=5193 \
ENTREGAS_PILOT_CONFIG=config/entregas-pilot.example.json ENTREGAS_DATA_DIR="$T/piloto" \
  sobe node dist/tools/entregas_pilot_server.js > "$T/piloto.log" 2>&1
sobe socat TCP-LISTEN:8080,bind=10.0.2.2,reuseaddr,fork TCP:127.0.0.1:8080
sobe socat TCP-LISTEN:5193,bind=10.0.2.2,reuseaddr,fork TCP:127.0.0.1:5193
sobe socat TCP-LISTEN:8080,bind=10.0.2.3,reuseaddr,fork TCP:127.0.0.1:8080
esperar https://127.0.0.1:8080/health 40; checa $? "socat TLS respondendo em 127.0.0.1:8080"
esperar https://127.0.0.1:5193/rider-mobile/ 60; checa $? "piloto com HTTPS nativo em 127.0.0.1:5193, modo local"

echo "== o cliente, pelo caminho do emulador (https://10.0.2.2)"
java tools/bancada_tls_cliente.java "$T/ca.pem" https://10.0.2.2:8080 https://10.0.2.2:5193 "$DEV" https://10.0.2.3:8080 2>&1 \
  | grep -vE "Picked up JAVA_TOOL_OPTIONS" > "$T/cliente.log"
cat "$T/cliente.log"
grep -q "CLIENTE_GREEN" "$T/cliente.log"; checa $? "cliente verde"

echo "== o banco depois (nada de token nem segredo)"
q() { psql "$BASE/$DB" -qAtc "$1"; }
[ "$(q "SELECT (secret_hash IS NOT NULL AND secret_bound_at IS NOT NULL AND last_session_at IS NOT NULL) FROM identity.device WHERE device_id='$DEV'")" = t ]
checa $? "identity.device: vinculado, secret_bound_at e last_session_at preenchidos"
[ "$(q "SELECT count(*) FROM platform.audit WHERE object_id='$DEV' AND action='device_session_issued'")" -ge 1 ]
checa $? "platform.audit: device_session_issued"
[ "$(q "SELECT count(*) FROM platform.event_log WHERE device_id='$DEV' AND event_type='gps_batch_received' AND source_mode='simulated' AND clock_trust='trusted'")" = 1 ]
checa $? "platform.event_log: 1 fato gps_batch_received, simulated, clock_trust trusted"
for _ in $(seq 1 30); do [ "$(q "SELECT count(*) FROM platform.outbox WHERE state<>'done'")" = 0 ] && break; sleep 0.5; done
[ "$(q "SELECT count(*) FROM platform.outbox WHERE state<>'done'")" = 0 ]; checa $? "outbox drenada pelo assíncrono"
grep -q '\[assincrono\] operacao-viva {"aplicados":1' "$T/assincrono.log"; checa $? "Operação Viva aplicou o fato"

echo "== reinício do assíncrono: replay do event log"
kill -- "-$ASSINCRONO"; sleep 1
DELIVERYOS_ENV=local DELIVERYOS_DATABASE_URL="$BASE/$DB" DELIVERYOS_TICK_MS=200 \
  sobe node dist/src/platform/bin/async-runtime.js > "$T/assincrono2.log" 2>&1
for _ in $(seq 1 40); do grep -q "\[assincrono\] replay" "$T/assincrono2.log" && break; sleep 0.5; done
grep -q '"estado":"completo","lidas":1,"aptos":1' "$T/assincrono2.log"; checa $? "replay: 1 fato lido, apto, aplicado"

echo "== superfície: /api/entregas lendo o banco"
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
print(("  ok  " if ok else "  XX  ") + "/api/entregas: o aparelho na realidade — credencial vinculada, GPS fresh, modo simulated, 1 fato; a demonstração continua em blocos separados")
sys.exit(0 if ok else 1)
PY
[ $? = 0 ] || FALHAS=$((FALHAS + 1))

echo
[ "$FALHAS" = 0 ] && echo "BANCADA_TLS_GREEN" || { echo "BANCADA_TLS_RED ($FALHAS)"; exit 1; }
