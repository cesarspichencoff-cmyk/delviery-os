/* ============================================================================
 * Conclusões do Conference Brain, versionadas, para o Copiloto shadow.
 * ----------------------------------------------------------------------------
 * Este é o lado do Brain da fronteira `Conference Brain -> Copiloto`. Ele é o
 * espelho exato do adapter da Unidade 4: lá o Brain recebia um objeto simples
 * da Operação Viva; aqui o Copiloto recebe um objeto simples do Brain. Nenhum
 * dos dois subsistemas importa o outro, em nenhuma direção.
 *
 * Por que a extração mora AQUI e não do lado do Copiloto: é aqui que vive o
 * `PiiGuard` comprovado, é aqui que `mayAffirmOperationalLoad` decide o que
 * pode ser afirmado, e é aqui que a reconciliação é recalculada do histórico.
 * Levar essas três coisas para o outro lado seria reimplementá-las — e a única
 * coisa pior que uma regra difícil é a mesma regra em dois lugares (L20).
 *
 * ## As duas espécies de conclusão, e por que a distinção é o coração
 *
 *   source_health    o que dá para confiar na FONTE. Sempre disponível.
 *   order_dimension  o que se sabe de um PEDIDO. Só existe com observação
 *                    legítima de pedido.
 *
 * A cadeia real de hoje produz apenas a primeira. O adapter da Operação Viva
 * não emite pedido (D29), então o Brain não tem observação de pedido vinda
 * dali, então nenhuma conclusão de pedido nasce desse caminho. Isso não é
 * limitação deste arquivo — é o estado honesto propagado inteiro, sem remendo.
 *
 * `pode_afirmar` viaja calculado, e não como dado bruto para o outro lado
 * reinterpretar: quem decide se uma leitura sustenta afirmação confiante é a
 * regra do Brain (`live/health.js#mayAffirmOperationalLoad`), não o Copiloto.
 * ==========================================================================*/
"use strict";

const PiiGuard = require("../live/pii-guard");
const { mayAffirmOperationalLoad } = require("../live/health");
const { CLOCK_EVENT_TYPES } = require("../contracts/live-states");

const CONCLUSION_VERSION = "conference-brain-conclusion@1.0.0";

const CONCLUSION_KIND = Object.freeze({
  SOURCE_HEALTH: "source_health",
  ORDER_DIMENSION: "order_dimension",
});

/**
 * Estados de pedido que sustentam uma conclusão de prontidão.
 * Vocabulário do Brain, não inventado aqui.
 */
const PRONTO = Object.freeze(["ready"]);

function textoSeguro(v) {
  // Idempotente: sanitizar texto já sanitizado devolve o mesmo texto. O
  // observador já passou `raw_status` pelo guard antes de persistir; repetir
  // aqui custa nada e fecha o caminho de quem escrever no store por fora.
  return PiiGuard.sanitizeFreeText(String(v == null ? "" : v));
}

/**
 * Conclusão sobre a SAÚDE DA FONTE, a partir de um ciclo do observador.
 *
 * `limitacoes` sai de `fields_missing`, que é vocabulário controlado (nomes de
 * campo que a fonte declarou não ter). É a ausência declarada da Unidade 4
 * viajando um passo adiante, ainda declarada.
 */
function conclusaoDeSaude(ciclo, escopo) {
  const health = String(ciclo.source_health || "");
  return Object.freeze({
    conclusion_version: CONCLUSION_VERSION,
    conclusion_kind: CONCLUSION_KIND.SOURCE_HEALTH,
    conclusion_ref: `source_health:${ciclo.run_id}:${ciclo.cycle_id}`,
    unit_id: escopo.unit_id,
    source_mode: escopo.source_mode,
    shadow: true,
    observed_at: ciclo.finished_at || ciclo.started_at || null,
    source_health: health,
    // Calculado pela regra do Brain, nunca reinterpretado do outro lado.
    pode_afirmar: mayAffirmOperationalLoad(health),
    orders_observed: typeof ciclo.orders_observed === "number" ? ciclo.orders_observed : null,
    evidence: Object.freeze([
      Object.freeze({ tipo: "live_cycle_run", ref: `${ciclo.run_id}|${ciclo.cycle_id}` }),
    ]),
    limitacoes: Object.freeze(
      (Array.isArray(ciclo.fields_missing) ? ciclo.fields_missing : []).slice().sort(),
    ),
    // Erros do ciclo podem carregar texto de qualquer origem — passam pelo guard.
    notas: Object.freeze((Array.isArray(ciclo.errors) ? ciclo.errors : []).map(textoSeguro)),
  });
}

/**
 * Conclusão sobre um PEDIDO, a partir da reconciliação recalculada do
 * histórico. Só nasce com observação legítima de pedido — não há caminho neste
 * arquivo que a fabrique a partir de contexto de viagem.
 */
function conclusaoDePedido(externalId, reconciliada, estado, escopo, saudeDoCiclo) {
  const observacoes = estado.observations || [];
  const eventosRelogio = estado.clockEvents || [];
  const ultima = observacoes[observacoes.length - 1] || null;

  // A evidência é rastreável por construção: cada item aponta uma linha que
  // existe no store. Conclusão sem evidência não é emitida (ver extrair).
  const evidence = observacoes
    .map((o) => Object.freeze({ tipo: "live_observation", ref: `${o.run_id}|${o.cycle_id}|${o.external_id}` }))
    .concat(
      eventosRelogio.map((e) => Object.freeze({ tipo: "conference_clock_event", ref: String(e.event_id) })),
    );

  const limitacoes = [];
  if (!reconciliada || !reconciliada.order_state) limitacoes.push("order_state_nao_reconciliado");
  if (ultima && ultima.missing_from_view === true) limitacoes.push("pedido_sumiu_da_tela");

  return Object.freeze({
    conclusion_version: CONCLUSION_VERSION,
    conclusion_kind: CONCLUSION_KIND.ORDER_DIMENSION,
    conclusion_ref: `order_dimension:${externalId}:${observacoes.length}`,
    unit_id: escopo.unit_id,
    source_mode: escopo.source_mode,
    shadow: true,
    external_id: externalId,
    observed_at: ultima ? ultima.observed_at || null : null,
    source_health: saudeDoCiclo,
    pode_afirmar: mayAffirmOperationalLoad(saudeDoCiclo),
    order_state: (reconciliada && reconciliada.order_state) || null,
    readiness_state: (reconciliada && reconciliada.readiness_state) || null,
    // Saída só conta quando FOI OBSERVADA. Ausência de evento nunca vira
    // "não saiu" — vira desconhecido, que é o que `null` diz.
    saida_observada: eventosRelogio.some((e) => e.event_type === CLOCK_EVENT_TYPES.DEPARTED_OBSERVED)
      ? true
      : null,
    observacoes: observacoes.length,
    evidence: Object.freeze(evidence),
    limitacoes: Object.freeze(limitacoes.sort()),
    notas: Object.freeze(ultima && ultima.raw_status ? [textoSeguro(ultima.raw_status)] : []),
  });
}

/**
 * Extrai as conclusões de um escopo (unidade + modo + execução).
 *
 * @param {object} o
 *   store        instância de storage/store.js — a MESMA do Brain, nunca outra
 *   observer     instância de live/observer.js; é quem sabe reconciliar
 *   unit_id      escopo declarado por quem lê (o store não carrega unidade)
 *   source_mode  real | simulated | control — particiona tudo
 *   run_id       execução a ler; separa modos por construção
 * @returns {{conclusoes: object[], recusadas: object[]}}
 */
function extrairConclusoes(o) {
  const opts = o || {};
  const store = opts.store;
  const escopo = { unit_id: opts.unit_id, source_mode: opts.source_mode };
  const conclusoes = [];
  const recusadas = [];

  if (!store || !opts.unit_id || !opts.source_mode || !opts.run_id) {
    return { conclusoes: [], recusadas: [{ motivo: "escopo_incompleto", conclusion_ref: null }] };
  }

  const ciclos = store
    .all("live_cycle_runs")
    .filter((c) => c.run_id === opts.run_id)
    .sort((a, b) => String(a.started_at).localeCompare(String(b.started_at)));

  for (const c of ciclos) conclusoes.push(conclusaoDeSaude(c, escopo));

  // A saúde vigente é a do ciclo mais recente desta execução. Sem ciclo, não
  // há leitura — e sem leitura nenhuma conclusão de pedido pode afirmar nada.
  const ultimoCiclo = ciclos[ciclos.length - 1] || null;
  const saudeVigente = ultimoCiclo ? String(ultimoCiclo.source_health || "") : "unavailable";

  if (typeof opts.observer !== "object" || opts.observer === null) {
    return { conclusoes, recusadas };
  }

  const pedidos = Array.from(
    new Set(
      store
        .all("live_observations")
        .map((r) => r.external_id)
        .filter(Boolean),
    ),
  ).sort();

  for (const externalId of pedidos) {
    const estado = opts.observer.loadOrderState(externalId);
    if (!estado.observations.length) {
      // Sem observação persistida não há evidência rastreável. Conclusão sem
      // evidência não sai daqui — nem como conclusão vazia.
      recusadas.push({ motivo: "sem_evidencia_rastreavel", conclusion_ref: `order_dimension:${externalId}` });
      continue;
    }
    const reconciliada = opts.observer.getReconciledDimension(externalId);
    conclusoes.push(conclusaoDePedido(externalId, reconciliada, estado, escopo, saudeVigente));
  }

  return { conclusoes, recusadas };
}

module.exports = {
  CONCLUSION_VERSION,
  CONCLUSION_KIND,
  PRONTO,
  extrairConclusoes,
  conclusaoDeSaude,
  conclusaoDePedido,
};
