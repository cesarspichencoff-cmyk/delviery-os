/* ============================================================================
 * Taxonomia: sinal contínuo · atenção operacional · exceção crítica
 * Envelhecimento isolado NÃO é exceção crítica.
 * ==========================================================================*/
"use strict";

const { EPISTEMIC, stamp } = require("./labels");
const { usesHumanRules, classifyOrderHuman } = require("./human-rules");

/**
 * Classifica um pedido no instante t.
 * @param {object} state - orderStateAt + extras
 * @param {object} config
 * @param {object} [ctx] - contexto de amplificadores (só regras humanas)
 */
function classifyOrderSignals(state, config, ctx) {
  const cfg = config || {};
  // Calibração humana TATÁ v1 — não altera comportamento de cv-cal-sane-v2
  if (usesHumanRules(cfg)) {
    return classifyOrderHuman(state, cfg, ctx || {});
  }
  const atras = cfg.atraso || {};
  const limReady = atras.pronto_sem_saida_min != null ? atras.pronto_sem_saida_min : 12;
  const limCourierStore = atras.motoboy_na_loja_min != null ? atras.motoboy_na_loja_min : 5;
  const limAlloc = atras.entregador_alocado_sem_retirada_min != null ? atras.entregador_alocado_sem_retirada_min : 15;
  const limLate = atras.atrasado_min != null ? atras.atrasado_min : 50;
  const limNear = atras.proximo_atrasar_min != null ? atras.proximo_atrasar_min : 35;

  const age = Number(state.age_min) || 0;
  const readyWait = Number(state.ready_wait_min) || 0;
  const signals = []; // contínuos
  const attentions = [];
  const exceptions = [];

  // --- sinais contínuos (nunca exceção sozinhos) ---
  if (age > 20) {
    signals.push(sig("envelhecendo", "media", EPISTEMIC.CONFIRMADO, `idade ${round1(age)} min`));
  }
  if (state.queue_growing) {
    signals.push(sig("fila_crescendo", "media", EPISTEMIC.INFERIDO_ALTA, "fila da praça em crescimento"));
  }
  if (state.carga_alta) {
    signals.push(sig("carga_alta", "media", EPISTEMIC.INFERIDO_ALTA, "carga ponderada elevada"));
  }
  if (state.item_complexo) {
    signals.push(sig("item_complexo", "media", EPISTEMIC.INFERIDO_ALTA, "complexidade concentrada"));
  }

  // pronto → saída: NÃO presumir motoboy
  if (state.pronto && !state.saiu && readyWait > 0) {
    if (state.courier_wait_store_min != null && state.courier_wait_store_min >= limCourierStore) {
      // confirmado/inferido alta via campo iFood
      exceptions.push(
        exc(
          "motoboy_na_loja",
          "alta",
          state.courier_wait_epistemic || EPISTEMIC.INFERIDO_ALTA,
          `Entregador com espera na loja ${state.courier_wait_store_min} min (limiar provisório ${limCourierStore})`,
          true
        )
      );
    } else if (readyWait >= limReady) {
      // causa não confirmada
      attentions.push(
        sig(
          "aguardando_saida_causa_nao_confirmada",
          "media",
          EPISTEMIC.INFERIDO_BAIXA,
          `Pronto há ${round1(readyWait)} min sem saída — causa não confirmada (não rotular como motoboy esperando)`
        )
      );
      // só vira exceção se tempo excessivo + confirmação fraca ainda exige investigação
      if (readyWait >= limReady * 2) {
        exceptions.push(
          exc(
            "pronto_sem_saida_excessivo",
            "media",
            EPISTEMIC.INFERIDO_BAIXA,
            `Pedido pronto sem saída por ${round1(readyWait)} min — investigar (motivo desconhecido)`,
            false
          )
        );
      }
    } else {
      signals.push(
        sig("tempo_normal_expedicao", "alta", EPISTEMIC.CONFIRMADO, `pronto→saída ${round1(readyWait)} min dentro do normal provisório`)
      );
    }
  }

  // alocado sem retirada — só exceção se limiar + não fraco
  if (state.alocado && state.pronto && !state.saiu && readyWait >= limAlloc) {
    const ep = state.alocado_epistemic || EPISTEMIC.INFERIDO_ALTA;
    if (ep === EPISTEMIC.INFERIDO_BAIXA) {
      attentions.push(sig("alocado_sem_retirada_fraco", "baixa", ep, "Inferência fraca — não abre exceção sozinha"));
    } else {
      exceptions.push(
        exc(
          "entregador_alocado_sem_retirada",
          "media",
          ep,
          `Alocado e pronto sem retirada ≥ ${limAlloc} min (provisório)`,
          ep === EPISTEMIC.CONFIRMADO
        )
      );
    }
  }

  // atraso: sinal/atenção, não exceção crítica isolada por idade
  if (age >= limLate) {
    attentions.push(sig("pedido_atrasado_vs_prometido_operacional", "alta", EPISTEMIC.CONFIRMADO, `idade ${round1(age)} ≥ ${limLate}`));
  } else if (age >= limNear) {
    signals.push(sig("proximo_de_atrasar", "media", EPISTEMIC.CONFIRMADO, `idade ${round1(age)} ≥ ${limNear}`));
  }

  // comanda ausente / volume / incompatível — só se flag explícita
  if (state.comanda_ausente) {
    exceptions.push(exc("comanda_ausente", "alta", EPISTEMIC.INFERIDO_BAIXA, "Possível comanda ausente (flag)", false));
  }
  if (state.volume_incompleto) {
    exceptions.push(exc("volume_incompleto", "media", EPISTEMIC.CONFIRMADO, "Volume incompleto", true));
  }
  if (state.estado_incompativel) {
    exceptions.push(exc("estado_incompativel", "alta", EPISTEMIC.CONFIRMADO, "Estado temporal impossível / incompatível", true));
  }

  // Atenção = combinações
  if (age > 25 && state.queue_growing) {
    attentions.push(sig("envelhecimento_mais_fila", "media", EPISTEMIC.INFERIDO_ALTA, "envelhecimento + fila crescente"));
  }
  if (state.item_complexo && state.capacidade_baixa) {
    attentions.push(sig("complexidade_mais_capacidade_baixa", "media", EPISTEMIC.INFERIDO_ALTA, "complexidade + capacidade baixa"));
  }
  if (state.prontos_acumulando) {
    attentions.push(sig("prontos_acumulando", "media", EPISTEMIC.INFERIDO_ALTA, "vários prontos sem saída"));
  }

  // Nível agregado do pedido
  let level = "sinal";
  if (exceptions.length) level = "excecao_critica";
  else if (attentions.length) level = "atencao";
  else if (signals.length) level = "sinal";
  else level = "quieto";

  return stamp({
    order_id: state.id,
    level,
    signals,
    attentions,
    exceptions,
    // aging alone never critical
    aging_alone_is_not_critical: true
  });
}

function sig(type, confidence, epistemic, explanation) {
  return { kind: "sinal_ou_atencao", type, confidence, epistemic, explanation, critical: false };
}

function exc(type, confidence, epistemic, explanation, confirmed) {
  return {
    kind: "excecao_critica",
    type,
    confidence,
    epistemic,
    explanation,
    critical: true,
    confirmed: !!confirmed,
    // fraca não deveria chegar aqui sozinha
    blocks_if_weak_alone: epistemic === EPISTEMIC.INFERIDO_BAIXA
  };
}

/**
 * Agrega classificações de pedidos + ISF em níveis de tick.
 */
function classifyTick(orderClassifications, isfSnapshot, opts) {
  const o = opts || {};
  const list = orderClassifications || [];
  let n_signal = 0;
  let n_attention = 0;
  let n_critical = 0;
  const critical_items = [];
  const attention_items = [];

  let n_zombie = 0;
  for (const c of list) {
    if (c.level === "qualidade_fonte" || c.zombie) {
      n_zombie++;
      continue; // não entra em pressão operacional / ISF
    }
    if (c.level === "excecao_critica") {
      n_critical++;
      // propaga order_id do pedido para cada exceção (não altera classificação)
      for (const ex of c.exceptions || []) {
        critical_items.push(
          Object.assign({}, ex, {
            order_id: ex.order_id || c.order_id || null,
            severity: ex.severity != null ? ex.severity : c.severity,
            action: c.action || ex.action,
            action_code: c.action_code || ex.action_code
          })
        );
      }
    } else if (c.level === "atencao") {
      n_attention++;
      for (const at of c.attentions || []) {
        attention_items.push(
          Object.assign({}, at, {
            order_id: at.order_id || c.order_id || null,
            severity: at.severity != null ? at.severity : c.severity,
            action: c.action || at.action,
            action_code: c.action_code || at.action_code
          })
        );
      }
    } else if (c.level === "sinal") n_signal++;
  }

  const isf = isfSnapshot || {};
  const critPraca = isf.praca_critica && isf.por_praca ? isf.por_praca[isf.praca_critica] : null;
  let tick_level = "quieto";
  if (n_critical > 0) tick_level = "excecao_critica";
  else if (n_attention > 0 || (critPraca && (critPraca.estado === "atencao" || critPraca.estado === "proximo_limite")))
    tick_level = "atencao";
  else if (n_signal > 0 || (critPraca && critPraca.estado === "controlavel" && (isf.n_pedidos || 0) > 40))
    tick_level = "sinal";
  if (critPraca && critPraca.estado === "acima_capacidade" && tick_level !== "excecao_critica") {
    tick_level = "atencao"; // pressão alta = atenção, não exceção
  }

  return stamp({
    tick_level,
    n_signal_orders: n_signal,
    n_attention_orders: n_attention,
    n_critical_orders: n_critical,
    n_zombie_orders: n_zombie,
    has_signal: n_signal + n_attention + n_critical > 0,
    has_attention: n_attention > 0 || tick_level === "atencao",
    has_critical: n_critical > 0,
    // NÃO chamar de taxa de detecção
    classification_frequency_note: "frequência de classificação — sem ground truth",
    critical_items: critical_items.slice(0, 20),
    attention_items: attention_items.slice(0, 20)
  });
}

function round1(x) {
  return Math.round(Number(x) * 10) / 10;
}

module.exports = {
  classifyOrderSignals,
  classifyTick,
  EPISTEMIC
};
