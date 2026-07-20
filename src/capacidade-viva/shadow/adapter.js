/* ============================================================================
 * CapacidadeVivaShadowAdapter — Fase 2E.1, modo sombra.
 * ----------------------------------------------------------------------------
 * Recebe o MESMO snapshot operacional que o Copiloto já usa (janela
 * NIGHT/rows do adaptador D4A, src/live/interface/adaptador.js — nada
 * duplicado, nada inventado) e roda a calibração human-v2 validada
 * (blind-v2, 26/26 independente) sobre ele.
 *
 * Contrato inegociável desta fase:
 *   - a saída é sempre um `shadow_observation` — nunca um
 *     `operational_decision`;
 *   - nunca devolve comando executável (intervenção é texto, não função);
 *   - nunca altera o snapshot recebido (só lê);
 *   - nunca lança para fora — qualquer erro interno vira
 *     { ok:false, kind:"shadow_failure", ... }, nunca uma exceção que
 *     poderia derrubar quem chamou.
 * ==========================================================================*/
"use strict";

const path = require("path");
const HR = require("./human-rules.js");

const ORDEM_SEVERIDADE_LABEL = ["normal", "atencao", "quase_critico", "critico"];

/**
 * Um pedido da janela NIGHT (id, curto, r, p, s, e, c — minutos) → fato
 * operacional no formato que human-rules.js entende. Puro, nunca lança.
 *
 * Limitação conhecida e documentada (não contornada com dado inventado):
 * o adaptador D4A nunca observa `s` (saiu) nem espera de motoboy na loja
 * (ver docs/preloja/Investigacao_Cenarios_Volume_Ambiente_Foco_V0.md) — por
 * isso `courier_wait_store_min` fica sempre null nesta integração. O braço
 * "motoboy_na_loja" de classifyOrderHuman só ativa quando existir fonte que
 * observe isso de verdade.
 */
function normalizeNightOrder(o, t) {
  if (!o || o.r == null) return null;
  if (o.c != null && o.c <= t) return null; // cancelado — fora do universo observável agora
  const pronto = o.p != null && o.p <= t;
  const saiu = o.e != null && o.e <= t; // "entregue" como único sinal de saída que esta fonte observa
  return {
    // id REAL (pedido_interno / status:ifood_short) — o mesmo que rows[].pedido_id
    // usa para resolver praça (ver app-v1/app.js:1642-1647, mesmo padrão). Nunca
    // trocar por `curto` aqui: quebraria o cruzamento com resolvePracas().
    id: o.id,
    age_min: Math.max(0, t - o.r),
    ready_wait_min: pronto ? Math.max(0, t - o.p) : 0,
    pronto,
    saiu,
    cancelado: false,
    courier_wait_store_min: null,
    courier_wait_epistemic: null,
    alocado: false,
    alocado_epistemic: null,
    age_is_proxy_from_volume: false,
    crosses_operational_days: t - o.r >= 180 || (pronto && t - o.p >= 180)
  };
}

/**
 * Praça por pedido (best-effort). Nunca lança: se o motor/seed não puder
 * resolver, devolve {} e a observação segue com praça=null — não inventa.
 */
function resolvePracas(rows, seedItens) {
  const out = {};
  if (!Array.isArray(rows) || !rows.length || !Array.isArray(seedItens)) return out;
  try {
    const MOTOR = require(path.join(__dirname, "..", "..", "perfil-delivery", "motor.js"));
    const FONTE = MOTOR.makeFonteItensFromRows(rows, seedItens);
    const porPedido = new Map();
    for (const r of rows) {
      if (!porPedido.has(r.pedido_id)) porPedido.set(r.pedido_id, true);
    }
    for (const pedidoId of porPedido.keys()) {
      const info = MOTOR.resolver(FONTE(pedidoId));
      if (info && Array.isArray(info.benches) && info.benches.length) {
        out[pedidoId] = info.benches[0];
      }
    }
  } catch (e) {
    return {}; // falha segura — silêncio aqui, quem chama decide se registra a falha técnica
  }
  return out;
}

/**
 * Estado visível (label) → posição na escala, para achar o "pior" entre vários
 * pedidos — SOMENTE entre pedidos com pressão operacional real.
 *
 * §6 (Fase 2E.1): pedido zumbi/qualidade_da_fonte NUNCA produz crítico
 * operacional e nunca pressiona a praça — por isso ele (e evidência
 * insuficiente) NUNCA competem aqui. Se a observação dominante for
 * escolhida por rank, um zumbi ao lado de um pedido crítico de verdade
 * jamais deve esconder o crítico atrás de um "qualidade_da_fonte".
 */
function severityRank(cls) {
  if (cls.zombie || cls.level === "qualidade_fonte") return -1;
  if (cls.level === "evidencia_insuficiente") return -1; // nunca é "o pior" — não compete por atenção
  if (cls.level === "excecao_critica") return ORDEM_SEVERIDADE_LABEL.indexOf("critico");
  if (cls.severity_label === "quase_critico") return ORDEM_SEVERIDADE_LABEL.indexOf("quase_critico");
  if (cls.level === "atencao") return ORDEM_SEVERIDADE_LABEL.indexOf("atencao");
  return ORDEM_SEVERIDADE_LABEL.indexOf("normal");
}

function estadoVisivel(cls) {
  if (cls.zombie || cls.level === "qualidade_fonte") return "qualidade_fonte";
  if (cls.level === "evidencia_insuficiente") return "impossivel_avaliar";
  if (cls.level === "excecao_critica") return "critico";
  if (cls.severity_label === "quase_critico") return "quase_critico";
  if (cls.level === "atencao") return "atencao";
  return "normal";
}

/**
 * CapacidadeVivaShadowAdapter.observeSnapshot
 * @param {object} input
 * @param {Array} input.NIGHT - janela.NIGHT do adaptador D4A (nunca mutado)
 * @param {Array} [input.rows] - janela.rows (para resolução de praça, opcional)
 * @param {Array} [input.seedItens] - cardápio (data/cardapio_knowledge_seed.json .itens)
 * @param {number} input.t - minuto de referência ("agora" do snapshot)
 * @param {string} [input.sourceStatus] - saúde da fonte já derivada pelo D4A (source_status)
 * @param {object} input.shadowConfig - { config, name, expected_sha256/actual_sha256, validation_commit }
 * @returns {{ ok:boolean, kind:"shadow_observation"|"shadow_failure", observation?:object, error?:string }}
 */
function observeSnapshot(input) {
  const inp = input || {};
  try {
    const NIGHT = Array.isArray(inp.NIGHT) ? inp.NIGHT : [];
    const t = Number(inp.t);
    if (!Number.isFinite(t)) {
      return { ok: false, kind: "shadow_failure", error: "snapshot_incompativel", detail: "t (minuto de referência) ausente/ inválido" };
    }
    if (!inp.shadowConfig || !inp.shadowConfig.config) {
      return { ok: false, kind: "shadow_failure", error: "config_ausente" };
    }

    const pracaPorPedido = resolvePracas(inp.rows, inp.seedItens);
    const config = inp.shadowConfig.config;

    const classificacoes = [];
    for (const o of NIGHT) {
      const fact = normalizeNightOrder(o, t);
      if (!fact) continue;
      let cls;
      try {
        cls = HR.classifyOrderHuman(fact, config, {});
      } catch (e) {
        continue; // um pedido malformado não derruba a observação inteira
      }
      classificacoes.push({ fact, cls, praca: pracaPorPedido[fact.id] || null });
    }

    if (!classificacoes.length) {
      return {
        ok: true,
        kind: "shadow_observation",
        observation: baseObservation(inp, {
          praca: null,
          estado: "sem_pedidos_na_janela",
          severidade: null,
          confianca: "baixa",
          regra_acionada: "sem_dados",
          evidencias: [],
          intervencao_sugerida_texto: "Sem pedidos na janela para avaliar.",
          intervencao_executavel: false,
          excluido_por_qualidade_da_fonte: false,
          participa_do_isf: false
        })
      };
    }

    // dominante = pior pressão OPERACIONAL real (rank >= 0). Zumbi/qualidade_da_fonte
    // e evidência insuficiente nunca competem aqui (§6) — mesmo que sejam a maioria
    // da janela, um único pedido "normal" de verdade já vence os dois.
    let melhor = null;
    let melhorRank = -2;
    for (const item of classificacoes) {
      const rank = severityRank(item.cls);
      if (rank > melhorRank) { melhorRank = rank; melhor = item; }
    }
    // nenhum pedido com pressão operacional real na janela — só zumbi e/ou evidência
    // insuficiente. Prioriza reportar qualidade_da_fonte (sinal de integridade de
    // dado, mais acionável) sobre "impossível avaliar" (recusa correta de adivinhar).
    if (!melhor || melhorRank < 0) {
      melhor =
        classificacoes.find((c) => c.cls.zombie || c.cls.level === "qualidade_fonte") ||
        classificacoes.find((c) => c.cls.level === "evidencia_insuficiente") ||
        classificacoes[0];
    }

    const cls = melhor.cls;
    const estado = cls.level === "evidencia_insuficiente" ? "impossivel_avaliar" : estadoVisivel(cls);

    return {
      ok: true,
      kind: "shadow_observation",
      observation: baseObservation(inp, {
        praca: melhor.praca,
        pedido_ref: cls.order_id || null,
        estado,
        severidade: cls.severity != null ? cls.severity : null,
        severidade_label: cls.severity_label || null,
        confianca: cls.confidence || "media",
        regra_acionada: cls.human_rule || "geral",
        evidencias: (cls.exceptions || []).concat(cls.attentions || []).concat(cls.signals || [])
          .map((e) => e.explanation).filter(Boolean).slice(0, 5),
        intervencao_sugerida_texto: cls.action || null,
        intervencao_executavel: false,
        excluido_por_qualidade_da_fonte: !!cls.zombie || cls.level === "qualidade_fonte",
        participa_do_isf: !cls.exclude_from_isf,
        pedidos_avaliados: classificacoes.length,
        pedidos_excluidos_por_fonte: classificacoes.filter((c) => c.cls.zombie).length
      })
    };
  } catch (e) {
    return { ok: false, kind: "shadow_failure", error: "excecao_interna", detail: String((e && e.message) || e) };
  }
}

function baseObservation(inp, fields) {
  const sc = inp.shadowConfig || {};
  return Object.assign(
    {
      kind: "shadow_observation", // nunca "operational_decision"
      timestamp: new Date().toISOString(),
      contexto_operacional: (inp.contextoOperacional) || null,
      saude_da_fonte: inp.sourceStatus || null,
      config_nome: sc.name || null,
      config_hash: sc.actual_sha256 || sc.expected_sha256 || null,
      commit_validacao: sc.validation_commit || null,
      versao_motor: sc.version != null ? sc.version : null,
      status_config: sc.status || "shadow_only",
      automatic_decisions_allowed: false,
      shadow_only: true
    },
    fields
  );
}

module.exports = {
  observeSnapshot,
  normalizeNightOrder,
  resolvePracas,
  severityRank,
  estadoVisivel
};
