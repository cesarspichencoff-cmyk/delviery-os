#!/usr/bin/env bash
# Q-017 — a composição OFICIAL, em containers: o modo declarado governa cada
# fato, trocar o modo não reclassifica o antigo, e sem modo válido o crítico
# não fica pronto.
#
# Sobe `deploy/compose.platform.yaml` — o arquivo oficial, sem variante — e
# imprime uma linha por medida. Modo e contagem vêm do BANCO, nunca da
# resposta HTTP. Termina com Q017_COMPOSE_REAL_GREEN ou _RED.
#
# PATRIMÔNIO INALCANÇÁVEL. A composição usa nomes FIXOS de container e de
# volume (`deliveryos-platform-pgdados`), e este script faz `down -v` no fim.
# Por isso ele RECUSA rodar (exit 2) se já existir qualquer container
# `deliveryos-*` ou volume `deliveryos-platform-*`: só opera onde não há
# composição, cria a sua e destrói só a sua.
#
# Pré-requisitos:
#   - daemon Docker (sem ele: BLOQUEADO, exit 3);
#   - imagem `deliveryos-platform:v1` construída DESTE checkout — conferido
#     pelo hash das fontes do carimbo contra `tools/carimbar_build.js` (exit 3
#     se for de outro código).
# Em sandbox sem repositório Debian, construa no estágio `build` e passe
#   Q017_OVERRIDE=deploy/compose.sandbox.override.yaml
set -euo pipefail
cd "$(dirname "$0")/.."

IMAGEM=deliveryos-platform:v1
PROJETO=deliveryos-platform
REDE=deliveryos-platform_interna
falhas=0

exige() { # nome obtido esperado
  if [ "$2" = "$3" ]; then echo "  ok  $1 = $2"; else echo "  XX  $1: veio '$2', esperado '$3'"; falhas=$((falhas + 1)); fi
}

# ------------------------------------------------------------ 0. patrimônio
if ! docker info >/dev/null 2>&1; then echo "BLOQUEADO: daemon Docker indisponível"; exit 3; fi
existentes="$(docker ps -a --format '{{.Names}}' | grep -E '^deliveryos-' || true) $(docker volume ls -q | grep -E '^deliveryos-platform-' || true)"
if [ -n "${existentes// /}" ]; then
  echo "RECUSADO: já existe composição nesta máquina — este script faz down -v e não toca no que não criou:"
  echo "$existentes"
  exit 2
fi

# ------------------------------------------------- 1. a imagem é DESTE código
if ! docker image inspect "$IMAGEM" >/dev/null 2>&1; then echo "BLOQUEADO: imagem $IMAGEM ausente"; exit 3; fi
hash_local=$(node -e "process.stdout.write(require('./tools/carimbar_build.js').hashDasFontes().sha256)")
hash_imagem=$(docker run --rm --entrypoint cat "$IMAGEM" dist/build-stamp.json |
  node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>process.stdout.write(JSON.parse(s).fontes_sha256||''))")
if [ "$hash_local" != "$hash_imagem" ]; then
  echo "RECUSADO: a imagem é de outro código (imagem ${hash_imagem:0:12}, checkout ${hash_local:0:12}) — reconstrua"
  exit 3
fi
echo "imagem $IMAGEM · fontes ${hash_local:0:12} · commit $(git rev-parse --short HEAD)"

# ------------------------------------------------------------- 2. ambiente
tmp=$(mktemp -d)
criou=0
compose() { # arquivo-de-ambiente args...
  local arquivo=$1
  shift
  # Ambiente SANEADO: variável exportada no shell venceria o --env-file.
  env -i PATH="$PATH" HOME="$HOME" docker compose -p "$PROJETO" -f deploy/compose.platform.yaml \
    ${Q017_OVERRIDE:+-f "$Q017_OVERRIDE"} --env-file "$arquivo" "$@"
}
limpar() {
  docker rm -f q017-controle >/dev/null 2>&1 || true
  if [ "$criou" = 1 ]; then compose "$tmp/simulated.env" down -v >/dev/null 2>&1 || true; fi
  rm -rf "$tmp"
}
trap limpar EXIT

aleatorio() { node -e "process.stdout.write(require('node:crypto').randomBytes($1).toString('hex'))"; }
SENHA=$(aleatorio 12)
SEGREDO=$(aleatorio 24)
COMMIT=$(git rev-parse HEAD)
base() { printf 'POSTGRES_PASSWORD=%s\nDELIVERYOS_COMMIT=%s\nDELIVERYOS_DEVICE_TOKEN_SECRET=%s\n' "$SENHA" "$COMMIT" "$SEGREDO"; }
base >"$tmp/sem.env"
for m in simulated real; do { base; echo "DELIVERYOS_SOURCE_MODE=$m"; } >"$tmp/$m.env"; done
{ base; echo "DELIVERYOS_SOURCE_MODE=REAL"; } >"$tmp/invalido.env"

saude() { # espera o crítico ficar healthy; devolve o último estado visto
  local st=""
  for _ in $(seq 1 60); do
    st=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{end}}' deliveryos-critical 2>/dev/null || true)
    [ "$st" = healthy ] && break
    sleep 2
  done
  echo "$st"
}
modo_no_boot() { docker logs deliveryos-critical 2>&1 | grep '^\[critico\] iniciando' | tail -1 | grep -o '"source_mode":"[a-z]*"' | cut -d'"' -f4 || true; }
psql_() { docker exec deliveryos-postgres psql -U deliveryos -d deliveryos -Atc "$1"; }
gps() { docker exec -i deliveryos-critical node - Q17C dev-q17c t-q17c "$1" <tools/q017_gps_no_container.js; }

# ------------------------------------------- N1. sem modo, nada sobe
echo "N1. SEM MODO, A COMPOSICAO NAO SOBE"
if compose "$tmp/sem.env" up -d --no-build >"$tmp/n1.txt" 2>&1; then n1=subiu; criou=1; else n1=recusado; fi
exige N1_UP_SEM_MODO "$n1" recusado
exige N1_MOTIVO "$(grep -c 'required variable DELIVERYOS_SOURCE_MODE is missing a value' "$tmp/n1.txt" || true)" 1
exige N1_CONTAINERS_CRIADOS "$(docker ps -a --format '{{.Names}}' | grep -cE '^deliveryos-' || true)" 0

# ------------------------------------------- 3. simulated
echo "S. DECLARADA simulated"
criou=1
compose "$tmp/simulated.env" up -d --no-build >"$tmp/up1.txt" 2>&1
exige S_CRITICO "$(saude)" healthy
exige S_BOOT_DECLARA "$(modo_no_boot)" simulated
for s in deliveryos-migrate deliveryos-critical deliveryos-async deliveryos-backup deliveryos-postgres; do
  esperado=0
  [ "$s" = deliveryos-critical ] && esperado=1
  exige "ESCOPO_$s" "$(docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$s" | grep -c '^DELIVERYOS_SOURCE_MODE=' || true)" "$esperado"
done
psql_ "INSERT INTO identity.unit(unit_id,display_name) VALUES('Q17C','Q017');
       INSERT INTO identity.actor(actor_id,unit_id,role,label) VALUES('a-q17c','Q17C','motoboy_interno','Q017');
       INSERT INTO identity.device(device_id,unit_id,actor_id,label) VALUES('dev-q17c','Q17C','a-q17c','Q017');" >/dev/null
exige S_GPS_A "$(gps 1)" "GPS=200 classe=aceito duplicados=0"

# ------------------------------------------- G. troca para real
echo "G. TROCA PARA real — O FATO ANTIGO NAO MUDA"
compose "$tmp/real.env" up -d --no-build deliveryos-critical >"$tmp/up2.txt" 2>&1
exige G_CRITICO "$(saude)" healthy
exige G_BOOT_DECLARA "$(modo_no_boot)" real
exige G_GPS_B "$(gps 2)" "GPS=200 classe=aceito duplicados=0"
exige G_REENVIO_A "$(gps 1)" "GPS=200 classe=duplicado duplicados=1"
exige G_A_NO_LOG "$(psql_ "SELECT string_agg(source_mode, ',') FROM platform.event_log WHERE idempotency_key = 'gps:dev-q17c:t-q17c:1'")" simulated
exige G_B_NO_LOG "$(psql_ "SELECT string_agg(source_mode, ',') FROM platform.event_log WHERE idempotency_key = 'gps:dev-q17c:t-q17c:2'")" real
exige G_OUTBOX "$(psql_ "SELECT string_agg(payload->>'source_mode', ',' ORDER BY created_at) FROM platform.outbox")" "simulated,real"

# ------------------------------------------- R. reinício do assíncrono
echo "R. O ASSINCRONO REINICIADO RECONSTROI CADA FATO NO SEU MODO"
docker restart deliveryos-async >/dev/null
replay=""
for _ in $(seq 1 60); do
  replay=$(docker logs deliveryos-async 2>&1 | grep '^\[assincrono\] replay {' | sed -n '2p' || true)
  [ -n "$replay" ] && break
  sleep 1
done
escopos=$(printf '%s' "$replay" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const r=JSON.parse(s.slice(s.indexOf('{')));process.stdout.write(r.estado+' '+r.escopos.map(e=>e.unit_id+'|'+e.source_mode+':'+e.fatos).sort().join(','))})" 2>/dev/null || echo "sem-replay")
exige R_REPLAY "$escopos" "completo Q17C|real:1,Q17C|simulated:1"
exige R_ASSINCRONO_SEM_MODO "$(docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' deliveryos-async | grep -c '^DELIVERYOS_SOURCE_MODE=' || true)" 0

# ------------------------------------------- N2. a imagem, contornando o compose
echo "N2. A IMAGEM, SEM O COMPOSE"
comum=(--network "$REDE" -e DELIVERYOS_ENV=pilot
  -e "DELIVERYOS_DATABASE_URL=postgres://deliveryos:$SENHA@deliveryos-postgres:5432/deliveryos"
  -e DELIVERYOS_DATABASE_SSL=false -e DELIVERYOS_DATABASE_PRIVATE_HOST=deliveryos-postgres
  -e "DELIVERYOS_COMMIT=$COMMIT" -e "DELIVERYOS_DEVICE_TOKEN_SECRET=$SEGREDO" -e DELIVERYOS_HOST=0.0.0.0)
set +e
docker run --rm "${comum[@]}" "$IMAGEM" node dist/src/platform/bin/critical.js >"$tmp/n2.txt" 2>&1
n2=$?
docker run --rm "${comum[@]}" -e DELIVERYOS_SOURCE_MODE= "$IMAGEM" node dist/src/platform/bin/critical.js >"$tmp/n2b.txt" 2>&1
n2b=$?
set -e
exige N2_AUSENTE_EXIT "$n2" 78
exige N2_AUSENTE_MOTIVO "$(grep -c 'DELIVERYOS_SOURCE_MODE ausente' "$tmp/n2.txt" || true)" 1
exige N2_VAZIO_EXIT "$n2b" 78
docker run -d --name q017-controle "${comum[@]}" -e DELIVERYOS_SOURCE_MODE=control "$IMAGEM" node dist/src/platform/bin/critical.js >/dev/null
sleep 5
exige N2_CONTROLE_ESCUTA "$(docker logs q017-controle 2>&1 | grep -c 'ouvindo em' || true)" 1
docker rm -f q017-controle >/dev/null

# ------------------------------------------- N3. inválido pelo compose
echo "N3. INVALIDO PASSA PELO COMPOSE E O CRITICO NUNCA FICA PRONTO"
compose "$tmp/invalido.env" up -d --no-build deliveryos-critical >"$tmp/up3.txt" 2>&1 && n3=aceito || n3=recusado
exige N3_COMPOSE "$n3" aceito
sleep 20
exige N3_EXIT "$(docker inspect -f '{{.State.ExitCode}}' deliveryos-critical)" 78
exige N3_NUNCA_PRONTO "$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{end}}' deliveryos-critical | grep -c '^healthy$' || true)" 0
exige N3_OUVINDO "$(docker logs deliveryos-critical 2>&1 | grep -c 'ouvindo em' || true)" 0
exige N3_MOTIVO "$([ "$(docker logs deliveryos-critical 2>&1 | grep -c 'inválido ("REAL")' || true)" -ge 1 ] && echo sim || echo nao)" sim
echo "  ..  N3_REINICIOS = $(docker inspect -f '{{.RestartCount}}' deliveryos-critical)"

exige FATOS_NO_LOG "$(psql_ 'SELECT count(*) FROM platform.event_log')" 2

if [ "$falhas" -gt 0 ]; then
  echo "Q017_COMPOSE_REAL_RED ($falhas)"
  exit 1
fi
echo "Q017_COMPOSE_REAL_GREEN"
