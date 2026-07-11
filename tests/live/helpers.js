/* ============================================================================
 * DeliveryOS · tests/live · HELPERS
 * ----------------------------------------------------------------------------
 * Fábricas de eventos VÁLIDOS no contrato (Addendum §5) para os testes.
 * TODOS os dados aqui são FICTÍCIOS — nenhum pedido real, nenhum dado pessoal.
 * Relógio sempre fixo/injetado: teste nunca depende de Date.now().
 * ==========================================================================*/
"use strict";

let seq = 0;
const proximoEventId = (prefixo) => `${prefixo || "evt"}-${String(++seq).padStart(4, "0")}`;

/** relógio fixo em ms a partir de um ISO */
const relogioFixo = (iso) => () => Date.parse(iso);

const QUALITY_OK = () => ({
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

function eventoComanda(o) {
  const opts = o || {};
  const pedidoInterno = opts.pedido_interno || "0000170512";
  const itens = opts.itens || [
    { nome: "Uramaki Ficticio Especial", quantidade: 1, observacao: null },
    { nome: "Combinado Exemplo", quantidade: 1, observacao: "sem exemplo" }
  ];
  return {
    schema_version: opts.schema_version !== undefined ? opts.schema_version : "1.0",
    event_id: opts.event_id || proximoEventId("com"),
    event_type: "comanda_impressa",
    source: opts.source || "sim_comanda",
    source_event_id: opts.source_event_id || null,
    idempotency_key: opts.idempotency_key || `comanda:${pedidoInterno}:${opts.hash || "hash-a"}`,
    occurred_at: opts.occurred_at !== undefined ? opts.occurred_at : "2026-07-11T19:00:00.000Z",
    captured_at: opts.captured_at || "2026-07-11T19:00:05.000Z",
    received_at: opts.received_at || null,
    correlation: {
      ifood_short: opts.ifood_short !== undefined ? opts.ifood_short : "0724",
      pedido_interno: pedidoInterno,
      print_job_id: opts.print_job_id || null
    },
    payload: {
      pedido_interno: pedidoInterno,
      sequencia: opts.sequencia || "0724",
      emissao: opts.emissao || "2026-07-11T19:00:00.000Z",
      itens,
      origem: "ifood"
    },
    quality: opts.quality !== undefined ? opts.quality : QUALITY_OK()
  };
}

function eventoStatus(o) {
  const opts = o || {};
  const short = opts.ifood_short !== undefined ? opts.ifood_short : "0724";
  const dia = opts.dia || "2026-07-11";
  const coluna = opts.coluna || "em_preparo";
  return {
    schema_version: opts.schema_version !== undefined ? opts.schema_version : "1.0",
    event_id: opts.event_id || proximoEventId("sta"),
    event_type: opts.event_type || "status_ifood",
    source: opts.source || "sim_status",
    source_event_id: opts.source_event_id || null,
    idempotency_key: opts.idempotency_key || `status:sim_status:${short}:${dia}:${coluna}`,
    occurred_at: opts.occurred_at !== undefined ? opts.occurred_at : null,
    captured_at: opts.captured_at || "2026-07-11T19:01:00.000Z",
    received_at: opts.received_at || null,
    correlation: { ifood_short: short, pedido_interno: null, print_job_id: null },
    payload: {
      coluna,
      tempo_decorrido_min: opts.tempo_decorrido_min !== undefined ? opts.tempo_decorrido_min : 5,
      atraso_min: opts.atraso_min !== undefined ? opts.atraso_min : 0
    },
    quality: opts.quality !== undefined ? opts.quality : QUALITY_OK()
  };
}

function eventoCancelamento(o) {
  const opts = o || {};
  const short = opts.ifood_short !== undefined ? opts.ifood_short : "0724";
  const dia = opts.dia || "2026-07-11";
  return {
    schema_version: "1.0",
    event_id: opts.event_id || proximoEventId("can"),
    event_type: "pedido_cancelado",
    source: opts.source || "sim_status",
    source_event_id: null,
    idempotency_key: opts.idempotency_key || `cancel:sim_status:${short}:${dia}`,
    occurred_at: opts.occurred_at !== undefined ? opts.occurred_at : null,
    captured_at: opts.captured_at || "2026-07-11T19:02:00.000Z",
    received_at: null,
    correlation: { ifood_short: short, pedido_interno: null, print_job_id: null },
    payload: { visto_em: opts.visto_em || opts.captured_at || "2026-07-11T19:02:00.000Z" },
    quality: QUALITY_OK()
  };
}

function eventoAlterado(o) {
  const opts = o || {};
  const pedidoInterno = opts.pedido_interno !== undefined ? opts.pedido_interno : "0000170512";
  return {
    schema_version: "1.0",
    event_id: opts.event_id || proximoEventId("alt"),
    event_type: "pedido_alterado",
    source: opts.source || "sim_status",
    source_event_id: null,
    idempotency_key: opts.idempotency_key ||
      `alter:${pedidoInterno || opts.ifood_short}:rev=${opts.revision !== undefined ? opts.revision : 1}`,
    occurred_at: opts.occurred_at !== undefined ? opts.occurred_at : "2026-07-11T19:05:00.000Z",
    captured_at: opts.captured_at || "2026-07-11T19:05:10.000Z",
    received_at: null,
    correlation: {
      ifood_short: opts.ifood_short !== undefined ? opts.ifood_short : "0724",
      pedido_interno: pedidoInterno,
      print_job_id: null
    },
    payload: {
      change_mode: opts.change_mode || "full_snapshot",
      revision: opts.revision !== undefined ? opts.revision : 1,
      previous_revision: opts.previous_revision !== undefined ? opts.previous_revision : null,
      supersedes_event_id: opts.supersedes_event_id || null,
      changed_fields: opts.changed_fields || ["itens"],
      itens: opts.itens,
      itens_removidos: opts.itens_removidos
    },
    quality: QUALITY_OK()
  };
}

function eventoReimpresso(o) {
  const opts = o || {};
  const pedidoInterno = opts.pedido_interno || "0000170512";
  return {
    schema_version: "1.0",
    event_id: opts.event_id || proximoEventId("rei"),
    event_type: "pedido_reimpresso",
    source: opts.source || "sim_comanda",
    source_event_id: null,
    idempotency_key: opts.idempotency_key || `reimp:${pedidoInterno}:${opts.emissao_nova || "2026-07-11T19:06:00.000Z"}`,
    occurred_at: null,
    captured_at: opts.captured_at || "2026-07-11T19:06:05.000Z",
    received_at: null,
    correlation: {
      ifood_short: opts.ifood_short !== undefined ? opts.ifood_short : "0724",
      pedido_interno: pedidoInterno,
      print_job_id: null
    },
    payload: {
      pedido_interno: pedidoInterno,
      emissao_nova: opts.emissao_nova || "2026-07-11T19:06:00.000Z",
      itens: opts.itens,
      conteudo_identico: opts.conteudo_identico
    },
    quality: QUALITY_OK()
  };
}

function eventoFonte(tipo, o) {
  const opts = o || {};
  return {
    schema_version: "1.0",
    event_id: opts.event_id || proximoEventId("fon"),
    event_type: tipo,
    source: opts.source || "sim_status",
    source_event_id: null,
    idempotency_key: opts.idempotency_key || `${tipo}:${opts.source || "sim_status"}:${opts.captured_at || "t"}`,
    occurred_at: opts.occurred_at !== undefined ? opts.occurred_at : null,
    captured_at: opts.captured_at || "2026-07-11T19:03:00.000Z",
    received_at: null,
    correlation: {},
    payload: { source: opts.source || "sim_status", motivo: opts.motivo || "timeout" },
    quality: QUALITY_OK()
  };
}

module.exports = {
  relogioFixo,
  proximoEventId,
  eventoComanda,
  eventoStatus,
  eventoCancelamento,
  eventoAlterado,
  eventoReimpresso,
  eventoFonte
};
