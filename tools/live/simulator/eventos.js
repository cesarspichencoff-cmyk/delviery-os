/* ============================================================================
 * DeliveryOS · tools/live/simulator · CONSTRUTORES DE EVENTOS SINTÉTICOS
 * ----------------------------------------------------------------------------
 * Eventos VÁLIDOS no envelope do núcleo (Contrato §2-§4), 100% sintéticos:
 * identificadores SIM-*, itens da allowlist, nenhum campo de dado pessoal.
 * As chaves de idempotência usam os construtores oficiais de src/live —
 * o simulador alimenta o núcleo pela API pública, sem alterar o contrato.
 * ==========================================================================*/
"use strict";

const path = require("node:path");
const RAIZ = path.join(__dirname, "..", "..", "..");
const { chaveStatus, chaveCancelamento, chaveReimpressao } =
  require(path.join(RAIZ, "src", "live", "idempotencia.js"));
const { hashCanonicoItens, localDayKey } =
  require(path.join(RAIZ, "src", "live", "normalizar.js"));
const { OBSERVACOES_SINTETICAS, NOMES_ITENS_SINTETICOS } = require("./identificadores");

const QUALITY_SINTETICA = () => ({
  completeness: "complete",
  freshness: "atualizada",
  certainty: "observado",
  parsing_warnings: [],
  fields_missing: [],
  source_partial: false,
  manual_correction_possible: true,
  manual_correction_detected: null,
  digital_state_may_differ_from_paper: true
});

/** itens sintéticos escolhidos pelo PRNG — seed diferente, composição diferente */
function itensSinteticos(aleatorio) {
  const quantidadeDeItens = aleatorio.inteiro(1, 3);
  const itens = [];
  for (let i = 0; i < quantidadeDeItens; i++) {
    itens.push({
      nome: aleatorio.escolher(NOMES_ITENS_SINTETICOS),
      quantidade: aleatorio.inteiro(1, 3),
      observacao: aleatorio.escolher(OBSERVACOES_SINTETICAS)
    });
  }
  return itens;
}

function base(ctx, ts) {
  return {
    schema_version: "1.0",
    event_id: ctx.ids.proximoEvento(),
    source_event_id: null,
    occurred_at: ts,
    captured_at: ts,
    received_at: null,
    quality: QUALITY_SINTETICA()
  };
}

function eventoComanda(ctx, ts, pedido) {
  return {
    ...base(ctx, ts),
    event_type: "comanda_impressa",
    source: "sim_comanda",
    idempotency_key: `comanda:${pedido.interno}:${hashCanonicoItens(pedido.itens)}`,
    correlation: { ifood_short: pedido.ifood, pedido_interno: pedido.interno, print_job_id: pedido.job || null },
    payload: {
      pedido_interno: pedido.interno,
      sequencia: pedido.ifood,
      emissao: ts,
      itens: pedido.itens,
      origem: "simulacao"
    }
  };
}

function eventoStatus(ctx, ts, pedido, coluna) {
  return {
    ...base(ctx, ts),
    event_type: "status_ifood",
    source: "sim_status",
    occurred_at: null, // como na captura real: o Gestor não dá occurred_at
    idempotency_key: chaveStatus({
      source: "sim_status", ifood_short: pedido.ifood,
      dia: localDayKey(ts, ctx.tz), coluna
    }),
    correlation: { ifood_short: pedido.ifood, pedido_interno: null, print_job_id: null },
    payload: { coluna, tempo_decorrido_min: 0, atraso_min: 0 }
  };
}

function eventoCancelamento(ctx, ts, pedido) {
  return {
    ...base(ctx, ts),
    event_type: "pedido_cancelado",
    source: "sim_status",
    occurred_at: null,
    idempotency_key: chaveCancelamento({
      source: "sim_status", ifood_short: pedido.ifood, dia: localDayKey(ts, ctx.tz)
    }),
    correlation: { ifood_short: pedido.ifood, pedido_interno: null, print_job_id: null },
    payload: { visto_em: ts }
  };
}

function eventoReimpressao(ctx, ts, pedido) {
  return {
    ...base(ctx, ts),
    event_type: "pedido_reimpresso",
    source: "sim_comanda",
    idempotency_key: chaveReimpressao({ pedido_interno: pedido.interno, emissao_nova: ts }),
    correlation: { ifood_short: pedido.ifood, pedido_interno: pedido.interno, print_job_id: null },
    payload: {
      pedido_interno: pedido.interno,
      emissao_nova: ts,
      itens: pedido.itens,
      conteudo_identico: true
    }
  };
}

function eventoFonteDesconectada(ctx, ts, source) {
  return {
    ...base(ctx, ts),
    event_type: "fonte_desconectada",
    source,
    idempotency_key: `fonte_desconectada:${source}:${ctx.ids.proximoEvento()}`,
    correlation: {},
    payload: { source, motivo: "timeout" }
  };
}

/** evento propositalmente INVÁLIDO (sem schema_version) — só ids sintéticos */
function eventoInvalido(ctx, ts, pedido) {
  const ev = eventoComanda(ctx, ts, pedido);
  delete ev.schema_version;
  return ev;
}

module.exports = {
  itensSinteticos,
  eventoComanda,
  eventoStatus,
  eventoCancelamento,
  eventoReimpressao,
  eventoFonteDesconectada,
  eventoInvalido
};
