/* ============================================================================
 * Regras humanas TATÁ — calibração operacional (César).
 * v1: âncoras contínuas (preservada via config cv-cal-tata-human-v1).
 * v2: estados discretos + precedência qualidade_da_fonte (cv-cal-tata-human-v2).
 * Gravidade separada da confiança. Não apagar gravidade por confiança baixa.
 * ==========================================================================*/
"use strict";

const { EPISTEMIC, stamp } = require("./labels");

/** Âncoras motoboy na loja (min → severidade 0–3). Intensidade interna. */
const MOTOBOY_ANCHORS = [
  { min: 0, severity: 0, label: "normal" },
  { min: 10, severity: 1, label: "atencao" },
  { min: 15, severity: 2, label: "quase_critico" },
  { min: 20, severity: 3, label: "critico" }
];

/** Âncoras pedido pronto/atrasado sem saída (v2). */
const PRONTO_SEM_SAIDA_ANCHORS = [
  { min: 0, severity: 0, label: "normal" },
  { min: 25, severity: 1, label: "atencao" },
  { min: 35, severity: 2, label: "quase_critico" },
  { min: 40, severity: 3, label: "critico" }
];

/** v1 legacy pronto anchors (só se config antiga pedir). */
const PRONTO_SEM_SAIDA_ANCHORS_V1 = [
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

function isHumanV2(config) {
  if (!config) return false;
  if (config.config_version === "cv-cal-tata-human-v2") return true;
  if (config.rules_engine === "tata_human_v2") return true;
  if (config.human_calibration && config.human_calibration.version === 2) return true;
  return false;
}

/**
 * Estado visível discreto — motoboy esperando (faixas oficiais v2).
 * Intensidade interna pode variar; o estado visível NÃO antecipa o limiar.
 */
function discreteMotoboyState(waitMin) {
  const m = Number(waitMin) || 0;
  if (m < 10) return { visible: "normal", taxonomy_level: "quieto", severity: intensityInBand(m, 0, 10, 0, 0.99), severity_label: "normal" };
  if (m < 15) return { visible: "atencao", taxonomy_level: "atencao", severity: intensityInBand(m, 10, 15, 1, 1.99), severity_label: "atencao" };
  if (m < 20) return { visible: "quase_critico", taxonomy_level: "quase_critico", severity: intensityInBand(m, 15, 20, 2, 2.99), severity_label: "quase_critico" };
  return { visible: "critico", taxonomy_level: "excecao_critica", severity: 3, severity_label: "critico" };
}

/**
 * Estado visível discreto — pronto sem saída (faixas oficiais v2).
 */
function discreteProntoState(readyWaitMin) {
  const m = Number(readyWaitMin) || 0;
  if (m < 25) return { visible: "normal", taxonomy_level: "quieto", severity: intensityInBand(m, 0, 25, 0, 0.99), severity_label: "normal" };
  if (m < 35) return { visible: "atencao", taxonomy_level: "atencao", severity: intensityInBand(m, 25, 35, 1, 1.99), severity_label: "atencao" };
  if (m < 40) return { visible: "quase_critico", taxonomy_level: "quase_critico", severity: intensityInBand(m, 35, 40, 2, 2.99), severity_label: "quase_critico" };
  return { visible: "critico", taxonomy_level: "excecao_critica", severity: 3, severity_label: "critico" };
}

/** Intensidade progressiva dentro da faixa, sem cruzar o próximo estado. */
function intensityInBand(m, a, b, sevLo, sevHi) {
  if (m <= a) return sevLo;
  if (m >= b) return sevHi;
  const t = (m - a) / (b - a || 1);
  return round2(sevLo + t * (sevHi - sevLo));
}

/**
 * Interpolação linear entre âncoras (progressão contínua) — legado v1 / intensidade.
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
 * v2: NÃO avançam o estado visível — só informam contexto.
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
  const useDiscrete = o.force_discrete === true || o.v2 === true || o.discrete === true;

  if (useDiscrete) {
    const d = discreteMotoboyState(waitMin);
    // intensidade interna pode refletir amplificadores, sem sair da faixa do estado
    let severity = d.severity;
    const boost = amplifierBoost(ctx);
    if (boost > 0) {
      const cap =
        d.visible === "normal"
          ? 0.99
          : d.visible === "atencao"
            ? 1.99
            : d.visible === "quase_critico"
              ? 2.99
              : 3;
      severity = Math.min(cap, severity + boost * 0.15);
    }
    return {
      type: "motoboy_na_loja",
      wait_min: round1(waitMin),
      severity: round2(severity),
      severity_label: d.severity_label,
      taxonomy_level: d.taxonomy_level,
      visible_state: d.visible,
      amplifiers: amplifierBoost(ctx),
      amplifiers_do_not_advance_visible_state: true,
      message: motoboyIntervention(waitMin, severity).message,
      action: motoboyIntervention(waitMin, severity).action
    };
  }

  // legado v1 contínuo
  const base = interpolateSeverity(waitMin, o.motoboy_anchors || MOTOBOY_ANCHORS);
  let severity = base.severity;
  if (waitMin < 10) severity = Math.min(severity, 0.5);
  severity = Math.min(3, severity + amplifierBoost(ctx));
  if (waitMin < 10) severity = Math.min(severity, 0.85);
  if (waitMin < 15) severity = Math.min(severity, 2);
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
  const useDiscrete = o.force_discrete === true || o.v2 === true || o.discrete === true;

  if (useDiscrete) {
    const d = discreteProntoState(readyWaitMin);
    let severity = d.severity;
    const boost = amplifierBoost(ctx) * 0.5;
    if (boost > 0) {
      const cap =
        d.visible === "normal"
          ? 0.99
          : d.visible === "atencao"
            ? 1.99
            : d.visible === "quase_critico"
              ? 2.99
              : 3;
      severity = Math.min(cap, severity + boost * 0.15);
    }
    return {
      type: readyWaitMin >= 40 ? "pronto_sem_saida_critico" : "pronto_sem_saida_atencao",
      wait_min: round1(readyWaitMin),
      severity: round2(severity),
      severity_label: d.severity_label,
      taxonomy_level: d.taxonomy_level,
      visible_state: d.visible,
      amplifiers_do_not_advance_visible_state: true,
      message: prontoIntervention(readyWaitMin, severity).message,
      action: prontoIntervention(readyWaitMin, severity).action
    };
  }

  const base = interpolateSeverity(readyWaitMin, o.pronto_anchors || PRONTO_SEM_SAIDA_ANCHORS_V1);
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
    // v2 discrete mapping (also safe for v1 callers)
    if (minutes < 10) return "quieto";
    if (minutes < 15) return "atencao";
    if (minutes < 20) return "quase_critico";
    return "excecao_critica";
  }
  // pronto sem saída v2
  if (minutes < 25) return "quieto";
  if (minutes < 35) return "atencao";
  if (minutes < 40) return "quase_critico";
  return "excecao_critica";
}

/**
 * Precedência da qualidade da fonte — ANTES da severidade operacional.
 * Pedido zumbi / sem terminal / idade ou espera incompatível.
 */
function isZombieOrder(state, config) {
  const cfg = (config && config.zombie) || {};
  const maxAge = cfg.max_age_min != null ? cfg.max_age_min : 180;
  const maxReady = cfg.max_ready_wait_min != null ? cfg.max_ready_wait_min : 180;
  const age = Number(state.age_min) || 0;
  const readyWait = Number(state.ready_wait_min) || 0;
  const courierWait =
    state.courier_wait_store_min != null ? Number(state.courier_wait_store_min) : 0;
  const saiu = !!state.saiu;
  const cancelado = !!state.cancelado;

  if (saiu || cancelado) return { zombie: false };

  const base = {
    zombie: true,
    reason: "qualidade_da_fonte",
    recommendation: (cfg.recommendation) || "Verifique e corrija o status deste pedido antigo.",
    exclude_from_isf: true,
    exclude_from_pause: true,
    exclude_from_capacity: true,
    precedence_over_critical: true
  };

  // espera/pronto absurdo sem terminal
  if (readyWait >= maxReady) {
    return Object.assign({}, base, {
      subtype: "pedido_sem_encerramento",
      age_min: age,
      ready_wait_min: readyWait,
      detail: `pronto sem saída ${round1(readyWait)} min ≥ ${maxReady}`
    });
  }

  // idade absurda sem terminal
  if (age >= maxAge) {
    return Object.assign({}, base, {
      subtype: "pedido_sem_encerramento",
      age_min: age,
      ready_wait_min: readyWait
    });
  }

  // incoerência temporal: pronto >> idade (dado incompatível)
  if (cfg.incoherent_ready_vs_age !== false && readyWait > 0 && age > 0 && readyWait > age + 60) {
    return Object.assign({}, base, {
      subtype: "dado_temporal_incompativel",
      age_min: age,
      ready_wait_min: readyWait,
      detail: `pronto ${round1(readyWait)} min > idade ${round1(age)} min + 60`
    });
  }

  // multi-dia operacional sem terminal
  if (state.crosses_operational_days && (age >= 120 || readyWait >= 120)) {
    return Object.assign({}, base, {
      subtype: "pedido_sem_encerramento_multi_periodo",
      age_min: age,
      ready_wait_min: readyWait
    });
  }

  // tempos atravessando turnos longos com pronto extremo (ex. 495 min)
  if (readyWait >= 180 || courierWait >= 180) {
    return Object.assign({}, base, {
      subtype: "pedido_sem_encerramento",
      age_min: age,
      ready_wait_min: Math.max(readyWait, courierWait)
    });
  }

  return { zombie: false };
}

/**
 * Ação a partir de gravidade + confiança (separadas).
 * Baixa confiança não apaga gravidade — muda natureza da ação.
 * Não altera limiar temporal.
 */
function actionFromSeverityConfidence(severity, confidence, domain) {
  const conf = confidence || "media";
  const sev = Number(severity) || 0;
  const lowConf = conf === "baixa";

  if (domain === "motoboy") {
    if (sev < 1) {
      return {
        action: lowConf ? "verificar_status" : "observar",
        message: lowConf
          ? "Confirme se o motoboy ainda está na loja e o status do pedido."
          : "Espera de motoboy dentro do normal."
      };
    }
    if (sev < 2) {
      return {
        action: lowConf ? "verificar_agora" : "verificar_pedido_segurando_saida",
        message:
          "Verifique o pedido que está segurando a saída e informe uma previsão ao motoboy."
      };
    }
    if (sev < 3) {
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
    if (sev < 1) {
      return {
        action: lowConf ? "verificar_status" : "observar",
        message: lowConf
          ? "Confirme se o pedido continua na loja."
          : "Tempo de expedição ainda aceitável."
      };
    }
    if (sev < 2) {
      return {
        action: lowConf ? "verificar_agora" : "confirmar_motivo_sem_saida",
        message:
          "Confirme se o pedido continua na loja e identifique o motivo da saída não registrada."
      };
    }
    if (sev < 3) {
      return {
        action: lowConf ? "verificar_e_priorizar" : "confirmar_motivo_sem_saida",
        message:
          "Pedido próximo do crítico sem saída — confirmar status e motivo imediatamente."
      };
    }
    return {
      action: lowConf ? "confirmar_localizacao_e_status" : "intervir_pedido_critico",
      message:
        "Pedido em estado crítico: confirmar localização, saída e atualização de status imediatamente."
    };
  }

  if (domain === "zumbi" || domain === "qualidade_fonte") {
    return {
      action: "corrigir_status_pedido_antigo",
      message: "Verifique e corrija o status deste pedido antigo.",
      technical: true
    };
  }

  if (domain === "evidencia_insuficiente") {
    return {
      action: "nao_classificar_pressao",
      message:
        "Evidência insuficiente para classificar pressão — não usar apenas quantidade de pedidos ativos."
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
 * Classificação completa de um pedido sob regras humanas.
 * Ordem: (1) fonte (2) evidência suficiente (3) severidade operacional.
 */
function classifyOrderHuman(state, config, ctx) {
  const v2 = isHumanV2(config);
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

  // --- 1) Qualidade da fonte (precedência absoluta) ---
  const zombie = isZombieOrder(state, config);
  if (zombie.zombie) {
    return stamp({
      order_id: state.id,
      level: "qualidade_fonte",
      taxonomy_level: "qualidade_fonte",
      severity_label: "qualidade_fonte",
      zombie: true,
      zombie_info: zombie,
      signals: [],
      attentions: [],
      exceptions: [],
      severity: 0,
      confidence: "baixa",
      epistemic: EPISTEMIC.INFERIDO_BAIXA,
      action: zombie.recommendation,
      action_code: "corrigir_status_pedido_antigo",
      exclude_from_isf: true,
      exclude_from_capacity: true,
      exclude_from_pause: true,
      aging_alone_is_not_critical: true,
      human_rule: v2 ? "tata_v2_zombie" : "tata_v1_zombie",
      source_quality_precedence: true
    });
  }

  const age = Number(state.age_min) || 0;
  const readyWait = Number(state.ready_wait_min) || 0;
  const courierWait =
    state.courier_wait_store_min != null ? Number(state.courier_wait_store_min) : null;

  // --- 2) Evidência insuficiente (volume sozinho) ---
  const hasWaitSignal =
    (courierWait != null && courierWait > 0) ||
    (state.pronto && !state.saiu && readyWait > 0) ||
    (state.alocado && readyWait > 0) ||
    age >= 30;
  const volumeOnly =
    context.volume_only === true ||
    (context.only_active_orders === true && !hasWaitSignal);

  if (volumeOnly || (context.insufficient_evidence === true && !hasWaitSignal)) {
    return stamp({
      order_id: state.id,
      level: "evidencia_insuficiente",
      taxonomy_level: "evidencia_insuficiente",
      severity_label: "evidencia_insuficiente",
      severity: 0,
      signals: [],
      attentions: [],
      exceptions: [],
      confidence: "baixa",
      action: "Evidência insuficiente para classificar pressão operacional.",
      action_code: "nao_classificar_pressao",
      exclude_from_isf: true,
      exclude_from_capacity: false,
      exclude_from_pause: true,
      insufficient_evidence: true,
      human_rule: v2 ? "tata_v2_insufficient" : "tata_v1_insufficient"
    });
  }

  const signals = [];
  const attentions = [];
  const exceptions = [];
  let maxSeverity = 0;
  let primary = null;
  let actionPack = { action: "observar", message: "Operação sem alerta humano específico." };
  const discreteOpts = v2 ? { v2: true, force_discrete: true, discrete: true } : { v2: false };

  // Motoboy — só com evidência de espera na loja
  if (state.pronto && !state.saiu && courierWait != null && courierWait > 0) {
    const m = classifyMotoboyWait(courierWait, context, Object.assign({}, config.human_anchors, discreteOpts));
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
      explanation: `Motoboy na loja ${round1(courierWait)} min → ${m.severity_label} (faixa discreta)`,
      severity: m.severity,
      severity_label: m.severity_label,
      confirmed: conf === "alta" || state.courier_wait_epistemic === EPISTEMIC.CONFIRMADO,
      critical: m.taxonomy_level === "excecao_critica"
    };

    if (m.taxonomy_level === "excecao_critica") {
      exceptions.push(Object.assign({ kind: "excecao_critica" }, item));
    } else if (m.taxonomy_level === "quase_critico") {
      attentions.push(Object.assign({ kind: "quase_critico", critical: false }, item));
    } else if (m.taxonomy_level === "atencao") {
      attentions.push(Object.assign({ kind: "sinal_ou_atencao", critical: false }, item));
    }
    // quieto/normal: não empurra atenção
  } else if (state.pronto && !state.saiu && readyWait > 0) {
    const p = classifyProntoSemSaida(readyWait, context, Object.assign({}, config.human_anchors, discreteOpts));
    maxSeverity = Math.max(maxSeverity, p.severity);
    primary = p;
    const conf =
      state.ready_epistemic === EPISTEMIC.CONFIRMADO || state.ready_epistemic === "confirmado"
        ? "alta"
        : "baixa";
    actionPack = actionFromSeverityConfidence(p.severity, conf, "pronto_sem_saida");

    const item = {
      type:
        readyWait >= 40
          ? "pronto_sem_saida_critico"
          : readyWait >= 25
            ? "aguardando_saida_causa_nao_confirmada"
            : "tempo_expedicao",
      confidence: conf,
      epistemic: conf === "alta" ? EPISTEMIC.CONFIRMADO : EPISTEMIC.INFERIDO_BAIXA,
      explanation:
        readyWait >= 40
          ? `Pedido pronto sem saída há ${round1(readyWait)} min — crítico (≥40)`
          : readyWait >= 35
            ? `Pedido pronto sem saída há ${round1(readyWait)} min — quase crítico (35–40)`
            : readyWait >= 25
              ? `Pedido pronto sem saída há ${round1(readyWait)} min — atenção (25–35)`
              : `Pronto há ${round1(readyWait)} min sem saída — normal (<25)`,
      severity: p.severity,
      severity_label: p.severity_label,
      confirmed: false,
      critical: p.taxonomy_level === "excecao_critica"
    };

    if (p.taxonomy_level === "excecao_critica") {
      exceptions.push(Object.assign({ kind: "excecao_critica" }, item));
    } else if (p.taxonomy_level === "quase_critico") {
      attentions.push(Object.assign({ kind: "quase_critico", critical: false }, item));
    } else if (p.taxonomy_level === "atencao") {
      attentions.push(Object.assign({ kind: "sinal_ou_atencao", critical: false }, item));
    }
  }

  // Alocado sem retirada — alinhado às faixas de pronto (v2: atenção ≥25, crítico ≥40)
  const limAlloc =
    (config.atraso && config.atraso.entregador_alocado_sem_retirada_min) != null
      ? config.atraso.entregador_alocado_sem_retirada_min
      : v2
        ? 25
        : 15;
  if (state.alocado && state.pronto && !state.saiu && readyWait >= limAlloc && courierWait == null) {
    const ep = state.alocado_epistemic || EPISTEMIC.INFERIDO_ALTA;
    if (ep === EPISTEMIC.INFERIDO_BAIXA && readyWait < 40) {
      // baixa confiança: não inventar atenção abaixo do crítico
      if (readyWait >= 25) {
        attentions.push(
          sig(
            "alocado_sem_retirada_fraco",
            "baixa",
            ep,
            "Alocado sem retirada — inferência fraca; verificar status"
          )
        );
        maxSeverity = Math.max(maxSeverity, 1);
      }
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
          `Alocado sem retirada ${round1(readyWait)} min — atenção`
        )
      );
      maxSeverity = Math.max(maxSeverity, 1);
    }
  }

  // Idade operacional real (não zumbi): ≥40 crítico; 30–40 atenção
  // Só se NÃO houver sinal de motoboy/pronto já classificado em faixa normal
  // e a idade for evidência real (não proxy de volume).
  const zombieMax = (config.zombie && config.zombie.max_age_min) != null ? config.zombie.max_age_min : 180;
  const limNear = (config.atraso && config.atraso.proximo_atrasar_min) != null ? config.atraso.proximo_atrasar_min : 30;
  const ageIsProxy = !!state.age_is_proxy_from_volume;
  const hasPrimaryTemporal =
    primary &&
    (primary.type === "motoboy_na_loja" || String(primary.type).indexOf("pronto") >= 0);

  if (!ageIsProxy && age >= 40 && age < zombieMax) {
    if (
      !exceptions.some((e) => e.type && String(e.type).indexOf("pronto") >= 0) &&
      !exceptions.some((e) => e.type === "motoboy_na_loja")
    ) {
      // Se já há motoboy/pronto em estado normal/atencao, não sobrescrever com crítico por idade sozinha
      // quando a idade parece ser o atraso operacional principal.
      if (!hasPrimaryTemporal || (primary && primary.severity_label === "normal")) {
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
        if (!primary || (primary && primary.severity_label === "normal")) {
          actionPack = actionFromSeverityConfidence(3, "alta", "pronto_sem_saida");
          primary = { type: "atraso_operacional", severity: 3, severity_label: "critico" };
        }
      }
    }
  } else if (!ageIsProxy && age >= limNear && age < 40 && !hasPrimaryTemporal) {
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

  // Prontos acumulando: só com evidência de prontos, não volume bruto sozinho
  if (state.prontos_acumulando && readyWait >= 25) {
    attentions.push(sig("prontos_acumulando", "media", EPISTEMIC.INFERIDO_ALTA, "vários prontos sem saída (≥25 min)"));
  } else if (state.prontos_acumulando && readyWait > 0 && readyWait < 25) {
    // não eleva — permanece normal
  }
  if (context.queue_growing && hasWaitSignal) {
    signals.push(sig("fila_crescendo", "media", EPISTEMIC.INFERIDO_ALTA, "fila em crescimento"));
  }

  let level = "quieto";
  if (exceptions.length) level = "excecao_critica";
  else if (attentions.some((a) => a.kind === "quase_critico" || a.severity_label === "quase_critico")) {
    level = "atencao"; // severity_label carrega quase_critico
  } else if (attentions.length) level = "atencao";
  else if (signals.length) level = "sinal";

  // severity_label dominante
  let severityLabel = nearestLabel(maxSeverity);
  if (primary && primary.severity_label) severityLabel = primary.severity_label;
  if (exceptions.length) severityLabel = "critico";
  else if (attentions.some((a) => a.severity_label === "quase_critico")) severityLabel = "quase_critico";

  let confidence = "media";
  const all = [...exceptions, ...attentions, ...signals];
  if (all.some((x) => x.confidence === "baixa" || x.epistemic === EPISTEMIC.INFERIDO_BAIXA)) {
    confidence = "baixa";
  } else if (all.some((x) => x.confidence === "alta" || x.epistemic === EPISTEMIC.CONFIRMADO)) {
    confidence = "alta";
  }

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
    severity_label: severityLabel,
    confidence,
    action: actionPack.message,
    action_code: actionPack.action,
    severity_preserved_under_low_confidence: true,
    aging_alone_is_not_critical: true,
    zombie: false,
    exclude_from_isf: false,
    human_rule: v2 ? "tata_v2" : "tata_v1"
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
  if (config.config_version === "cv-cal-tata-human-v2") return true;
  if (config.human_calibration && config.human_calibration.enabled) return true;
  if (config.rules_engine === "tata_human_v1") return true;
  if (config.rules_engine === "tata_human_v2") return true;
  return false;
}

module.exports = {
  MOTOBOY_ANCHORS,
  PRONTO_SEM_SAIDA_ANCHORS,
  PRONTO_SEM_SAIDA_ANCHORS_V1,
  interpolateSeverity,
  amplifierBoost,
  classifyMotoboyWait,
  classifyProntoSemSaida,
  isZombieOrder,
  actionFromSeverityConfidence,
  classifyOrderHuman,
  usesHumanRules,
  isHumanV2,
  nearestLabel,
  severityToTaxonomyLevel,
  discreteMotoboyState,
  discreteProntoState
};
