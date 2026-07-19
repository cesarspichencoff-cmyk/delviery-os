/* ============================================================================
 * Calibração ISF com separação temporal — evita overfitting ingênuo.
 * ==========================================================================*/
"use strict";

const fs = require("fs");
const path = require("path");
const CV = require("../index");
const { stamp } = require("./labels");
const { replayOrders } = require("./replay");

/**
 * Divide ticks por data (UTC day) em calibração vs validação.
 */
function splitTicks(ticks, opts) {
  const o = opts || {};
  const days = [...new Set(ticks.map((x) => String(x.t).slice(0, 10)))].sort();
  if (!days.length) return { cal: [], val: [], days_cal: [], days_val: [] };
  const ratio = o.cal_ratio != null ? o.cal_ratio : 0.67;
  const cut = Math.max(1, Math.floor(days.length * ratio));
  const days_cal = days.slice(0, cut);
  const days_val = days.slice(cut);
  const calSet = new Set(days_cal);
  return {
    cal: ticks.filter((t) => calSet.has(String(t.t).slice(0, 10))),
    val: ticks.filter((t) => !calSet.has(String(t.t).slice(0, 10))),
    days_cal,
    days_val
  };
}

/**
 * Avalia métricas de sombra em um conjunto de ticks.
 */
function scoreShadow(ticks) {
  let critical = 0;
  let pause_sel = 0;
  let pause_gen = 0;
  let observe = 0;
  let ex = 0;
  let low_conf = 0;
  const byDow = {};
  const byHour = {};

  for (const t of ticks) {
    const s = t.shadow || {};
    const d = new Date(t.t_ms || t.t);
    const dow = d.getUTCDay();
    const hour = d.getUTCHours(); // approx — document timezone caveat
    byDow[dow] = byDow[dow] || { n: 0, critical: 0 };
    byDow[dow].n++;
    byHour[hour] = byHour[hour] || { n: 0, critical: 0 };
    byHour[hour].n++;

    if (s.estado === "acima_capacidade" || s.estado === "proximo_limite") {
      critical++;
      byDow[dow].critical++;
      byHour[hour].critical++;
    }
    if (s.pausa_seletiva_sugerida) pause_sel++;
    if (s.pausa_geral_sugerida) pause_gen++;
    if (s.menor_intervencao === "observar") observe++;
    if (s.excecao_critica) ex++;
    if (s.confianca === "baixa") low_conf++;
  }
  const n = ticks.length || 1;
  return stamp({
    n_ticks: ticks.length,
    critical_rate: round3(critical / n),
    pause_seletiva_rate: round3(pause_sel / n),
    pause_geral_rate: round3(pause_gen / n),
    observe_rate: round3(observe / n),
    exception_rate: round3(ex / n),
    low_confidence_rate: round3(low_conf / n),
    by_dow: byDow,
    by_hour: byHour,
    // sem ground-truth de "turno crítico" externo → não inventar recall
    detection_vs_external_label: "nao_verificavel_sem_rotulo_externo",
    false_alert_rate: "nao_verificavel_sem_rotulo_externo"
  });
}

/**
 * Testa pesos de carga levemente — escolhe configuração estável, não só melhor fit.
 */
function calibrateWeights(byOrder, opts) {
  const base = CV.loadDefaultConfig();
  const variants = [
    { id: "default", pesos: base.pesos_carga },
    { id: "complexity_heavy", pesos: { quantidade: 0.7, complexidade: 1.4, urgencia: 1.1, concentracao: 1.0, dependencias: 1.1 } },
    { id: "urgency_heavy", pesos: { quantidade: 0.9, complexidade: 1.0, urgencia: 1.5, concentracao: 1.0, dependencias: 1.0 } },
    { id: "balanced_soft", pesos: { quantidade: 1.0, complexidade: 1.1, urgencia: 1.1, concentracao: 0.9, dependencias: 0.9 } }
  ];

  const results = [];
  for (const v of variants) {
    const cfg = JSON.parse(JSON.stringify(base));
    cfg.pesos_carga = v.pesos;
    cfg.config_version = `cv-cal-${v.id}`;
    const rep = replayOrders(byOrder, {
      config: cfg,
      interval_min: (opts && opts.interval_min) || 5,
      team_profile: (opts && opts.team_profile) || "estrutura_media",
      from: opts && opts.from,
      to: opts && opts.to
    });
    if (!rep.ok) {
      results.push({ id: v.id, error: rep.error });
      continue;
    }
    const split = splitTicks(rep.ticks, { cal_ratio: 0.67 });
    const calScore = scoreShadow(split.cal);
    const valScore = scoreShadow(split.val);
    // estabilidade = diferença absoluta de critical_rate cal vs val (menor = melhor generalização)
    const stability = Math.abs(calScore.critical_rate - valScore.critical_rate);
    results.push({
      id: v.id,
      pesos: v.pesos,
      cal: calScore,
      val: valScore,
      stability_gap: round3(stability),
      pause_geral_val: valScore.pause_geral_rate,
      // penaliza overfitting: gap grande ou pause_geral excessiva
      selection_score: round3(stability + valScore.pause_geral_rate * 2)
    });
  }

  results.sort((a, b) => (a.selection_score != null ? a.selection_score : 99) - (b.selection_score != null ? b.selection_score : 99));
  const recommended = results[0];

  const recommendedConfig = JSON.parse(JSON.stringify(base));
  if (recommended && recommended.pesos) {
    recommendedConfig.pesos_carga = recommended.pesos;
    recommendedConfig.config_version = `cv-cal-${recommended.id}-v1`;
    recommendedConfig.calibration = {
      labels: ["CALIBRAÇÃO", "MODO SOMBRA", "NÃO OPERACIONAL"],
      selected_variant: recommended.id,
      selection_rule: "minimiza gap cal/val + penaliza pausa geral em validação (anti-overfit)",
      at: new Date().toISOString()
    };
  }

  return stamp({
    variants: results,
    recommended: recommended,
    recommended_config: recommendedConfig,
    split_policy: "67% dias calibração / 33% validação por ordem cronológica de dias UTC",
    overfitting_guard: true
  });
}

function persistConfig(config, outDir, name) {
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, name || `config-${config.config_version || "cal"}.json`);
  fs.writeFileSync(file, JSON.stringify(config, null, 2), "utf8");
  return file;
}

function round3(x) {
  return Math.round(Number(x) * 1000) / 1000;
}

/**
 * Hipóteses temporais — validar ou refutar com contagens (não forçar).
 */
function evaluateTemporalHypotheses(ticks) {
  const byDow = {};
  const byHour = {};
  for (const t of ticks) {
    // Prefer America/Sao_Paulo fields from replay; fallback UTC with caveat
    const dow = t.local_dow != null ? t.local_dow : new Date(t.t_ms || t.t).getUTCDay();
    const hour = t.local_hour != null ? t.local_hour : new Date(t.t_ms || t.t).getUTCHours();
    byDow[dow] = byDow[dow] || { n: 0, critical: 0, active_sum: 0 };
    byHour[hour] = byHour[hour] || { n: 0, critical: 0, active_sum: 0 };
    byDow[dow].n++;
    byHour[hour].n++;
    byDow[dow].active_sum += t.active_orders || 0;
    byHour[hour].active_sum += t.active_orders || 0;
    const crit =
      t.tick_class && t.tick_class.has_critical
        ? true
        : t.shadow && (t.shadow.estado === "excecao_critica" || t.shadow.estado === "atencao" && t.shadow.excecao_critica);
    if (crit) {
      byDow[dow].critical++;
      byHour[hour].critical++;
    }
  }

  function avgActive(map, keys) {
    let n = 0;
    let s = 0;
    for (const k of keys) {
      if (!map[k]) continue;
      n += map[k].n;
      s += map[k].active_sum;
    }
    return n ? s / n : null;
  }

  const monTue = avgActive(byDow, [1, 2]);
  const wedThu = avgActive(byDow, [3, 4]);
  const friSun = avgActive(byDow, [5, 0]);
  const sat = avgActive(byDow, [6]);
  const h1921 = avgActive(byHour, [19, 20]);
  const hOther = avgActive(byHour, [12, 13, 14, 15, 16, 17, 18, 21, 22]);

  const hyp = [];
  hyp.push(hypResult("segunda_terca_mais_fracas", monTue != null && friSun != null ? monTue < friSun : null, { monTue, friSun }));
  hyp.push(hypResult("quarta_quinta_intermediarias", monTue != null && wedThu != null && friSun != null ? monTue <= wedThu && wedThu <= friSun : null, { monTue, wedThu, friSun }));
  hyp.push(hypResult("sexta_domingo_mais_movimentadas", friSun != null && monTue != null ? friSun >= monTue : null, { friSun, monTue }));
  hyp.push(hypResult("sabado_imprevisivel", sat != null, { sat, note: "imprevisibilidade requer variância multi-sábado; amostra limitada" }));
  hyp.push(hypResult("19h_21h_mais_sensivel", h1921 != null && hOther != null ? h1921 > hOther : null, { h1921, hOther }));

  return stamp({
    by_dow: byDow,
    by_hour: byHour,
    hypotheses: hyp,
    timezone: "America/Sao_Paulo",
    caveat: "Buckets usam local_hour/local_dow quando presentes no replay"
  });
}

function hypResult(id, confirmed, evidence) {
  let status = "nao_verificavel";
  if (confirmed === true) status = "confirmada";
  if (confirmed === false) status = "refutada";
  return { id, status, evidence };
}

module.exports = {
  splitTicks,
  scoreShadow,
  calibrateWeights,
  persistConfig,
  evaluateTemporalHypotheses
};
