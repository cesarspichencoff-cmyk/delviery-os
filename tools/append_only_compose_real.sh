#!/usr/bin/env bash
# Append-Only Closure — a trava na composição OFICIAL, em containers: o job
# `deliveryos-migrate` da imagem real aplica a 0004, e o banco da composição
# aceita INSERT e recusa UPDATE, DELETE e TRUNCATE no event log. Mede pelo
# banco, executando — o catálogo não prova nada sozinho. Mede também o papel
# com que o runtime conecta (o limite declarado em docs/etapa-4-8/APPEND-ONLY.md).
# Termina com AO_COMPOSE_TRAVA_GREEN ou _RED.
#
# PATRIMÔNIO INALCANÇÁVEL, mesmo contrato de tools/q017_compose_real.sh: a
# composição usa nomes FIXOS e este script faz `down -v` no fim, então ele
# RECUSA rodar (exit 2) se já existir container `deliveryos-*` ou volume
# `deliveryos-platform-*`. Só opera onde não há composição, cria a sua e
# destrói só a sua.
#
# Pré-requisitos: daemon Docker e a imagem `deliveryos-platform:v1` construída
# DESTE checkout (exit 3 sem um ou outro). Em sandbox sem repositório Debian,
# construa no estágio `build` e passe AO_OVERRIDE=deploy/compose.sandbox.override.yaml
set -euo pipefail
cd "$(dirname "$0")/.."

IMAGEM=deliveryos-platform:v1
PROJETO=deliveryos-platform
falhas=0
exige() { if [ "$2" = "$3" ]; then echo "  ok  $1 = $2"; else echo "  XX  $1: veio '$2', esperado '$3'"; falhas=$((falhas + 1)); fi; }

if ! docker info >/dev/null 2>&1; then echo "BLOQUEADO: daemon Docker indisponível"; exit 3; fi
existentes="$(docker ps -a --format '{{.Names}}' | grep -E '^deliveryos-' || true) $(docker volume ls -q | grep -E '^deliveryos-platform-' || true)"
if [ -n "${existentes// /}" ]; then echo "RECUSADO: já existe composição nesta máquina:"; echo "$existentes"; exit 2; fi

if ! docker image inspect "$IMAGEM" >/dev/null 2>&1; then echo "BLOQUEADO: imagem $IMAGEM ausente"; exit 3; fi
hash_local=$(node -e "process.stdout.write(require('./tools/carimbar_build.js').hashDasFontes().sha256)")
hash_imagem=$(docker run --rm --entrypoint cat "$IMAGEM" dist/build-stamp.json |
  node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>process.stdout.write(JSON.parse(s).fontes_sha256||''))")
if [ "$hash_local" != "$hash_imagem" ]; then
  echo "RECUSADO: a imagem é de outro código (imagem ${hash_imagem:0:12}, checkout ${hash_local:0:12}) — reconstrua"
  exit 3
fi
echo "imagem $IMAGEM · fontes ${hash_local:0:12} · commit $(git rev-parse --short HEAD)"

# O esperado vem do DIRETÓRIO de migrations deste checkout, nunca de lista
# escrita à mão: uma 0005 não pode quebrar esta medida sem que nada mude.
esperadas=$(ls src/platform/migrations/ | grep -E '^[0-9]{4}_.+\.sql$' | sort | sed 's/\.sql$//' | paste -sd, -)
exige TEM_A_0004 "$(printf '%s' "$esperadas" | tr ',' '\n' | grep -cx 0004_event_log_sem_truncate || true)" 1
exige MIGRATIONS_NA_IMAGEM "$(docker run --rm --entrypoint sh "$IMAGEM" -c 'ls dist/src/platform/migrations/' | grep -E '^[0-9]{4}_.+\.sql$' | sort | sed 's/\.sql$//' | paste -sd, -)" "$esperadas"

tmp=$(mktemp -d)
criou=0
aleatorio() { node -e "process.stdout.write(require('node:crypto').randomBytes($1).toString('hex'))"; }
printf 'POSTGRES_PASSWORD=%s\nDELIVERYOS_COMMIT=%s\nDELIVERYOS_DEVICE_TOKEN_SECRET=%s\nDELIVERYOS_SOURCE_MODE=control\n' \
  "$(aleatorio 12)" "$(git rev-parse HEAD)" "$(aleatorio 24)" >"$tmp/ao.env"
# Ambiente SANEADO: variável exportada no shell venceria o --env-file.
compose() { env -i PATH="$PATH" HOME="$HOME" docker compose -p "$PROJETO" -f deploy/compose.platform.yaml \
  ${AO_OVERRIDE:+-f "$AO_OVERRIDE"} --env-file "$tmp/ao.env" "$@"; }
limpar() { if [ "$criou" = 1 ]; then compose down -v >/dev/null 2>&1 || true; fi; rm -rf "$tmp"; }
trap limpar EXIT

# Só o banco e o job de migration: o que está em medida é o schema que o job
# OFICIAL deixa, não o comportamento dos runtimes (esse é do q017_compose_real).
criou=1
compose up -d --no-build deliveryos-migrate >"$tmp/up.txt" 2>&1
estado=""
for _ in $(seq 1 90); do
  estado=$(docker inspect -f '{{.State.Status}} {{.State.ExitCode}}' deliveryos-migrate 2>/dev/null || true)
  [ "${estado%% *}" = exited ] && break
  sleep 1
done
exige MIGRATE_JOB "$estado" "exited 0"
psql_() { docker exec deliveryos-postgres psql -U deliveryos -d deliveryos -Atc "$1" 2>&1; }
exige VERSOES "$(psql_ "SELECT string_agg(version, ',' ORDER BY version) FROM platform.schema_migration")" "$esperadas"

# Executando, nunca pelo catálogo. INSERT_ACEITO prova que o canal executa;
# LINHAS_DEPOIS é o controle das recusas: se qualquer uma tivesse passado
# calada, a contagem não seria mais 2.
psql_ "INSERT INTO platform.event_log (event_id, unit_id, object_type, object_id, event_type,
          payload, occurred_at, origin, idempotency_key, contract_version, source_mode)
       VALUES ('ao-c1', 'AO-C', 'trip', 't-ao-c', 'trip_created', '{}', now(), 'system', 'ao:c1', 'trip_created@1.0.0', 'control'),
              ('ao-c2', 'AO-C', 'trip', 't-ao-c', 'trip_created', '{}', now(), 'system', 'ao:c2', 'trip_created@1.0.0', 'control')" >/dev/null
exige INSERT_ACEITO "$(psql_ "SELECT count(*) FROM platform.event_log")" 2
exige UPDATE_RECUSADO "$(psql_ "UPDATE platform.event_log SET event_type='x'" | grep -c 'append-only: UPDATE nao e permitido' || true)" 1
exige DELETE_RECUSADO "$(psql_ "DELETE FROM platform.event_log" | grep -c 'append-only: DELETE nao e permitido' || true)" 1
exige TRUNCATE_RECUSADO "$(psql_ "TRUNCATE platform.event_log" | grep -c 'append-only: TRUNCATE nao e permitido' || true)" 1
exige LINHAS_DEPOIS "$(psql_ "SELECT count(*) FROM platform.event_log")" 2
# O limite declarado: o runtime conecta como o dono do schema, superusuário
# na imagem oficial do PostgreSQL — ele pode desligar a trava por DDL.
exige PAPEL_DO_RUNTIME "$(psql_ "SELECT rolname||' super='||rolsuper FROM pg_roles WHERE rolname = current_user")" "deliveryos super=true"

if [ "$falhas" -eq 0 ]; then echo "AO_COMPOSE_TRAVA_GREEN"; else echo "AO_COMPOSE_TRAVA_RED ($falhas)"; exit 1; fi
