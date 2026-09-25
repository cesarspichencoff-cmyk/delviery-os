#!/usr/bin/env bash
# Certificação da Cadeia Real — os PAPÉIS MÍNIMOS na composição OFICIAL, em
# containers. Mede, executando:
#   - sem a senha de um papel, nada sobe;
#   - o job `deliveryos-papeis` aplica os papéis depois da migration, e os
#     papéis não são superusuário, não são donos, não herdam de ninguém;
#   - o crítico e o assíncrono CONECTAM DE FATO com os próprios papéis
#     (pg_stat_activity, pelo endereço de cada container);
#   - a cadeia de campo passa por eles: sessão do aparelho (vínculo +
#     auditoria), lote de GPS, outbox drenada, replay depois de reinício;
#   - a sabotagem é recusada com a credencial DO PRÓPRIO RUNTIME, de dentro do
#     container dele: desligar trigger, apagar/truncar fato, revogar ou
#     cadastrar aparelho, criar tabela, virar superusuário, modo réplica;
#   - a senha administrativa não chega ao runtime, e nenhuma senha vai a log;
#   - subir de novo reaplica os papéis sem erro (idempotência).
# Termina com PAPEIS_COMPOSE_REAL_GREEN ou _RED.
#
# PATRIMÔNIO INALCANÇÁVEL, mesmo contrato de tools/q017_compose_real.sh: a
# composição usa nomes FIXOS e este script faz `down -v` no fim, então ele
# RECUSA rodar (exit 2) se já existir container `deliveryos-*` ou volume
# `deliveryos-platform-*`. Só opera onde não há composição, cria a sua e
# destrói só a sua.
#
# Pré-requisitos: daemon Docker, a imagem `deliveryos-platform:v1` construída
# DESTE checkout e `postgres:16-bookworm` (exit 3 sem eles). Em sandbox sem
# repositório Debian, construa no estágio `build` e passe
# PAPEIS_OVERRIDE=deploy/compose.sandbox.override.yaml
set -euo pipefail
cd "$(dirname "$0")/.."

IMAGEM=deliveryos-platform:v1
PROJETO=deliveryos-platform
falhas=0
medidas=0
exige() {
  medidas=$((medidas + 1))
  if [ "$2" = "$3" ]; then echo "  ok  $1 = $2"; else echo "  XX  $1: veio '$2', esperado '$3'"; falhas=$((falhas + 1)); fi
}

if ! docker info >/dev/null 2>&1; then echo "BLOQUEADO: daemon Docker indisponível"; exit 3; fi
existentes="$(docker ps -a --format '{{.Names}}' | grep -E '^deliveryos-' || true) $(docker volume ls -q | grep -E '^deliveryos-platform-' || true)"
if [ -n "${existentes// /}" ]; then echo "RECUSADO: já existe composição nesta máquina:"; echo "$existentes"; exit 2; fi
for img in "$IMAGEM" postgres:16-bookworm; do
  if ! docker image inspect "$img" >/dev/null 2>&1; then echo "BLOQUEADO: imagem $img ausente"; exit 3; fi
done
hash_local=$(node -e "process.stdout.write(require('./tools/carimbar_build.js').hashDasFontes().sha256)")
hash_imagem=$(docker run --rm --entrypoint cat "$IMAGEM" dist/build-stamp.json |
  node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>process.stdout.write(JSON.parse(s).fontes_sha256||''))")
if [ "$hash_local" != "$hash_imagem" ]; then
  echo "RECUSADO: a imagem é de outro código (imagem ${hash_imagem:0:12}, checkout ${hash_local:0:12}) — reconstrua"
  exit 3
fi
echo "imagem $IMAGEM · fontes ${hash_local:0:12} · commit $(git rev-parse --short HEAD)"

tmp=$(mktemp -d)
criou=0
aleatorio() { node -e "process.stdout.write(require('node:crypto').randomBytes($1).toString('hex'))"; }
SENHA_ADMIN=$(aleatorio 16)
SENHA_CRITICO=$(aleatorio 16)
SENHA_ASSINCRONO=$(aleatorio 16)
base() {
  printf 'POSTGRES_PASSWORD=%s\nDELIVERYOS_COMMIT=%s\nDELIVERYOS_DEVICE_TOKEN_SECRET=%s\nDELIVERYOS_SOURCE_MODE=control\n' \
    "$SENHA_ADMIN" "$(git rev-parse HEAD)" "$(aleatorio 24)"
}
{ base; printf 'DELIVERYOS_CRITICAL_DB_PASSWORD=%s\nDELIVERYOS_ASYNC_DB_PASSWORD=%s\n' "$SENHA_CRITICO" "$SENHA_ASSINCRONO"; } >"$tmp/papeis.env"
{ base; printf 'DELIVERYOS_ASYNC_DB_PASSWORD=%s\n' "$SENHA_ASSINCRONO"; } >"$tmp/sem_critico.env"

# Ambiente SANEADO: variável exportada no shell venceria o --env-file.
compose() {
  local arquivo="$1"
  shift
  env -i PATH="$PATH" HOME="$HOME" docker compose -p "$PROJETO" -f deploy/compose.platform.yaml \
    ${PAPEIS_OVERRIDE:+-f "$PAPEIS_OVERRIDE"} --env-file "$arquivo" "$@"
}
limpar() { if [ "$criou" = 1 ]; then compose "$tmp/papeis.env" down -v >/dev/null 2>&1 || true; fi; rm -rf "$tmp"; }
trap limpar EXIT

# O administrador, pelo socket de dentro do container do banco — o ato humano.
psql_() { docker exec deliveryos-postgres psql -U deliveryos -d deliveryos -Atc "$1" 2>&1; }
estado() { docker inspect -f '{{.State.Status}} {{.State.ExitCode}}' "$1" 2>/dev/null || echo ausente; }
ip() { docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "$1"; }

# Roda SQL com a credencial que o RUNTIME tem — a URL do ambiente do próprio
# container, que este script nunca lê. Uma linha por comando: OK ou o SQLSTATE
# e a mensagem da recusa.
cat >"$tmp/como_runtime.js" <<'JS'
const { Client } = require("pg");
const comandos = JSON.parse(process.argv[2]);
(async () => {
  const c = new Client({ connectionString: process.env.DELIVERYOS_DATABASE_URL, ssl: false });
  await c.connect();
  for (const sql of comandos) {
    try { await c.query(sql); console.log("OK"); }
    catch (e) { console.log(`RECUSADO ${e.code} ${String(e.message).split(" ").slice(0, 3).join(" ")}`); }
  }
  await c.end();
})().catch((e) => { console.log(`FALHOU ${e.message}`); process.exit(1); });
JS
como() { # como <container> <sql> — imprime a linha do resultado
  docker exec -i "$1" node - "$(node -e 'process.stdout.write(JSON.stringify([process.argv[1]]))' "$2")" <"$tmp/como_runtime.js"
}

# A cadeia de campo pelo caminho HTTP real, DE DENTRO do crítico: sessão por
# vínculo de segredo, e o lote com o token que a sessão devolveu.
cat >"$tmp/sessao.js" <<'JS'
const [aparelho] = process.argv.slice(2);
const base = "http://127.0.0.1:8080";
const segredo = require("node:crypto").randomBytes(16).toString("hex");
(async () => {
  const s = await fetch(`${base}/api/device/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ device_id: aparelho, device_secret: segredo, app_version: "papeis-compose" }),
  });
  const sc = await s.json().catch(() => ({}));
  const ponto = {
    point_id: `p-${aparelho}-1`, idempotency_key: `gps:${aparelho}:t-papeis:1`, trip_id: "t-papeis",
    device_id: aparelho, latitude: -23.55, longitude: -46.63, accuracy_m: 12,
    occurred_at: new Date().toISOString(), sequence_local: 1, provider: "fused", is_mock: false,
  };
  const g = await fetch(`${base}/api/gps/batch`, {
    method: "POST",
    headers: { Authorization: `Bearer ${sc.device_token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ device_id: aparelho, correlation_id: `papeis-${aparelho}`, points: [ponto] }),
  });
  const gc = await g.json().catch(() => ({}));
  console.log(`SESSAO=${s.status} vinculado=${sc.vinculado_agora} GPS=${g.status} classe=${gc.classe}`);
})().catch((e) => { console.log(`FALHOU ${e.message}`); process.exit(1); });
JS

# ------------------------------------------- N. sem a senha de um papel
echo "N. SEM A SENHA DO PAPEL DO CRITICO, A COMPOSICAO NAO SOBE"
if compose "$tmp/sem_critico.env" up -d --no-build >"$tmp/n.txt" 2>&1; then n=subiu; criou=1; else n=recusado; fi
exige N_UP_SEM_SENHA "$n" recusado
exige N_MOTIVO "$(grep -c 'required variable DELIVERYOS_CRITICAL_DB_PASSWORD is missing a value' "$tmp/n.txt" || true)" 1
exige N_CONTAINERS_CRIADOS "$(docker ps -a --format '{{.Names}}' | grep -cE '^deliveryos-' || true)" 0

# ------------------------------------------- S. a composição sobe
echo "S. A COMPOSICAO SOBE COM OS PAPEIS"
criou=1
compose "$tmp/papeis.env" up -d --no-build >"$tmp/up.txt" 2>&1
st=""
for _ in $(seq 1 60); do
  st=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{end}}' deliveryos-critical 2>/dev/null || true)
  [ "$st" = healthy ] && break
  sleep 2
done
exige S_CRITICO "$st" healthy
exige S_MIGRATE "$(estado deliveryos-migrate)" "exited 0"
exige S_PAPEIS "$(estado deliveryos-papeis)" "exited 0"
exige S_ASSINCRONO "$(estado deliveryos-async)" "running 0"

# ------------------------------------------- A. os papéis
echo "A. OS PAPEIS NO BANCO"
exige A_ATRIBUTOS "$(psql_ "SELECT string_agg(rolname||' super='||rolsuper||' createrole='||rolcreaterole||' createdb='||rolcreatedb||' bypassrls='||rolbypassrls||' login='||rolcanlogin, ',' ORDER BY rolname) FROM pg_roles WHERE rolname IN ('deliveryos_critical','deliveryos_async')")" \
  "deliveryos_async super=false createrole=false createdb=false bypassrls=false login=true,deliveryos_critical super=false createrole=false createdb=false bypassrls=false login=true"
exige A_DONO_DO_EVENT_LOG "$(psql_ "SELECT tableowner FROM pg_tables WHERE schemaname = 'platform' AND tablename = 'event_log'")" deliveryos
exige A_RUNTIME_DONO_DE_NADA "$(psql_ "SELECT count(*) FROM pg_class c JOIN pg_roles r ON r.oid = c.relowner WHERE r.rolname IN ('deliveryos_critical','deliveryos_async')")" 0
exige A_RUNTIME_HERDA_DE_NINGUEM "$(psql_ "SELECT count(*) FROM pg_auth_members m JOIN pg_roles r ON r.oid = m.member WHERE r.rolname IN ('deliveryos_critical','deliveryos_async')")" 0

# ------------------------------------------- C. quem os runtimes SÃO no banco
echo "C. COM QUAL PAPEL CADA RUNTIME CONECTOU DE FATO"
quem() { # usename das conexões vindas do container $1; o crítico só conecta sob demanda
  local r=""
  for _ in $(seq 1 20); do
    docker exec deliveryos-critical node -e "fetch('http://127.0.0.1:8080/ready').catch(()=>{})" >/dev/null 2>&1 || true
    r=$(psql_ "SELECT coalesce(string_agg(DISTINCT usename, ','), '') FROM pg_stat_activity WHERE client_addr = '$(ip "$1")'")
    [ -n "$r" ] && break
    sleep 1
  done
  echo "$r"
}
exige C_CRITICO_CONECTA_COMO "$(quem deliveryos-critical)" deliveryos_critical
exige C_ASSINCRONO_CONECTA_COMO "$(quem deliveryos-async)" deliveryos_async

# ------------------------------------------- F. a cadeia com os papéis
echo "F. A CADEIA DE CAMPO PASSA PELOS PAPEIS"
psql_ "INSERT INTO identity.unit(unit_id,display_name) VALUES('PAP','Papeis');
       INSERT INTO identity.actor(actor_id,unit_id,role,label) VALUES('a-papeis','PAP','motoboy_interno','Papeis');
       INSERT INTO identity.device(device_id,unit_id,actor_id,label) VALUES('dev-papeis','PAP','a-papeis','Papeis');" >/dev/null
exige F_SESSAO_E_LOTE "$(docker exec -i deliveryos-critical node - dev-papeis <"$tmp/sessao.js")" "SESSAO=200 vinculado=true GPS=200 classe=aceito"
exige F_VINCULO_GRAVADO "$(psql_ "SELECT (secret_hash IS NOT NULL AND last_session_at IS NOT NULL)::text FROM identity.device WHERE device_id = 'dev-papeis'")" true
exige F_AUDITORIA "$(psql_ "SELECT count(*) FROM platform.audit WHERE object_id = 'dev-papeis' AND action = 'device_session_issued'")" 1
exige F_FATO "$(psql_ "SELECT count(*)||' '||string_agg(source_mode, ',') FROM platform.event_log WHERE device_id = 'dev-papeis'")" "1 control"
pend=-1
for _ in $(seq 1 30); do
  pend=$(psql_ "SELECT count(*) FROM platform.outbox WHERE state <> 'done'")
  [ "$pend" = 0 ] && break
  sleep 1
done
exige F_OUTBOX_DRENADA "$pend" 0
docker restart deliveryos-async >/dev/null
replay=""
for _ in $(seq 1 60); do
  replay=$(docker logs deliveryos-async 2>&1 | grep '^\[assincrono\] replay {' | sed -n '2p' || true)
  [ -n "$replay" ] && break
  sleep 1
done
exige F_REPLAY_DEPOIS_DE_REINICIO "$(printf '%s' "$replay" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{const r=JSON.parse(s.slice(s.indexOf('{')));process.stdout.write(r.estado+' aplicados='+r.aplicados)}catch{process.stdout.write('sem-replay')}})")" "completo aplicados=1"
exige F_ASSINCRONO_RECONECTA_COMO "$(quem deliveryos-async)" deliveryos_async

# ------------------------------------------- X. sabotagem com a credencial do runtime
echo "X. A SABOTAGEM E RECUSADA COM A CREDENCIAL DO PROPRIO RUNTIME"
exige X_CRITICO_CONTROLE_LE_O_LOG "$(como deliveryos-critical "SELECT count(*) FROM platform.event_log")" OK
exige X_CRITICO_DESLIGA_TRAVA "$(como deliveryos-critical "ALTER TABLE platform.event_log DISABLE TRIGGER ALL")" "RECUSADO 42501 must be owner"
exige X_CRITICO_DERRUBA_TRAVA "$(como deliveryos-critical "DROP TRIGGER event_log_sem_update ON platform.event_log")" "RECUSADO 42501 must be owner"
exige X_CRITICO_MODO_REPLICA "$(como deliveryos-critical "SET session_replication_role = replica")" "RECUSADO 42501 permission denied to"
exige X_CRITICO_APAGA_FATO "$(como deliveryos-critical "DELETE FROM platform.event_log")" "RECUSADO 42501 permission denied for"
exige X_CRITICO_TRUNCA "$(como deliveryos-critical "TRUNCATE platform.event_log")" "RECUSADO 42501 permission denied for"
exige X_CRITICO_REVOGA "$(como deliveryos-critical "UPDATE identity.device SET revoked_at = now()")" "RECUSADO 42501 permission denied for"
exige X_CRITICO_CADASTRA "$(como deliveryos-critical "INSERT INTO identity.device(device_id, unit_id, label) VALUES ('dev-intruso', 'PAP', 'x')")" "RECUSADO 42501 permission denied for"
exige X_CRITICO_CRIA_TABELA "$(como deliveryos-critical "CREATE TABLE platform.intrusa (x int)")" "RECUSADO 42501 permission denied for"
exige X_CRITICO_VIRA_SUPERUSUARIO "$(como deliveryos-critical "ALTER ROLE deliveryos_critical SUPERUSER")" "RECUSADO 42501 permission denied to"
exige X_ASSINCRONO_CONTROLE_LE_O_LOG "$(como deliveryos-async "SELECT count(*) FROM platform.event_log")" OK
exige X_ASSINCRONO_DESLIGA_TRAVA "$(como deliveryos-async "ALTER TABLE platform.event_log DISABLE TRIGGER ALL")" "RECUSADO 42501 must be owner"
exige X_ASSINCRONO_GRAVA_FATO "$(como deliveryos-async "INSERT INTO platform.event_log(event_id) VALUES ('x')")" "RECUSADO 42501 permission denied for"
exige X_ASSINCRONO_LE_APARELHO "$(como deliveryos-async "SELECT count(*) FROM identity.device")" "RECUSADO 42501 permission denied for"
# O esperado vem das migrations deste checkout, nunca de número escrito à mão.
travas=$(grep -h -A1 'CREATE TRIGGER' src/platform/migrations/*.sql | grep -c 'ON platform.event_log' || true)
exige X_TRAVA_INTACTA "$(psql_ "SELECT count(*) FROM pg_trigger WHERE tgrelid = 'platform.event_log'::regclass AND tgenabled = 'O' AND NOT tgisinternal")" "$travas"
exige X_LINHAS_DO_LOG "$(psql_ "SELECT count(*) FROM platform.event_log")" 1

# ------------------------------------------- K. senhas
echo "K. A SENHA ADMINISTRATIVA NAO CHEGA AO RUNTIME; NENHUMA SENHA VAI A LOG"
envde() { docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$1"; }
exige K_ADMIN_NA_MIGRATION_CONTROLE "$(envde deliveryos-migrate | grep -c "$SENHA_ADMIN" || true)" 1
exige K_ADMIN_NO_CRITICO "$(envde deliveryos-critical | grep -c "$SENHA_ADMIN" || true)" 0
exige K_ADMIN_NO_ASSINCRONO "$(envde deliveryos-async | grep -c "$SENHA_ADMIN" || true)" 0
exige K_ADMIN_NO_PROCESSO_DO_CRITICO "$(docker exec deliveryos-critical sh -c 'cat /proc/1/environ | tr "\0" "\n"' | grep -c "$SENHA_ADMIN" || true)" 0
logs_todos=$(for s in deliveryos-postgres deliveryos-migrate deliveryos-papeis deliveryos-critical deliveryos-async; do docker logs "$s" 2>&1; done)
exige K_SENHAS_EM_LOG "$(printf '%s' "$logs_todos" | grep -cE "$SENHA_ADMIN|$SENHA_CRITICO|$SENHA_ASSINCRONO" || true)" 0

# ------------------------------------------- I. subir de novo
echo "I. SUBIR DE NOVO REAPLICA OS PAPEIS SEM ERRO"
antes=$(docker inspect -f '{{.State.StartedAt}}' deliveryos-papeis)
compose "$tmp/papeis.env" up -d --no-build >"$tmp/up2.txt" 2>&1
for _ in $(seq 1 30); do
  [ "$(docker inspect -f '{{.State.StartedAt}}' deliveryos-papeis)" != "$antes" ] && [ "$(estado deliveryos-papeis)" = "exited 0" ] && break
  sleep 1
done
exige I_PAPEIS_RODOU_DE_NOVO "$([ "$(docker inspect -f '{{.State.StartedAt}}' deliveryos-papeis)" != "$antes" ] && echo sim || echo nao)" sim
exige I_PAPEIS_DE_NOVO "$(estado deliveryos-papeis)" "exited 0"
exige I_PAPEIS_CONTINUAM_DOIS "$(psql_ "SELECT count(*) FROM pg_roles WHERE rolname IN ('deliveryos_critical','deliveryos_async')")" 2

echo
if [ "$falhas" -eq 0 ]; then echo "$medidas medidas · PAPEIS_COMPOSE_REAL_GREEN"; else echo "$medidas medidas · PAPEIS_COMPOSE_REAL_RED ($falhas)"; exit 1; fi
