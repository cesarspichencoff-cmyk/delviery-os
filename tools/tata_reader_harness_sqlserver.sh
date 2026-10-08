#!/usr/bin/env bash
# SQL Server 2022 Developer DESCARTAVEL para o harness do TATA Comanda Reader.
#
#   tools/tata_reader_harness_sqlserver.sh start   # sobe e espera aceitar conexao
#   tools/tata_reader_harness_sqlserver.sh stop    # remove o container
#
# Imagem fixada por digest (a mesma da prova de 2026-10-07). Edicao Developer:
# licenca gratuita de desenvolvimento/teste, sem custo. Escuta so em 127.0.0.1.
# Banco e dados sao SINTETICOS (tests/tata-reader/harness/sqlserver_fixture.ps1).
# Depois de subir:
#   export TATA_HARNESS_SQLSERVER="127.0.0.1,14333"
#   export TATA_HARNESS_SA_PASSWORD="$TATA_HARNESS_SA_PASSWORD"   # a que voce passou
#   npm run test:tata-reader:sqlserver
set -euo pipefail
IMAGE="mcr.microsoft.com/mssql/server@sha256:4402d880dd4c34bfa7d8705e56a86cd6c88da80a1f6bbbe741f999e76264a090"
NAME="${TATA_HARNESS_CONTAINER:-tata-reader-harness-mssql}"
PORT="${TATA_HARNESS_PORT:-14333}"
case "${1:-}" in
  start)
    : "${TATA_HARNESS_SA_PASSWORD:?defina TATA_HARNESS_SA_PASSWORD (forte: maiuscula, minuscula, numero, simbolo)}"
    if docker ps -a --format '{{.Names}}' | grep -qx "$NAME"; then
      echo "container $NAME ja existe — use stop antes" >&2; exit 1
    fi
    docker run -d --name "$NAME" -e ACCEPT_EULA=Y -e MSSQL_PID=Developer \
      -e "MSSQL_SA_PASSWORD=$TATA_HARNESS_SA_PASSWORD" -e MSSQL_MEMORY_LIMIT_MB=2048 \
      -p "127.0.0.1:${PORT}:1433" "$IMAGE" >/dev/null
    for _ in $(seq 1 60); do
      if docker logs "$NAME" 2>&1 | grep -q "ready for client connections"; then
        echo "SQLSERVER_READY 127.0.0.1,${PORT}"; exit 0
      fi
      sleep 2
    done
    echo "SQL Server nao ficou pronto em 120 s" >&2; docker logs "$NAME" 2>&1 | tail -20 >&2; exit 1
    ;;
  stop)
    docker rm -f "$NAME" >/dev/null 2>&1 || true
    echo "SQLSERVER_REMOVED $NAME"
    ;;
  *)
    echo "uso: $0 start|stop" >&2; exit 64
    ;;
esac
