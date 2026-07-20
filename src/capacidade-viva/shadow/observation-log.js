/* ============================================================================
 * Registro de observação da Capacidade Viva human-v2 — modo sombra (§4/§5/§9).
 * ----------------------------------------------------------------------------
 * Grava SOMENTE o que o adapter já produziu (nunca inventa campo). Controla
 * ruído (§5): registra apenas em mudança de estado, regra dominante, saúde
 * da fonte, exceção de qualidade da fonte aparecendo/resolvendo, confiança,
 * ou heartbeat técnico configurável — nunca um tick idêntico ao anterior.
 *
 * Canal de falha técnica (§9) é SEPARADO do canal de observação operacional
 * — uma falha do motor sombra nunca vira pressão/alerta operacional, só
 * registro técnico.
 *
 * Nunca lança. Escrita em disco é best-effort (falha de I/O não derruba o
 * Copiloto nem interrompe o registro em memória).
 * ==========================================================================*/
"use strict";

const fs = require("fs");
const path = require("path");

const LOG_PATH = path.join(
  __dirname, "..", "..", "..",
  "data", "capacidade-viva", "shadow", "observacoes.runtime.jsonl"
);
const FAILURE_LOG_PATH = path.join(
  __dirname, "..", "..", "..",
  "data", "capacidade-viva", "shadow", "falhas.runtime.jsonl"
);

const DEFAULT_HEARTBEAT_MINUTES = 15;

/**
 * Decide se `next` deve ser registrado em relação a `prev` (última observação
 * efetivamente registrada — não a última calculada). Pura, sem I/O.
 */
function shouldRegister(prev, next, opts) {
  const heartbeatMinutes =
    (opts && opts.heartbeatMinutes != null) ? opts.heartbeatMinutes : DEFAULT_HEARTBEAT_MINUTES;

  if (!prev) return { register: true, reason: "primeira_observacao" };

  if (prev.estado !== next.estado) return { register: true, reason: "mudanca_de_estado" };
  if (prev.regra_acionada !== next.regra_acionada) return { register: true, reason: "mudanca_de_regra_dominante" };
  if (prev.saude_da_fonte !== next.saude_da_fonte) return { register: true, reason: "mudanca_saude_da_fonte" };
  if (!!prev.excluido_por_qualidade_da_fonte !== !!next.excluido_por_qualidade_da_fonte) {
    return { register: true, reason: "excecao_qualidade_fonte_aparece_ou_resolve" };
  }
  if ((prev.pedidos_excluidos_por_fonte || 0) !== (next.pedidos_excluidos_por_fonte || 0)) {
    return { register: true, reason: "contagem_exclusao_fonte_muda" };
  }
  if (prev.confianca !== next.confianca) return { register: true, reason: "mudanca_de_confianca" };

  const prevT = Date.parse(prev.timestamp);
  const nextT = Date.parse(next.timestamp);
  if (Number.isFinite(prevT) && Number.isFinite(nextT)) {
    const elapsedMin = (nextT - prevT) / 60000;
    if (elapsedMin >= heartbeatMinutes) return { register: true, reason: "heartbeat_tecnico" };
  }

  return { register: false, reason: "tick_equivalente_deduplicado" };
}

function appendJsonlSafe(filePath, record) {
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.appendFileSync(filePath, JSON.stringify(record) + "\n");
    return true;
  } catch (e) {
    return false; // falha segura — I/O nunca derruba o Copiloto
  }
}

/**
 * Fábrica de um log de observação sombra. Cada instância mantém seu próprio
 * estado (última observação registrada) — sem singleton global, para não
 * vazar estado entre testes nem entre servidores.
 */
function createObservationLog(opts) {
  const options = opts || {};
  const logPath = options.logPath || LOG_PATH;
  const failurePath = options.failurePath || FAILURE_LOG_PATH;
  const heartbeatMinutes =
    options.heartbeatMinutes != null ? options.heartbeatMinutes : DEFAULT_HEARTBEAT_MINUTES;
  const persist = options.persist !== false;

  let last = null;
  const entries = [];
  const failures = [];

  /** Registra uma shadow_observation (produzida pelo adapter). Nunca lança. */
  function register(observation) {
    try {
      if (!observation || typeof observation !== "object") {
        return { register: false, reason: "observacao_invalida" };
      }
      const decision = shouldRegister(last, observation, { heartbeatMinutes });
      if (decision.register) {
        const record = Object.assign({}, observation, { log_reason: decision.reason });
        entries.push(record);
        if (persist) appendJsonlSafe(logPath, record);
        last = observation;
      }
      return decision;
    } catch (e) {
      return { register: false, reason: "falha_interna_log", detail: String((e && e.message) || e) };
    }
  }

  /** Canal técnico separado (§9) — nunca vira pressão operacional. */
  function registerFailure(reason, detail, extra) {
    try {
      const record = Object.assign(
        {
          kind: "shadow_failure",
          timestamp: new Date().toISOString(),
          reason: reason || "falha_desconhecida",
          detail: detail != null ? String(detail) : null,
          automatic_decisions_allowed: false,
          shadow_only: true
        },
        extra || {}
      );
      failures.push(record);
      if (persist) appendJsonlSafe(failurePath, record);
      return record;
    } catch (e) {
      return { kind: "shadow_failure", reason: "falha_ao_registrar_falha", detail: String((e && e.message) || e) };
    }
  }

  return {
    register,
    registerFailure,
    getEntries: () => entries.slice(),
    getFailures: () => failures.slice(),
    getLast: () => last
  };
}

module.exports = {
  createObservationLog,
  shouldRegister,
  DEFAULT_HEARTBEAT_MINUTES,
  LOG_PATH,
  FAILURE_LOG_PATH
};
