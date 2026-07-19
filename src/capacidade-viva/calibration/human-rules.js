/* ============================================================================
 * Regras humanas TATÁ — primeira calibração com verdade operacional (César).
 * Gravidade separada da confiança. Não apagar gravidade por confiança baixa.
 * ==========================================================================*/
"use strict";

const { EPISTEMIC, stamp } = require("./labels");

/** Âncoras motoboy na loja (min → severidade 0–3). */
const MOTOBOY_ANCHORS = [
  { min: 0, severity: 0, label: "normal" },
  { min: 5, severity: 0.25, label: "normal_proximo_limite" },
  { min: 10, severity: 1, label: "atencao" },
  { min: 15, severity: 2, label: "quase_critico" },
  { min: 20, severity: 3, label: "critico" }
];

/** Âncoras pedido pronto/atrasado sem saída. */
const PRONTO_SEM_SAIDA_ANCHORS = [
  { min: 0, severity: 0, label: "normal" },
  { min: 25, severity: 1.5, label: "atencao_forte" },
  { min: 30, severity: 1.75, label: "atencao_forte_investigacao" },
  { min: 40, severity: 3, label: "critico" }
];

const SEVERITY_LABELS = {
  0: "normal",
  0.25: "observacao",
  0.5: "observacao",
  1: "atencao",
  1.5: "atencao_forte",
  1.75: "atencao_forte",
  2: "quase_critico",
  2.5: "quase_critico",
  3: "critico"
};

/**
 * Interpolação linear entre âncoras (progressão contínua).
 * @param {number} minutes
 * @param {Array<{min:number,severity:number,label:string}>} anchors
 */
function interpolateSeverity(minutes, anchors) {
  const m = Number(minutes) || 0;
  if (m <= anchors[0].min) return { severity: anchors[0].severity, label: anchors[0].label, minutes: m };
  for (let i = 0; i < anchors.length - 1; i++) {
    const a = anchors[i];
    const b = anchors[i + 1];
    if (m >= a.min && m <= b.min) {
      const t = (m - a.min) / (b.min - a.min || 1);
      const severity = round2(a.severity + t * (b.severity - a.severity));
      return { severity, label: nearestLabel(severity), minutes: m, between: [a.label, b.label] };
    }
  }
  const last = anchors[anchors.length - 1];
  return { severity: last.severity, label: last.label, minutes: m };
}

function nearestLabel(severity) {
  const keys = Object.keys(SEVERITY_LABELS)
    .map(Number)
    .sort((a, b) => a - b);
  let best = keys[0];
  for (const k of keys) {
    if (Math.abs(k - severity) < Math.abs(best - severity)) best = k;
  }
  return SEVERITY_LABELS[best] || "atencao";
}

/**
 * Amplificadores de gravidade (não só tempo).
 */
function amplifierBoost(ctx) {
  let boost = 0;
  const c = ctx || {};
  if ((c.n_ready || 0) >= 4) boost += 0.35;
  if ((c.n_delayed || 0) >= 2) boost += 0.35;
  if (c.queue_growing) boost += 0.3;
  if (c.praca_pressionada) boost += 0.3;
  if ((c.n_motoboys_waiting || 0) >= 2) boost += 0.4;
  if ((c.n_ready || 0) >= 8) boost += 0.2;
  return Math.min(1.2, boost);
}

/**
 * Classifica espera de motoboy na loja (requer evidência de espera).
 */
function classifyMotoboyWait(waitMin, ctx, opts) {
  const o = opts || {};
  const base = interpolateSeverity(waitMin, o.motoboy_anchors || MOTOBOY_ANCHORS);
  let severity = base.severity;
  // 5–7 min NUNCA é exceção crítica
  if (waitMin < 10) {
    severity = Math.min(severity, 0.5);
  }
  severity = Math.min(3, severity + amplifierBoost(ctx));
  // reforço: abaixo de 10 não vira crítico mesmo com amplificadores fortes
  if (waitMin < 10) severity = Math.min(severity, 0.85);
  if (waitMin < 15) severity = Math.min(severity, 2); // quase_critico max antes de 15
  if (waitMin >= 20) severity = Math.max(severity, 3);

  const label = nearestLabel(severity);
  const level = severityToTaxonomyLevel(severity, waitMin, "motoboy");
  return {
    type: "motoboy_na_loja",
    wait_min: round1(waitMin),
    severity,
    severity_label: label,
    taxonomy_level: level,
    amplifiers: amplifierBoost(ctx),
    message: motoboyIntervention(waitMin, severity).message,
    action: motoboyIntervention(waitMin, severity).action
  };
}

/**
 * Pedido pronto sem saída / atraso sem saída (não presumir motoboy).
 */
function classifyProntoSemSaida(readyWaitMin, ctx, opts) {
  const o = opts || {};
  const base = interpolateSeverity(readyWaitMin, o.pronto_anchors || PRONTO_SEM_SAIDA_ANCHORS);
  let severity = base.severity;
  severity = Math.min(3, severity + amplifierBoost(ctx) * 0.5);
  if (readyWaitMin >= 40) severity = 3;
  else if (readyWaitMin >= 25) severity = Math.max(severity, 1.5);

  const label = nearestLabel(severity);
  const level = severityToTaxonomyLevel(severity, readyWaitMin, "pronto");
  return {
    type: readyWaitMin >= 40 ? "pronto_sem_saida_critico" : "pronto_sem_saida_atencao",
    wait_min: round1(readyWaitMin),
    severity,
    severity_label: label,
    taxonomy_level: level,
    message: prontoIntervention(readyWaitMin, severity).message,
    action: prontoIntervention(readyWaitMin, severity).action
  };
}

function severityToTaxonomyLevel(severity, minutes, kind) {
  if (kind === "motoboy") {
    if (minutes < 10) return severity < 0.5 ? "quieto" : "sinal";
    if (minutes < 15) return "atencao";
    if (minutes < 20) return severity >= 2.5 ? "excecao_critica" : "atencao"; // quase crítico
    return "excecao_critica";
  }
  // pronto sem saída
  if (minutes < 25) return minutes > 12 ? "sinal" : "quieto";
  if (minutes < 40) return "atencao";
  return "excecao_critica";
}

/**
 * Pedido zumbi: idade incompatível / multi-período sem terminal.
 */
function isZombieOrder(state, config) {
  const cfg = (config && config.zombie) || {};
  const maxAge = cfg.max_age_min != null ? cfg.max_age_min : 180;
  const age = Number(state.age_min) || 0;
  const saiu = !!state.saiu;
  const cancelado = !!state.cancelado;

  if (saiu || cancelado) return { zombie: false };

  // idade absurda (multi-turno / multi-dia)
  if (age >= maxAge) {
    return {
      zombie: true,
      reason: "qualidade_da_fonte",
      subtype: "pedido_sem_encerramento",
      age_min: age,
      recommendation: "Verifique e corrija o status deste pedido antigo.",
      exclude_from_isf: true,
      exclude_from_pause: true,
      exclude_from_capacity: true
    };
  }

  // multi-dia operacional sem terminal (se flag no state)
  if (state.crosses_operational_days && age >= 120) {
    return {
      zombie: true,
      reason: "qualidade_da_fonte",
      subtype: "pedido_sem_encerramento_multi_periodo",
      age_min: age,
      recommendation: "Verifique e corrija o status deste pedido antigo.",
      exclude_from_isf: true,
      exclude_from_pause: true,
      exclude_from_capacity: true
    };
  }

  return { zombie: false };
}

/**
 * Ação a partir de gravidade + confiança (separadas).
 * Baixa confiança não apaga gravidade — muda natureza da ação.
 */
function actionFromSeverityConfidence(severity, confidence, domain) {
  const conf = confidence || "media";
  const sev = Number(severity) || 0;
  const lowConf = conf === "baixa";

  if (domain === "motoboy") {
    if (sev < 0.5) return { action: "observar", message: "Espera de motoboy dentro do normal." };
    if (sev < 1) {
      return {
        action: lowConf ? "verificar_status" : "observar_proximo_limite",
        message: lowConf
          ? "Confirme se o motoboy ainda está na loja e o status do pedido."
          : "Motoboy próximo do limite de espera normal — acompanhar."
      };
    }
    if (sev < 2) {
      return {
        action: lowConf ? "verificar_agora" : "verificar_pedido_segurando_saida",
        message:
          "Verifique o pedido que está segurando a saída e informe uma previsão ao motoboy."
      };
    }
    if (sev < 2.75) {
      return {
        action: lowConf ? "verificar_e_priorizar" : "priorizar_liberacao_motoboy",
        message:
          "Priorize a finalização ou liberação deste pedido. O motoboy está próximo do limite crítico."
      };
    }
    return {
      action: lowConf ? "confirmar_e_intervir" : "intervir_agora_motoboy",
      message:
        "Intervenha agora: identifique o bloqueio, priorize a saída e corrija o status caso o pedido já tenha saído."
    };
  }

  if (domain === "pronto_sem_saida") {
    if (sev < 1.5) {
      return {
        action: lowConf ? "verificar_status" : "observar",
        message: lowConf
          ? "Confirme se o pedido continua na loja."
          : "Tempo de expedição ainda aceitável."
      };
    }
    if (sev < 3) {
      return {
        action: lowConf ? "verificar_agora" : "confirmar_motivo_sem_saida",
        message:
          "Confirme se o pedido continua na loja e identifique o motivo da saída não registrada."
      };
    }
    return {
      action: lowConf ? "confirmar_localizacao_e_status" : "intervir_pedido_critico",
      message:
        "Pedido em estado crítico: confirmar localização, saída e atualização de status imediatamente."
    };
  }

  if (domain === "zumbi") {
    return {
      action: "corrigir_status_pedido_antigo",
      message: "Verifique e corrija o status deste pedido antigo.",
      technical: true
    };
  }

  return { action: "verificar", message: "Verifique a situação operacional." };
}

function motoboyIntervention(waitMin, severity) {
  return actionFromSeverityConfidence(severity, "media", "motoboy");
}

function prontoIntervention(waitMin, severity) {
  return actionFromSeverityConfidence(severity, "media", "pronto_sem_saida");
}

/**
 * Classificação completa de um pedido sob regras humanas v1.
 */
function classifyOrderHuman(state, config, ctx) {
  const context = Object.assign(
    {
      n_ready: 0,
      n_delayed: 0,
      queue_growing: false,
      praca_pressionada: false,
      n_motoboys_waiting: 0
    },
    ctx || {}
  );

  const zombie = isZombieOrder(state, config);
  if (zombie.zombie) {
    return stamp({
      order_id: state.id,
      level: "qualidade_fonte",
      taxonomy_level: "qualidade_fonte",
      zombie: true,
      zombie_info: zombie,
      signals: [],
      attentions: [],
      exceptions: [],
      severity: 0,
      severity_label: "qualidade_fonte",
      confidence: "baixa",
      epistemic: EPISTEMIC.INFERIDO_BAIXA,
      action: zombie.recommendation,
      action_code: "corrigir_status_pedido_antigo",
      exclude_from_isf: true,
      exclude_from_capacity: true,
      exclude_from_pause: true,
      aging_alone_is_not_critical: true,
      human_rule: "tata_v1_zombie"
    });
  }

  const signals = [];
  const attentions = [];
  const exceptions = [];
  let maxSeverity = 0;
  let primary = null;
  let actionPack = { action: "observar", message: "Operação sem alerta humano específico." };

  const age = Number(state.age_min) || 0;
  const readyWait = Number(state.ready_wait_min) || 0;
  const courierWait =
    state.courier_wait_store_min != null ? Number(state.courier_wait_store_min) : null;

  // Motoboy — só com evidência de espera na loja
  if (state.pronto && !state.saiu && courierWait != null && courierWait > 0) {
    const m = classifyMotoboyWait(courierWait, context, config.human_anchors);
    maxSeverity = Math.max(maxSeverity, m.severity);
    primary = m;
    const conf =
      state.courier_wait_epistemic === EPISTEMIC.CONFIRMADO || state.courier_wait_epistemic === "confirmado"
        ? "alta"
        : state.courier_wait_epistemic === EPISTEMIC.INFERIDO_BAIXA
          ? "baixa"
          : "media";
    actionPack = actionFromSeverityConfidence(m.severity, conf, "motoboy");

    const item = {
      type: "motoboy_na_loja",
      confidence: conf,
      epistemic: state.courier_wait_epistemic || EPISTEMIC.INFERIDO_ALTA,
      explanation: `Motoboy na loja ${round1(courierWait)} min → ${m.severity_label} (âncoras humanas TATÁ)`,
      severity: m.severity,
      severity_label: m.severity_label,
      confirmed: conf === "alta" || state.courier_wait_epistemic === EPISTEMIC.CONFIRMADO,
      critical: m.taxonomy_level === "excecao_critica"
    };

    if (m.taxonomy_level === "excecao_critica") {
      exceptions.push(Object.assign({ kind: "excecao_critica" }, item));
    } else if (m.taxonomy_level === "atencao") {
      attentions.push(Object.assign({ kind: "sinal_ou_atencao", critical: false }, item));
    } else if (m.taxonomy_level === "sinal") {
      signals.push(Object.assign({ kind: "sinal_ou_atencao", critical: false }, item));
    }
  } else if (state.pronto && !state.saiu && readyWait > 0) {
    // Pronto sem saída — NÃO rotular como motoboy
    const p = classifyProntoSemSaida(readyWait, context, config.human_anchors);
    maxSeverity = Math.max(maxSeverity, p.severity);
    primary = p;
    const conf = "baixa"; // causa não confirmada
    actionPack = actionFromSeverityConfidence(p.severity, conf, "pronto_sem_saida");

    const item = {
      type:
        readyWait >= 40
          ? "pronto_sem_saida_critico"
          : readyWait >= 25
            ? "aguardando_saida_causa_nao_confirmada"
            : "tempo_expedicao",
      confidence: conf,
      epistemic: EPISTEMIC.INFERIDO_BAIXA,
      explanation:
        readyWait >= 40
          ? `Pedido pronto sem saída há ${round1(readyWait)} min — crítico (âncora humana ≥40)`
          : readyWait >= 25
            ? `Pedido pronto sem saída há ${round1(readyWait)} min — atenção forte / investigar (âncora 25–40)`
            : `Pronto há ${round1(readyWait)} min sem saída — dentro da faixa de observação`,
      severity: p.severity,
      severity_label: p.severity_label,
      confirmed: false,
      critical: p.taxonomy_level === "excecao_critica"
    };

    if (p.taxonomy_level === "excecao_critica") {
      exceptions.push(Object.assign({ kind: "excecao_critica" }, item));
    } else if (p.taxonomy_level === "atencao") {
      attentions.push(Object.assign({ kind: "sinal_ou_atencao", critical: false }, item));
    } else if (readyWait > 8) {
      signals.push(Object.assign({ kind: "sinal_ou_atencao", critical: false }, item));
    }
  }

  // Alocado sem retirada — não confundir com motoboy na loja
  const limAlloc =
    (config.atraso && config.atraso.entregador_alocado_sem_retirada_min) != null
      ? config.atraso.entregador_alocado_sem_retirada_min
      : 15;
  if (state.alocado && state.pronto && !state.saiu && readyWait >= limAlloc && courierWait == null) {
    const ep = state.alocado_epistemic || EPISTEMIC.INFERIDO_ALTA;
    if (ep === EPISTEMIC.INFERIDO_BAIXA) {
      attentions.push(
        sig(
          "alocado_sem_retirada_fraco",
          "baixa",
          ep,
          "Alocado sem retirada — inferência fraca; verificar status"
        )
      );
    } else if (readyWait >= 40) {
      exceptions.push(
        exc(
          "entregador_alocado_sem_retirada",
          "media",
          ep,
          `Alocado e pronto sem retirada ≥ ${round1(readyWait)} min`,
          ep === EPISTEMIC.CONFIRMADO
        )
      );
      maxSeverity = Math.max(maxSeverity, 3);
    } else if (readyWait >= 25) {
      attentions.push(
        sig(
          "entregador_alocado_sem_retirada",
          "media",
          ep,
          `Alocado sem retirada ${round1(readyWait)} min — atenção forte`
        )
      );
      maxSeverity = Math.max(maxSeverity, 1.5);
    }
  }

  // Idade operacional real (não zumbi): ≥40 min → crítico; 30–40 → atenção
  const zombieMax = (config.zombie && config.zombie.max_age_min) != null ? config.zombie.max_age_min : 180;
  const limNear = (config.atraso && config.atraso.proximo_atrasar_min) != null ? config.atraso.proximo_atrasar_min : 30;
  if (age >= 40 && age < zombieMax) {
    // César: acima de 40 min não manter só como atenção
    if (
      !exceptions.some((e) => e.type && String(e.type).indexOf("pronto") >= 0) &&
      !exceptions.some((e) => e.type === "motoboy_na_loja")
    ) {
      exceptions.push(
        exc(
          "pedido_acima_40_min_operacional",
          "alta",
          EPISTEMIC.CONFIRMADO,
          `Idade operacional ${round1(age)} min ≥ 40 — crítico humano`,
          true
        )
      );
      maxSeverity = Math.max(maxSeverity, 3);
      if (!primary) {
        actionPack = actionFromSeverityConfidence(3, "alta", "pronto_sem_saida");
      }
    }
  } else if (age >= limNear && age < 40) {
    attentions.push(
      sig(
        "pedido_atrasado_vs_prometido_operacional",
        "media",
        EPISTEMIC.CONFIRMADO,
        `idade ${round1(age)} min — atenção`
      )
    );
    maxSeverity = Math.max(maxSeverity, 1);
  }

  if (state.prontos_acumulando || (context.n_ready || 0) >= 4) {
    attentions.push(sig("prontos_acumulando", "media", EPISTEMIC.INFERIDO_ALTA, "vários prontos sem saída"));
  }
  if (context.queue_growing) {
    signals.push(sig("fila_crescendo", "media", EPISTEMIC.INFERIDO_ALTA, "fila em crescimento"));
  }

  let level = "quieto";
  if (exceptions.length) level = "excecao_critica";
  else if (attentions.length) level = "atencao";
  else if (signals.length) level = "sinal";

  // confiança agregada: se há baixa em itens principais, confiança baixa mas severidade permanece
  let confidence = "media";
  const all = [...exceptions, ...attentions, ...signals];
  if (all.some((x) => x.confidence === "baixa" || x.epistemic === EPISTEMIC.INFERIDO_BAIXA)) {
    confidence = "baixa";
  } else if (all.some((x) => x.confidence === "alta" || x.epistemic === EPISTEMIC.CONFIRMADO)) {
    confidence = "alta";
  }

  // recompute action with confidence
  if (primary && primary.type === "motoboy_na_loja") {
    actionPack = actionFromSeverityConfidence(primary.severity, confidence, "motoboy");
  } else if (primary && String(primary.type).indexOf("pronto") >= 0) {
    actionPack = actionFromSeverityConfidence(primary.severity, confidence, "pronto_sem_saida");
  }

  return stamp({
    order_id: state.id,
    level,
    signals,
    attentions,
    exceptions,
    severity: maxSeverity,
    severity_label: nearestLabel(maxSeverity),
    confidence,
    action: actionPack.message,
    action_code: actionPack.action,
    // baixa confiança NÃO zera gravidade
    severity_preserved_under_low_confidence: true,
    aging_alone_is_not_critical: true,
    zombie: false,
    exclude_from_isf: false,
    human_rule: "tata_v1"
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
    confirmed: !!confirmed
  };
}

function round1(x) {
  return Math.round(Number(x) * 10) / 10;
}
function round2(x) {
  return Math.round(Number(x) * 100) / 100;
}

function usesHumanRules(config) {
  if (!config) return false;
  if (config.config_version === "cv-cal-tata-human-v1") return true;
  if (config.human_calibration && config.human_calibration.enabled) return true;
  if (config.rules_engine === "tata_human_v1") return true;
  return false;
}

module.exports = {
  MOTOBOY_ANCHORS,
  PRONTO_SEM_SAIDA_ANCHORS,
  interpolateSeverity,
  amplifierBoost,
  classifyMotoboyWait,
  classifyProntoSemSaida,
  isZombieOrder,
  actionFromSeverityConfidence,
  classifyOrderHuman,
  usesHumanRules,
  nearestLabel,
  severityToTaxonomyLevel
};
