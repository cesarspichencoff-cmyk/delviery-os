/**
 * Gera os 30 cenários canônicos + index.
 * node mocks/copiloto/generate-fixtures.js
 */
"use strict";

const fs = require("fs");
const path = require("path");
const {
  baselines,
  thresholds,
  forecast,
  anomalies,
  focus,
  stability,
  response,
  closing,
  briefing,
  memory,
  playbooks,
  shadow,
  silence
} = require("../../src/copiloto");

const OUT = path.join(__dirname, "fixtures", "scenarios");
fs.mkdirSync(OUT, { recursive: true });

const hist = baselines.generateSyntheticHistory({ days: 28, seed: 7 });
const bl = baselines.buildBaselines(hist);

function area(id, overrides) {
  const labels = {
    sushi: "Sushi",
    quentes: "Quentes",
    cozinha: "Cozinha",
    conferencia: "Conferência",
    motoboy: "Motoboy",
    caixa: "Caixa"
  };
  return {
    label: labels[id] || id,
    queue_depth: 2,
    median_dwell_min: 12,
    baseline_dwell: 12,
    pressure_level: "normal",
    trend: "stable",
    volume_trend: "stable",
    dwell_trend: "stable",
    confidence: "media",
    open_orders: [],
    ...overrides
  };
}

function baseState(overrides) {
  return {
    technical_state: "healthy",
    areas: {
      sushi: area("sushi"),
      quentes: area("quentes"),
      cozinha: area("cozinha"),
      conferencia: area("conferencia"),
      motoboy: area("motoboy"),
      caixa: area("caixa", { confidence: "baixa", data_quality: "incomplete" })
    },
    orders: [],
    ...overrides
  };
}

function enrich(state) {
  // pressures
  for (const [id, a] of Object.entries(state.areas)) {
    const p = thresholds.classifyPressure(id, {
      queue_depth: a.queue_depth,
      median_dwell_min: a.median_dwell_min,
      confidence: a.confidence,
      data_quality: a.data_quality || "ok",
      persistence_min: a.persistence_min ?? 5
    });
    a.pressure_level = a.pressure_level_forced || p.level;
    a.severity = p.severity;
    a.pressure_meta = p;
  }
  state.anomalies = anomalies.detectAnomalies(state);
  const cands = focus.candidatesFromSnapshot(state);
  state.focus_selection = focus.selectFocus(cands, { technical_state: state.technical_state });
  return state;
}

const scenarios = [];

function add(id, name, build) {
  const payload = build();
  scenarios.push({ id, name, file: `${String(id).padStart(2, "0")}_${name}.json`, payload });
}

// 1 calma
add(1, "operacao_calma", () => {
  const s = enrich(baseState());
  return { scenario: "operacao_calma", state: s, focus: s.focus_selection, mode: "calmo" };
});

// 2 sushi atenção
add(2, "sushi_atencao", () => {
  const s = enrich(
    baseState({
      areas: {
        sushi: area("sushi", { queue_depth: 13, median_dwell_min: 19, pressure_level_forced: "attention", trend: "worsening" }),
        quentes: area("quentes"),
        cozinha: area("cozinha"),
        conferencia: area("conferencia"),
        motoboy: area("motoboy"),
        caixa: area("caixa", { confidence: "baixa" })
      }
    })
  );
  return { scenario: "sushi_atencao", state: s, focus: s.focus_selection };
});

// 3 quentes pressão
add(3, "quentes_pressao", () => {
  const s = enrich(
    baseState({
      areas: {
        sushi: area("sushi", { queue_depth: 6 }),
        quentes: area("quentes", {
          queue_depth: 11,
          median_dwell_min: 26,
          pressure_level_forced: "pressure",
          trend: "worsening",
          open_orders: ["184", "191"]
        }),
        cozinha: area("cozinha"),
        conferencia: area("conferencia"),
        motoboy: area("motoboy"),
        caixa: area("caixa", { confidence: "baixa" })
      }
    })
  );
  return { scenario: "quentes_pressao", state: s, focus: s.focus_selection };
});

// 4 conferencia
add(4, "conferencia_acumulando", () => {
  const s = enrich(
    baseState({
      areas: {
        sushi: area("sushi", { queue_depth: 5, pressure_level_forced: "normal", trend: "stable" }),
        quentes: area("quentes"),
        cozinha: area("cozinha"),
        conferencia: area("conferencia", {
          queue_depth: 8,
          median_dwell_min: 18,
          pressure_level_forced: "pressure",
          open_orders: ["184", "191", "203", "210", "215"]
        }),
        motoboy: area("motoboy", { queue_depth: 2 }),
        caixa: area("caixa", { confidence: "baixa" })
      },
      orders: [
        { order_id: "184", item_count: 7, wait_min: 28, delay_min: 4 },
        { order_id: "191", item_count: 9, wait_min: 31, delay_min: 6 }
      ]
    })
  );
  const resp = response.buildResponse({
    conclusion: "A Conferência merece atenção",
    evidence: ["Cinco pedidos estão aguardando", "dois estão próximos do prazo"],
    impact: "Mantido o ritmo atual, outros três podem acumular nos próximos quinze minutos.",
    confidence: "media",
    recommendation: "verificar primeiro os pedidos 184 e 191."
  });
  return { scenario: "conferencia_acumulando", state: s, focus: s.focus_selection, copilot_response: resp };
});

// 5 motoboy
add(5, "motoboy_acumulando", () => {
  const s = enrich(
    baseState({
      areas: {
        sushi: area("sushi"),
        quentes: area("quentes"),
        cozinha: area("cozinha"),
        conferencia: area("conferencia", { queue_depth: 3 }),
        motoboy: area("motoboy", {
          queue_depth: 7,
          median_dwell_min: 36,
          pressure_level_forced: "pressure",
          available_couriers: 0,
          ready_orders: 7
        }),
        caixa: area("caixa", { confidence: "baixa" })
      },
      ready_without_courier: 7
    })
  );
  return { scenario: "motoboy_acumulando", state: s, focus: s.focus_selection };
});

// 6 risco erro
add(6, "pedido_risco_erro", () => {
  const s = enrich(baseState());
  s.orders = [{ order_id: "184", item_count: 12, wait_min: 22, order_type: "combo", risk_error: true, observacao: "sem cebolinha" }];
  s.anomalies = anomalies.detectAnomalies(s);
  return { scenario: "pedido_risco_erro", state: s, note: "Priorizar conferência dirigida — não é vigilância" };
});

// 7 duas pressões
add(7, "duas_pressoes", () => {
  const s = enrich(
    baseState({
      areas: {
        sushi: area("sushi", { queue_depth: 14, pressure_level_forced: "pressure", median_dwell_min: 22 }),
        quentes: area("quentes", { queue_depth: 10, pressure_level_forced: "pressure", median_dwell_min: 24 }),
        cozinha: area("cozinha"),
        conferencia: area("conferencia"),
        motoboy: area("motoboy"),
        caixa: area("caixa", { confidence: "baixa" })
      }
    })
  );
  return { scenario: "duas_pressoes", state: s, focus: s.focus_selection };
});

// 8 três pressões
add(8, "tres_pressoes", () => {
  const s = enrich(
    baseState({
      areas: {
        sushi: area("sushi", { queue_depth: 15, pressure_level_forced: "pressure" }),
        quentes: area("quentes", { queue_depth: 11, pressure_level_forced: "pressure" }),
        cozinha: area("cozinha"),
        conferencia: area("conferencia", { queue_depth: 9, pressure_level_forced: "pressure" }),
        motoboy: area("motoboy"),
        caixa: area("caixa", { confidence: "baixa" })
      }
    })
  );
  return { scenario: "tres_pressoes", state: s, focus: s.focus_selection };
});

// 9 foco muda legitimamente
add(9, "foco_mudanca_legitima", () => {
  const sess = stability.createFocusSession();
  const f1 = {
    focus_id: "f_sushi",
    area: "sushi",
    title: "Sushi em pressão",
    severity: 2,
    urgency: 2,
    reach: 10,
    confidence: "media",
    priority_score: 20
  };
  let r = stability.stabilize(sess, f1, { t_min: 0 });
  r = stability.stabilize(sess, f1, { t_min: 1 });
  const f2 = {
    focus_id: "f_moto",
    area: "motoboy",
    title: "Saída crítica",
    severity: 3,
    urgency: 3,
    reach: 8,
    confidence: "alta",
    priority_score: 40
  };
  r = stability.stabilize(sess, f2, { t_min: 5 });
  return { scenario: "foco_mudanca_legitima", steps: ["activate_sushi", "critical_switch_motoboy"], result: r, session: sess };
});

// 10 foco protegido
add(10, "foco_protegido_oscilacao", () => {
  const sess = stability.createFocusSession();
  const f1 = {
    focus_id: "f_conf",
    area: "conferencia",
    title: "Conferência",
    severity: 2,
    urgency: 2,
    reach: 6,
    confidence: "media",
    priority_score: 22
  };
  stability.stabilize(sess, f1, { t_min: 0 });
  stability.stabilize(sess, f1, { t_min: 1 });
  const rival = {
    focus_id: "f_sushi",
    area: "sushi",
    title: "Sushi",
    severity: 2,
    urgency: 1,
    reach: 5,
    confidence: "media",
    priority_score: 23
  };
  const r = stability.stabilize(sess, rival, { t_min: 3 });
  return { scenario: "foco_protegido_oscilacao", result: r, expect_action: "keep", session: sess };
});

// 11-12 forecast
add(11, "previsao_10min", () => {
  const series = [3, 4, 4, 5, 6, 6, 7, 8, 8, 9, 10, 11];
  const f = forecast.forecastArea({
    area: "conferencia",
    queue_history: series,
    dwell_history: series.map((x) => x + 8),
    baselines: bl,
    dow: 5,
    hour: 19,
    horizon_min: 10
  });
  return { scenario: "previsao_10min", forecast: f };
});

add(12, "previsao_30min", () => {
  const series = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
  const f = forecast.forecastArea({
    area: "sushi",
    queue_history: series,
    baselines: bl,
    dow: 5,
    hour: 19,
    horizon_min: 30
  });
  return { scenario: "previsao_30min", forecast: f };
});

// 13 anomalia
add(13, "anomalia", () => {
  const s = enrich(
    baseState({
      areas: {
        sushi: area("sushi", { queue_depth: 5, volume_trend: "stable", dwell_trend: "worsening", median_dwell_min: 22, baseline_dwell: 14 }),
        quentes: area("quentes", { queue_depth: 12 }),
        cozinha: area("cozinha"),
        conferencia: area("conferencia", { queue_depth: 6 }),
        motoboy: area("motoboy"),
        caixa: area("caixa", { confidence: "baixa" })
      }
    })
  );
  return { scenario: "anomalia", anomalies: s.anomalies };
});

// 14 incompleto
add(14, "dado_incompleto", () => {
  const p = thresholds.classifyPressure("caixa", {
    queue_depth: 3,
    median_dwell_min: 12,
    confidence: "baixa",
    data_quality: "incomplete",
    persistence_min: 5
  });
  return { scenario: "dado_incompleto", pressure: p, technical_state: "degraded" };
});

// 15 atrasado
add(15, "dado_atrasado", () => {
  const p = thresholds.classifyPressure("sushi", {
    queue_depth: 10,
    median_dwell_min: 20,
    confidence: "baixa",
    data_quality: "stale",
    persistence_min: 5
  });
  return { scenario: "dado_atrasado", pressure: p, technical_state: "degraded" };
});

// 16 conexão perdida
add(16, "conexao_perdida", () => {
  const s = enrich(baseState({ technical_state: "failed", technical_detail: "fonte desconectada" }));
  const sess = stability.createFocusSession();
  sess.active = { focus_id: "x", area: "sushi", severity: 2, priority_score: 20 };
  const r = stability.stabilize(sess, null, { t_min: 10, technical_state: "failed" });
  return { scenario: "conexao_perdida", state: s, focus_result: r };
});

// 17 falha técnica
add(17, "falha_tecnica", () => {
  const s = baseState({
    technical_state: "failed",
    source_mismatch: { detail: "live vs export", evidence: [{ k: "delta_orders", v: 12 }] }
  });
  s.anomalies = anomalies.detectAnomalies(s);
  const sil = silence.classifyInterruption({ kind: "technical_failure", severity: 2, confidence: "alta" }, silence.createSilenceState(), 0);
  return { scenario: "falha_tecnica", anomalies: s.anomalies, silence: sil };
});

// 18-20 recomendações
add(18, "recomendacao_aceita", () => ({
  scenario: "recomendacao_aceita",
  recommendation: { id: "r1", label: "Priorizar Conferência" },
  human_decision: { status: "accepted", at: "2026-07-01T20:10:00Z" },
  outcome: { recovered: true, recovery_min: 8 }
}));

add(19, "recomendacao_adaptada", () => ({
  scenario: "recomendacao_adaptada",
  recommendation: { id: "r2", label: "Chamar motoboy" },
  human_decision: { status: "adapted", note: "Chamou e agrupou rotas", at: "2026-07-01T20:12:00Z" },
  outcome: { recovered: true, recovery_min: 12 }
}));

add(20, "recomendacao_ignorada", () => ({
  scenario: "recomendacao_ignorada",
  recommendation: { id: "r3", label: "Priorizar Quentes" },
  human_decision: { status: "ignored", at: "2026-07-01T20:15:00Z" },
  outcome: { recovered: false, pressure_increased: true }
}));

// 21-23 ação
add(21, "acao_resolveu", () => ({
  scenario: "acao_resolveu",
  action: { type: "priorizar_praca", area: "quentes" },
  before: { pressure_level: "pressure" },
  after: { pressure_level: "normal" },
  side_effects: []
}));

add(22, "acao_nao_resolveu", () => ({
  scenario: "acao_nao_resolveu",
  action: { type: "chamar_motoboy" },
  before: { pressure_level: "pressure" },
  after: { pressure_level: "pressure" },
  side_effects: []
}));

add(23, "efeito_colateral", () => ({
  scenario: "efeito_colateral",
  action: { type: "priorizar_praca", area: "sushi" },
  before: { sushi: "pressure", quentes: "normal" },
  after: { sushi: "attention", quentes: "pressure" },
  side_effects: ["Quentes subiu de pressão após priorizar só Sushi"]
}));

// 24 briefing
add(24, "briefing", () => {
  const b = briefing.buildBriefing({
    dow: 5,
    hour: 17,
    expected_peak_hour: 19,
    primary_risk_area: "conferencia",
    queue_history: [3, 4, 5, 5, 6, 7],
    baselines: bl,
    learnings: [{ text: "Na sexta passada, Conferência acumulou antes do jantar." }],
    external_signals: { rain: false }
  });
  return { scenario: "briefing", briefing: b };
});

// 25-27 fechamento
add(25, "fechamento_sem_perguntas", () => {
  const mem = memory.createShiftMemory({
    shift_id: "s_calm",
    volume: { orders: 40, items: 120 },
    pressures: [],
    actions: [],
    unexplained: []
  });
  return { scenario: "fechamento_sem_perguntas", closing: closing.buildClosing(mem) };
});

add(26, "fechamento_uma_pergunta", () => {
  const mem = memory.createShiftMemory({
    shift_id: "s1",
    pressures: [{ area: "conferencia", level: "pressure" }],
    unexplained: [
      {
        id: "u1",
        observation: "Pressão em Conferência caiu em 6 min sem evento automático",
        unknown: "Ação manual de apoio",
        question: "Houve apoio extra na Conferência?",
        why_it_helps: "Liga resultado a playbook",
        info_gain: 0.8,
        importance: 0.9
      }
    ]
  });
  return { scenario: "fechamento_uma_pergunta", closing: closing.buildClosing(mem) };
});

add(27, "fechamento_tres_perguntas", () => {
  const mem = memory.createShiftMemory({
    shift_id: "s3",
    pressures: [{ area: "quentes" }, { area: "motoboy" }],
    unexplained: [
      { id: "u1", observation: "Quentes piorou sem volume", unknown: "causa", question: "O que travou Quentes?", info_gain: 0.9, importance: 0.9 },
      { id: "u2", observation: "Saída lenta", unknown: "motoboy", question: "Faltou motoboy ou houve atraso de atribuição?", info_gain: 0.85, importance: 0.85 },
      { id: "u3", observation: "Pico 20h", unknown: "promo", question: "Havia promoção não registrada?", info_gain: 0.7, importance: 0.7 },
      { id: "u4", observation: "menor", unknown: "x", question: "Ignorar?", info_gain: 0.2, importance: 0.2 }
    ],
    equipment_suspect: { observation: "Tempos de fritura alongados" }
  });
  return { scenario: "fechamento_tres_perguntas", closing: closing.buildClosing(mem) };
});

// 28 voz
add(28, "voz", () => {
  const resp = response.exampleConferenceResponse();
  return {
    scenario: "voz",
    intent: "state.biggest_problem",
    response: resp,
    audio_short: response.buildResponse({
      conclusion: resp.conclusion,
      evidence: resp.evidence,
      recommendation: resp.recommendation,
      confidence: resp.confidence
    }).audio
  };
});

// 29 sombra
add(29, "modo_sombra", () => {
  const log = shadow.createShadowLog({
    level: 1,
    situation: "conferencia_pressure",
    reading: "pressure",
    would_choose_focus: { area: "conferencia" },
    recommendation: { label: "Conferir 184 e 191" },
    real_decision: { label: "Conferiu 184" },
    outcome: { recovered: true },
    correct: true
  });
  const promo = shadow.canPromote(1, { shadow_hours: 5, human_review_approved: false });
  return { scenario: "modo_sombra", log, promotion_gate: promo };
});

// 30 aprendizado
add(30, "aprendizado", () => {
  const mem = memory.createShiftMemory({ shift_id: "learn1" });
  memory.addEntry(mem, {
    kind: "report",
    epistemic: "human_report",
    payload: { text: "Fritadeira parou 12 min", equipment: "fritadeira" },
    confidence: "alta"
  });
  memory.addEntry(mem, {
    kind: "outcome",
    epistemic: "fact",
    payload: { area: "quentes", recovery_min: 15 },
    confidence: "alta"
  });
  return {
    scenario: "aprendizado",
    memory: mem,
    separated: memory.separateEpistemics(mem),
    playbooks: playbooks.SEED_PLAYBOOKS.map((p) => p.playbook_id)
  };
});

const index = [];
for (const sc of scenarios) {
  const fp = path.join(OUT, sc.file);
  fs.writeFileSync(fp, JSON.stringify(sc.payload, null, 2), "utf8");
  index.push({ id: sc.id, name: sc.name, file: sc.file });
  console.log("wrote", sc.file);
}

fs.writeFileSync(path.join(__dirname, "fixtures", "index.json"), JSON.stringify({ count: index.length, scenarios: index }, null, 2));
fs.writeFileSync(
  path.join(__dirname, "fixtures", "baselines_synthetic.json"),
  JSON.stringify({ source: "synthetic_calibrated", areas: Object.keys(bl), sample: bl.sushi && bl.sushi[0] }, null, 2)
);
console.log("done", index.length);
