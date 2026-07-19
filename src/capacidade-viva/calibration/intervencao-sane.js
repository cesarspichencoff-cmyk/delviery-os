/* ============================================================================
 * Intervenção com gates + mensagens concretas (calibração humana TATÁ).
 * Gravidade separada da confiança: baixa confiança muda a ação, não apaga severidade.
 * ==========================================================================*/
"use strict";

const { stamp } = require("./labels");
const { usesHumanRules, actionFromSeverityConfidence } = require("./human-rules");

const ORDER = [
  "observar",
  "verificar_status",
  "verificar_agora",
  "verificar_pedido_segurando_saida",
  "priorizar_liberacao_motoboy",
  "intervir_agora_motoboy",
  "confirmar_motivo_sem_saida",
  "intervir_pedido_critico",
  "corrigir_status_pedido_antigo",
  "preparar_equipe_antes_pico",
  "priorizar_pedidos_especificos",
  "finalizar_pedidos_motoboy_esperando",
  "verificar_pedido_ja_saiu",
  "chamar_ou_cobrar_motoboy",
  "reorganizar_prioridade_praca",
  "apoio_local",
  "pausa_seletiva",
  "pausa_geral"
];

/**
 * @param {object} input
 */
function sugerirMenorIntervencaoSane(input) {
  const isf = input.isf || {};
  const tc = input.tick_class || {};
  const conf = input.confidence || isf.confidence || "media";
  const config = input.config || {};
  const crit = isf.praca_critica && isf.por_praca ? isf.por_praca[isf.praca_critica] : null;
  const evaluated = [];
  const human = usesHumanRules(config);

  function consider(action, ok, why) {
    evaluated.push({ action, ok: !!ok, why });
    return ok;
  }

  // Pedidos zumbis → ação técnica, sem pausa
  const zombieItems = [
    ...(tc.critical_items || []),
    ...(tc.attention_items || [])
  ].filter((x) => x.type === "pedido_sem_encerramento" || x.zombie);
  if (tc.n_zombie_orders > 0 || zombieItems.length) {
    return result("corrigir_status_pedido_antigo", {
      reason: "Pedido(s) com idade incompatível / sem encerramento — qualidade da fonte",
      message: "Verifique e corrija o status deste pedido antigo.",
      confidence: "baixa",
      severity: 0,
      technical: true,
      exclude_from_pause: true,
      evaluated
    });
  }

  // --- Calibração humana: mensagens concretas a partir de severidade nos itens ---
  if (human) {
    const concrete = pickConcreteFromItems(tc, conf);
    if (concrete) {
      return result(concrete.action, {
        reason: concrete.reason,
        message: concrete.message,
        confidence: conf,
        severity: concrete.severity,
        severity_label: concrete.severity_label,
        severity_preserved_under_low_confidence: true,
        exceptions: tc.critical_items,
        evaluated
      });
    }
  }

  // Confiança baixa com regras antigas: observar
  // Com regras humanas: se há severidade nos itens, não apagar
  if (!human && (isf.insufficient_data || conf === "baixa")) {
    return result("observar", {
      reason: "Não tenho leitura suficiente para recomendar.",
      message: "Não tenho leitura suficiente para recomendar.",
      confidence: "baixa",
      evaluated
    });
  }

  const critTypes = (tc.critical_items || []).map((x) => x.type);

  if (critTypes.indexOf("comanda_ausente") >= 0) {
    return result("verificar_pedido_ja_saiu", {
      reason: "Exceção: possível comanda/estado a investigar",
      message: "Verifique se o pedido já saiu e se o status está correto.",
      evaluated,
      exceptions: tc.critical_items
    });
  }

  if (
    critTypes.indexOf("motoboy_na_loja") >= 0 ||
    critTypes.indexOf("pronto_sem_saida_excessivo") >= 0 ||
    critTypes.indexOf("pronto_sem_saida_critico") >= 0 ||
    critTypes.indexOf("pedido_acima_40_min_operacional") >= 0
  ) {
    const item = (tc.critical_items || []).find((x) =>
      /motoboy|pronto|40_min/.test(x.type || "")
    );
    const sev = item && item.severity != null ? item.severity : 3;
    const pack = human
      ? actionFromSeverityConfidence(sev, conf, item && /motoboy/.test(item.type) ? "motoboy" : "pronto_sem_saida")
      : {
          action: "finalizar_pedidos_motoboy_esperando",
          message: "Priorize a saída dos pedidos com exceção logística concreta."
        };
    return result(pack.action, {
      reason: "Exceção logística concreta",
      message: pack.message,
      confidence: conf,
      severity: sev,
      evaluated,
      exceptions: tc.critical_items
    });
  }

  if (critTypes.indexOf("entregador_alocado_sem_retirada") >= 0) {
    return result(conf === "baixa" ? "verificar_agora" : "chamar_ou_cobrar_motoboy", {
      reason: "Entregador alocado sem retirada além do limiar",
      message:
        conf === "baixa"
          ? "Confirme se o entregador ainda está alocado e se o pedido continua na loja."
          : "Cobrar retirada do entregador alocado ou liberar o pedido.",
      confidence: conf,
      evaluated,
      exceptions: tc.critical_items
    });
  }

  // Atenções humanas (quase crítico / atenção forte)
  const attTypes = (tc.attention_items || []).map((x) => x.type);
  if (human && attTypes.indexOf("motoboy_na_loja") >= 0) {
    const item = (tc.attention_items || []).find((x) => x.type === "motoboy_na_loja");
    const sev = item && item.severity != null ? item.severity : 1;
    const pack = actionFromSeverityConfidence(sev, conf, "motoboy");
    return result(pack.action, {
      reason: "Motoboy na loja — atenção humana",
      message: pack.message,
      confidence: conf,
      severity: sev,
      evaluated
    });
  }
  if (
    human &&
    (attTypes.indexOf("aguardando_saida_causa_nao_confirmada") >= 0 ||
      attTypes.indexOf("pronto_sem_saida_atencao") >= 0)
  ) {
    const item = (tc.attention_items || [])[0];
    const sev = item && item.severity != null ? item.severity : 1.5;
    const pack = actionFromSeverityConfidence(sev, conf, "pronto_sem_saida");
    return result(pack.action, {
      reason: "Pedido pronto sem saída — atenção forte",
      message: pack.message,
      confidence: conf,
      severity: sev,
      evaluated
    });
  }

  if (human && conf === "baixa" && !tc.has_critical && !tc.has_attention) {
    return result("verificar_status", {
      reason: "Confiança baixa sem exceção concreta",
      message: "Confirme a leitura da fonte antes de intervir.",
      confidence: "baixa",
      evaluated
    });
  }

  if (!crit || crit.estado === "controlavel") {
    if (tc.has_attention) {
      return result("priorizar_pedidos_especificos", {
        reason: "Atenção operacional sem praça acima da capacidade",
        message: "Priorize os pedidos em atenção e confirme o motivo da demora.",
        evaluated
      });
    }
    return result("observar", {
      reason: "Operação controlável / só sinais contínuos",
      message: "Operação controlável — manter acompanhamento.",
      evaluated
    });
  }

  if (crit.estado === "atencao") {
    consider("observar", false, "há perda de margem");
    return result("priorizar_pedidos_especificos", {
      reason: `Praça ${crit.praca} em atenção`,
      message: `Priorize a praça ${crit.praca} e os pedidos mais antigos.`,
      praca: crit.praca,
      evaluated
    });
  }

  if (crit.estado === "proximo_limite") {
    return result("reorganizar_prioridade_praca", {
      reason: `Praça ${crit.praca} próxima do limite — reorganizar antes de pausar`,
      message: `Reorganize a prioridade da praça ${crit.praca} antes de considerar pausa.`,
      praca: crit.praca,
      evaluated
    });
  }

  // acima da capacidade — pausa seletiva só com gates (zumbis não contam)
  const gatesSel = {
    trend_up: !!input.trend_up,
    confidence_ok: conf === "alta" || conf === "media",
    localized: !!crit.praca,
    minor_insufficient: true,
    expected_persist: crit.isf != null && crit.isf > 1.05,
    no_zombie_driver: !(tc.n_zombie_orders > 0)
  };
  const selOk =
    gatesSel.trend_up &&
    gatesSel.confidence_ok &&
    gatesSel.localized &&
    gatesSel.expected_persist &&
    gatesSel.no_zombie_driver;

  if (selOk) {
    return result("pausa_seletiva", {
      reason: "Gates de pausa seletiva satisfeitos (tendência + localização + confiança)",
      message: `Considere pausa seletiva na praça ${crit.praca} — confirmar com a operação.`,
      praca: crit.praca,
      gates: gatesSel,
      evaluated,
      requires_human_confirmation: true,
      auto_apply: false
    });
  }

  return result("apoio_local", {
    reason: "Acima da capacidade estimada, mas gates de pausa seletiva incompletos",
    message: `Reforce apoio na praça ${crit.praca} sem pausar automaticamente.`,
    praca: crit.praca,
    gates: gatesSel,
    evaluated,
    requires_human_confirmation: true
  });
}

function pickConcreteFromItems(tc, conf) {
  const items = [...(tc.critical_items || []), ...(tc.attention_items || [])];
  if (!items.length) return null;

  // prioriza maior severidade
  let best = null;
  for (const it of items) {
    if (it.severity == null && !it.type) continue;
    if (!best || (it.severity || 0) > (best.severity || 0)) best = it;
  }
  if (!best) return null;

  const sev = best.severity != null ? best.severity : best.critical ? 3 : 1;
  let domain = "pronto_sem_saida";
  if (best.type === "motoboy_na_loja") domain = "motoboy";
  if (best.type === "pedido_sem_encerramento") domain = "zumbi";

  const pack = actionFromSeverityConfidence(sev, conf, domain);
  // se ação seria "observar" mas há severidade ≥1, forçar verificar
  if (pack.action === "observar" && sev >= 1) {
    pack.action = "verificar_agora";
    pack.message =
      domain === "motoboy"
        ? "Verifique o pedido que está segurando a saída e informe uma previsão ao motoboy."
        : "Confirme se o pedido continua na loja e identifique o motivo da saída não registrada.";
  }

  return {
    action: pack.action,
    message: pack.message,
    reason: best.explanation || best.type,
    severity: sev,
    severity_label: best.severity_label || null
  };
}

function result(action, extra) {
  const e = extra || {};
  return stamp({
    action,
    label: action,
    message: e.message || e.reason || "",
    reason: e.reason || "",
    praca: e.praca || null,
    confidence: e.confidence || "media",
    severity: e.severity != null ? e.severity : null,
    severity_label: e.severity_label || null,
    severity_preserved_under_low_confidence: e.severity_preserved_under_low_confidence || false,
    auto_apply: false,
    requires_human_confirmation: e.requires_human_confirmation !== false,
    alternatives_evaluated: e.evaluated || [],
    gates: e.gates || null,
    exceptions: e.exceptions || [],
    technical: !!e.technical,
    exclude_from_pause: !!e.exclude_from_pause,
    principle: "menor_intervencao",
    not_employee_evaluation: true
  });
}

module.exports = { sugerirMenorIntervencaoSane, ORDER, pickConcreteFromItems };
