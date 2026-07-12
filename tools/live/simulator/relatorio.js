/* ============================================================================
 * DeliveryOS · tools/live/simulator · RELATÓRIO TÉCNICO E HASH CANÔNICO
 * ----------------------------------------------------------------------------
 * Resultado estruturado e compacto de uma execução + hash canônico de
 * determinismo. O hash NUNCA depende de: caminho temporário, horário real da
 * máquina, ordem de chaves de objetos, duração real da execução — esses
 * campos ficam FORA do material de hash.
 * ==========================================================================*/
"use strict";

const crypto = require("node:crypto");

function ordenarChaves(v) {
  if (v === null || typeof v !== "object") return v;
  if (Array.isArray(v)) return v.map(ordenarChaves);
  const saida = {};
  for (const k of Object.keys(v).sort()) saida[k] = ordenarChaves(v[k]);
  return saida;
}

const stringifyCanonico = (v) => JSON.stringify(ordenarChaves(v));
const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");

/** hash canônico do snapshot completo (todo ele é tempo simulado) */
function hashSnapshot(snapshot) {
  return sha256(stringifyCanonico(snapshot));
}

// campos VOLÁTEIS do relatório — nunca entram no hash de determinismo
// (hash_resultado também fica fora para o cálculo ser re-executável)
const CAMPOS_VOLATEIS_RELATORIO = Object.freeze(["duracao_execucao_ms", "runtime_root", "hash_resultado"]);

function hashRelatorio(relatorio) {
  const material = {};
  for (const k of Object.keys(relatorio)) {
    if (!CAMPOS_VOLATEIS_RELATORIO.includes(k)) material[k] = relatorio[k];
  }
  return sha256(stringifyCanonico(material));
}

function contarPorMatchState(snapshot) {
  const contagem = { matched: 0, partial: 0, unmatched: 0, conflict: 0 };
  const listas = [snapshot.pedidos.completos, snapshot.pedidos.parciais, snapshot.pedidos.conflitos];
  for (const lista of listas) {
    for (const p of lista) contagem[p.match_state] += 1;
  }
  return contagem;
}

/**
 * Monta o relatório compacto de uma execução de cenário.
 * Sem dados brutos desnecessários: contagens, estados e hashes.
 */
function montarRelatorio({
  scenarioId, seed, storeTimeZone, inicioSimulado, fimSimulado,
  eventosGerados, snapshot, linhasLogAceito, replay, duracaoExecucaoMs, runtimeRoot
}) {
  const porMatch = contarPorMatchState(snapshot);
  const freshnessPorFonte = {};
  for (const nome of Object.keys(snapshot.fontes)) {
    freshnessPorFonte[nome] = snapshot.fontes[nome].freshness_state;
  }

  const relatorio = {
    scenario_id: scenarioId,
    seed: String(seed),
    store_time_zone: storeTimeZone,
    inicio_simulado: inicioSimulado,
    fim_simulado: fimSimulado,
    eventos_gerados: eventosGerados,
    eventos_aceitos: snapshot.recepcao.aceitos,
    duplicados: snapshot.recepcao.duplicados_event_id,
    observacoes_repetidas: snapshot.recepcao.observacoes_repetidas,
    quarentena: { total: snapshot.quarentena.total, por_motivo: snapshot.quarentena.por_motivo },
    linhas_log_aceito: linhasLogAceito,
    pedidos: {
      matched: porMatch.matched,
      partial: porMatch.partial,
      unmatched: porMatch.unmatched,
      conflict: porMatch.conflict,
      cancelados: snapshot.pedidos.cancelados.length
    },
    freshness_por_fonte: freshnessPorFonte,
    gate_staleness: {
      permitir_acao_dominante: snapshot.gate_staleness.permitir_acao_dominante,
      motivo: snapshot.gate_staleness.motivo
    },
    replay: replay || { executado: false },
    snapshot_hash: hashSnapshot(snapshot),
    // voláteis — fora do hash de determinismo:
    duracao_execucao_ms: duracaoExecucaoMs,
    runtime_root: runtimeRoot
  };
  relatorio.hash_resultado = hashRelatorio(relatorio);
  return relatorio;
}

module.exports = {
  montarRelatorio, hashRelatorio, hashSnapshot, stringifyCanonico, CAMPOS_VOLATEIS_RELATORIO
};
