#!/usr/bin/env bash
# Q-026 — matriz de cenários MVCC/VACUUM/concorrência, um processo por cenário.
# Somente teste. Exige DELIVERYOS_PG_URL de um PostgreSQL DESCARTÁVEL (nunca o
# operacional). Sem ele, sai 78 — nunca verde.
#
# Uso:
#   DELIVERYOS_PG_URL=postgres://<admin>@<host-descartavel>/postgres \
#   Q026_MVCC_MATRIZ="longa:controle:1:2 longa:canonico:1:2 longa:incremental:1:2" \
#   Q026_MVCC_SAIDA_DIR=resultados bash tests/product/run-q026-mvcc-matriz.sh
#
# Cada item é perfil:leitor:instancias:admissao. Os demais parâmetros vêm do
# ambiente (Q026_MVCC_DURACAO_S, Q026_MVCC_ESCALA, Q026_MVCC_PRAZO_MS...) e
# valem para todos os itens. Um cenário que falha não interrompe os outros: o
# código de saída final é 1 se QUALQUER um falhou, e todas as saídas ficam.
set -u
if [ -z "${DELIVERYOS_PG_URL:-}" ]; then
  echo "PULADO: DELIVERYOS_PG_URL ausente. Nenhum cenario MVCC rodou — isto nao e verde." >&2
  exit 78
fi
DIR="${Q026_MVCC_SAIDA_DIR:-q026-mvcc-resultados}"
mkdir -p "$DIR"
falhas=0
for item in ${Q026_MVCC_MATRIZ:?defina Q026_MVCC_MATRIZ}; do
  IFS=: read -r perfil leitor inst adm <<<"$item"
  nome="${perfil}-${leitor}-i${inst}-a${adm}"
  echo "=== $nome"
  Q026_MVCC_PERFIL="$perfil" Q026_MVCC_LEITOR="$leitor" Q026_MVCC_INSTANCIAS="$inst" Q026_MVCC_INFLIGHT="$adm" \
    Q026_MVCC_CLIENTES="$(( ${Q026_MVCC_CLIENTES_POR_INSTANCIA:-2} * inst ))" \
    Q026_MVCC_SAIDA="$DIR/$nome.json" \
    npx tsx tests/product/run-q026-mvcc-vacuum-concorrencia.ts >"$DIR/$nome.log" 2>&1
  c=$?
  grep -E '^  |^Q026_MVCC_RESULTADO' "$DIR/$nome.log" | sed 's/^/    /'
  echo "    exit=$c"
  [ "$c" -eq 0 ] || falhas=$((falhas + 1))
done
grep -h '^Q026_MVCC_RESULTADO' "$DIR"/*.log >"$DIR/resumo.txt" 2>/dev/null || true
echo "Q026_MVCC_MATRIZ_FIM falhas=$falhas"
[ "$falhas" -eq 0 ]
