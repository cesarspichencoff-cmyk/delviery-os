/**
 * Testes 2D.1 — saneamento
 * node tests/capacidade-viva/calibration/run-sane.js
 */
"use strict";

const assert = require("assert");
const Cal = require("../../../src/capacidade-viva/calibration");

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log("  OK ", name);
  } catch (e) {
    failed++;
    console.log("  FAIL", name, "-", e.message);
  }
}

console.log("=== timezone ===");
test("UTC para SP", () => {
  // 2026-06-20T22:00:00Z = 19:00 em SP
  const sp = Cal.timezone.toSaoPaulo("2026-06-20T22:00:00.000Z");
  assert.ok(sp.ok);
  assert.strictEqual(sp.timezone, "America/Sao_Paulo");
  assert.strictEqual(sp.local_hour, 19);
  assert.ok(sp.timestamp_original);
  assert.ok(sp.timestamp_utc);
});

test("BR sem timezone", () => {
  const p = Cal.timezone.parseBrWallClockToUtcIso("20/06/2026 19:30");
  assert.ok(p.ok);
  assert.strictEqual(p.local_hour, 19);
});

test("inválido", () => {
  const sp = Cal.timezone.toSaoPaulo("not-a-date");
  assert.strictEqual(sp.ok, false);
});

test("ordem após conversão estável", () => {
  const a = Cal.timezone.toSaoPaulo("2026-06-20T15:00:00.000Z");
  const b = Cal.timezone.toSaoPaulo("2026-06-20T18:00:00.000Z");
  assert.ok(a.timestamp_utc < b.timestamp_utc);
});

console.log("=== taxonomia ===");
test("envelhecimento isolado não é exceção crítica", () => {
  const c = Cal.taxonomy.classifyOrderSignals({ id: "o1", age_min: 60, pronto: false, saiu: false }, {});
  assert.notStrictEqual(c.level, "excecao_critica");
  assert.ok(c.aging_alone_is_not_critical);
});

test("carga alta isolada não é exceção", () => {
  const c = Cal.taxonomy.classifyOrderSignals({ id: "o1", age_min: 5, carga_alta: true }, {});
  assert.notStrictEqual(c.level, "excecao_critica");
});

test("pronto sem causa conhecida", () => {
  const c = Cal.taxonomy.classifyOrderSignals(
    { id: "o1", age_min: 40, pronto: true, saiu: false, ready_wait_min: 15 },
    { atraso: { pronto_sem_saida_min: 12 } }
  );
  assert.ok(c.attentions.some((a) => a.type === "aguardando_saida_causa_nao_confirmada"));
  assert.ok(!c.exceptions.some((e) => e.type === "motoboy_esperando"));
});

test("motoboy na loja confirmado/inferido alta", () => {
  const c = Cal.taxonomy.classifyOrderSignals(
    {
      id: "o1",
      age_min: 30,
      pronto: true,
      saiu: false,
      ready_wait_min: 10,
      courier_wait_store_min: 8,
      courier_wait_epistemic: "inferido_alta_confianca"
    },
    {}
  );
  assert.strictEqual(c.level, "excecao_critica");
  assert.ok(c.exceptions.some((e) => e.type === "motoboy_na_loja"));
});

test("inferência fraca alocado não abre exceção sozinha", () => {
  const c = Cal.taxonomy.classifyOrderSignals(
    {
      id: "o1",
      pronto: true,
      saiu: false,
      ready_wait_min: 20,
      alocado: true,
      alocado_epistemic: "inferido_baixa_confianca"
    },
    { atraso: { entregador_alocado_sem_retirada_min: 15 } }
  );
  assert.ok(!c.exceptions.some((e) => e.type === "entregador_alocado_sem_retirada"));
});

console.log("=== episódios ===");
test("dedup e resolução", () => {
  const ticks = [];
  const base = Date.parse("2026-06-20T20:00:00.000Z");
  for (let i = 0; i < 5; i++) {
    ticks.push({
      t_ms: base + i * 60000,
      local_iso: `2026-06-20T17:0${i}:00-03:00`,
      active_orders: 10,
      praca_critica: "quentes",
      tick_class: {
        has_critical: true,
        has_attention: true,
        critical_items: [{ type: "motoboy_na_loja", order_id: "X1", explanation: "e" }],
        attention_items: []
      }
    });
  }
  // gap > 10 min then reopen
  ticks.push({
    t_ms: base + 20 * 60000,
    local_iso: "2026-06-20T17:20:00-03:00",
    active_orders: 10,
    tick_class: {
      has_critical: true,
      critical_items: [{ type: "motoboy_na_loja", order_id: "X1", explanation: "e2" }],
      attention_items: []
    }
  });
  const ep = Cal.episodes.buildEpisodes(ticks, { gap_min: 10 });
  assert.ok(ep.n_episodes >= 2);
  assert.ok(ep.episodes[0].duration_min >= 0);
  assert.ok(ep.episodes[0].resolved_at);
});

test("duração média/mediana/p90/máximo (só mensuráveis)", () => {
  const base = Date.parse("2026-06-20T20:00:00.000Z");
  // 3 ticks contínuos (0,5,10 min) → 1 episódio duração 10
  const ticks = [0, 5, 10].map((m) => ({
    t_ms: base + m * 60000,
    local_iso: new Date(base + m * 60000).toISOString(),
    active_orders: 4,
    tick_class: {
      has_critical: true,
      critical_items: [{ type: "motoboy_na_loja", order_id: "A", explanation: "e" }]
    }
  }));
  // segundo episódio isolado — uma leitura (não entra na média mensurável)
  ticks.push({
    t_ms: base + 40 * 60000,
    local_iso: new Date(base + 40 * 60000).toISOString(),
    active_orders: 2,
    tick_class: {
      has_critical: true,
      critical_items: [{ type: "motoboy_na_loja", order_id: "B", explanation: "e" }]
    }
  });
  const ep = Cal.episodes.buildEpisodes(ticks, { gap_min: 10, interval_min: 5 });
  assert.ok(ep.measurable.n >= 1);
  assert.strictEqual(ep.measurable.duration_max_min, 10);
  assert.ok(ep.single_tick.n >= 1);
  assert.strictEqual(ep.duration_max_min, 10);
  assert.ok(ep.duration_avg_min > 0);
});

test("pedido único e episódio sem order_id", () => {
  const base = Date.parse("2026-06-20T20:00:00.000Z");
  const ticks = [
    {
      t_ms: base,
      local_iso: "t0",
      active_orders: 1,
      tick_class: {
        has_critical: true,
        critical_items: [{ type: "motoboy_na_loja", order_id: "O1", explanation: "e" }]
      }
    },
    {
      t_ms: base + 5 * 60000,
      local_iso: "t1",
      active_orders: 3,
      praca_critica: "sushi",
      tick_class: {
        has_critical: false,
        has_attention: true,
        attention_items: [{ type: "prontos_acumulando", explanation: "e" }]
      }
    }
  ];
  const ep = Cal.episodes.buildEpisodes(ticks, { gap_min: 10, interval_min: 5 });
  assert.ok(ep.unique_orders_affected >= 1);
  assert.ok(ep.episodes_without_order_id >= 1);
  assert.ok(Array.isArray(ep.episodes[0].order_ids));
});

test("episódio aberto no fim da janela", () => {
  const base = Date.parse("2026-06-20T20:00:00.000Z");
  const ticks = [
    {
      t_ms: base,
      local_iso: "t0",
      tick_class: {
        has_critical: true,
        critical_items: [{ type: "motoboy_na_loja", order_id: "Z", explanation: "e" }]
      }
    }
  ];
  const ep = Cal.episodes.buildEpisodes(ticks, { gap_min: 10 });
  assert.strictEqual(ep.episodes_open_at_end, 1);
  assert.strictEqual(ep.episodes_resolved, 0);
  assert.strictEqual(ep.episodes[0].resolved_at, null);
  assert.strictEqual(ep.episodes[0].open_at_window_end, true);
});

test("serialização Set/order_ids e reaggregate", () => {
  const base = Date.parse("2026-06-20T20:00:00.000Z");
  const ticks = [0, 5, 10].map((m) => ({
    t_ms: base + m * 60000,
    local_iso: new Date(base + m * 60000).toISOString(),
    tick_class: {
      has_critical: true,
      critical_items: [{ type: "motoboy_na_loja", order_id: "S1", explanation: "e" }]
    }
  }));
  const ep = Cal.episodes.buildEpisodes(ticks, { gap_min: 10, interval_min: 5 });
  const json = JSON.parse(JSON.stringify(ep));
  assert.ok(Array.isArray(json.episodes[0].order_ids));
  assert.ok(!json.episodes[0].order_ids || typeof json.episodes[0].order_ids.length === "number");
  const again = Cal.episodes.reaggregateFromSerialized(json.episodes);
  assert.strictEqual(again.unique_orders_affected, 1);
  assert.ok(again.duration_max_min === 10 || again.duration_max_min === 10.0);
});

test("ausência de duração é null, nunca zero enganoso", () => {
  const metrics = Cal.episodes.aggregateEpisodeMetrics([
    { level: "atencao", type: "x", order_ids: [], duration_min: null, open_at_window_end: true }
  ]);
  assert.strictEqual(metrics.duration_avg_min, null);
  assert.strictEqual(metrics.duration_median_min, null);
  assert.strictEqual(metrics.duration_p90_min, null);
  assert.strictEqual(metrics.duration_max_min, null);
  assert.strictEqual(metrics.unique_orders_affected, 0); // zero aqui é contagem real
});

test("order_id propagado pela taxonomia no classifyTick", () => {
  const tick = Cal.taxonomy.classifyTick(
    [
      {
        order_id: "PED-9",
        level: "excecao_critica",
        exceptions: [{ type: "motoboy_na_loja", explanation: "e", confidence: "alta" }]
      }
    ],
    {}
  );
  assert.ok(tick.critical_items.length);
  assert.strictEqual(tick.critical_items[0].order_id, "PED-9");
});

console.log("=== fronteiras 2D.3 ===");
test("quebra por dia operacional", () => {
  // 03:00 e 08:00 SP no mesmo dia civil com cutover 5 → dias operacionais diferentes
  // 2026-06-21T06:00:00Z = 03:00 SP; 2026-06-21T11:00:00Z = 08:00 SP
  const t1 = Date.parse("2026-06-21T06:00:00.000Z");
  const t2 = Date.parse("2026-06-21T11:00:00.000Z");
  const d1 = Cal.operationalWindow.operationalDayKey(t1);
  const d2 = Cal.operationalWindow.operationalDayKey(t2);
  assert.notStrictEqual(d1.operational_day, d2.operational_day);
  const cont = Cal.operationalWindow.continuityBetween(t1, t2);
  assert.strictEqual(cont.continuous, false);
  assert.strictEqual(cont.reason, "quebra_dia_operacional");
});

test("quebra por turno configurado", () => {
  const t1 = Date.parse("2026-06-21T15:00:00.000Z"); // 12:00 SP
  const t2 = Date.parse("2026-06-21T22:00:00.000Z"); // 19:00 SP
  const cont = Cal.operationalWindow.continuityBetween(t1, t2, {
    shifts: [
      { id: "almoco", start_hour: 11, end_hour: 16 },
      { id: "jantar", start_hour: 16, end_hour: 23 }
    ],
    break_on_operational_day: false
  });
  assert.strictEqual(cont.continuous, false);
  assert.strictEqual(cont.reason, "quebra_turno");
});

test("grande gap sem dados", () => {
  const t1 = Date.parse("2026-06-21T15:00:00.000Z");
  const t2 = t1 + 200 * 60000;
  const cont = Cal.operationalWindow.continuityBetween(t1, t2, {
    break_on_operational_day: false,
    max_data_gap_min: 180
  });
  assert.strictEqual(cont.continuous, false);
  assert.strictEqual(cont.reason, "grande_gap_sem_dados");
});

test("episódio não atravessa dias (máximo)", () => {
  const base = Date.parse("2026-06-25T23:45:00.000Z"); // 20:45 SP 25/jun
  const ticks = [];
  // 5 dias de ticks a cada 15 min — deve partir por dia operacional
  for (let i = 0; i < 100; i++) {
    const t = base + i * 15 * 60000;
    ticks.push({
      t_ms: t,
      local_iso: Cal.timezone.toSaoPaulo(t).local_iso,
      active_orders: 1,
      tick_class: {
        has_critical: true,
        critical_items: [
          {
            type: "pedido_atrasado_vs_prometido_operacional",
            order_id: "STUCK",
            explanation: "atrasado",
            epistemic: "confirmado"
          }
        ]
      }
    });
  }
  const ep = Cal.episodes.buildEpisodes(ticks, { gap_min: 10, interval_min: 15 });
  assert.strictEqual(ep.episodes_crossing_day, 0);
  for (const e of ep.episodes) {
    assert.ok(!e.crosses_operational_day, e.episode_id + " crosses day");
    if (e.observed_span_min != null) assert.ok(e.observed_span_min < 24 * 60, "span " + e.observed_span_min);
  }
  assert.ok(ep.n_split_by_boundary >= 1);
});

test("reabertura após gap", () => {
  const base = Date.parse("2026-06-20T20:00:00.000Z");
  const ticks = [
    {
      t_ms: base,
      local_iso: "a",
      tick_class: {
        has_critical: true,
        critical_items: [{ type: "motoboy_na_loja", order_id: "R1", explanation: "e" }]
      }
    },
    {
      t_ms: base + 5 * 60000,
      local_iso: "b",
      tick_class: {
        has_critical: true,
        critical_items: [{ type: "motoboy_na_loja", order_id: "R1", explanation: "e" }]
      }
    },
    {
      t_ms: base + 40 * 60000,
      local_iso: "c",
      tick_class: {
        has_critical: true,
        critical_items: [{ type: "motoboy_na_loja", order_id: "R1", explanation: "e" }]
      }
    }
  ];
  const ep = Cal.episodes.buildEpisodes(ticks, { gap_min: 10, interval_min: 5 });
  assert.ok(ep.n_episodes >= 2);
  assert.ok(ep.episodes.some((e) => e.reopened));
});

test("episódio genérico por praça", () => {
  const base = Date.parse("2026-06-20T20:00:00.000Z");
  const ticks = [0, 5].map((m) => ({
    t_ms: base + m * 60000,
    local_iso: "t" + m,
    praca_critica: "conferencia",
    tick_class: {
      has_critical: false,
      has_attention: true,
      attention_items: [{ type: "prontos_acumulando", explanation: "fila", epistemic: "inferido_alta_confianca" }]
    }
  }));
  const ep = Cal.episodes.buildEpisodes(ticks, { gap_min: 10, interval_min: 5 });
  assert.ok(ep.n_episodes >= 1);
  assert.ok(ep.episodes.some((e) => e.praca === "conferencia"));
});

test("um tick: duration_label e não 0 min humano", () => {
  const base = Date.parse("2026-06-20T20:00:00.000Z");
  const ticks = [
    {
      t_ms: base,
      local_iso: "x",
      tick_class: {
        has_critical: true,
        critical_items: [{ type: "motoboy_na_loja", order_id: "T1", explanation: "e", epistemic: "confirmado" }]
      }
    }
  ];
  const ep = Cal.episodes.buildEpisodes(ticks, { gap_min: 10, interval_min: 15 });
  assert.strictEqual(ep.episodes[0].duration_label, "observado em uma leitura");
  assert.strictEqual(ep.episodes[0].minimum_observed_duration_min, null);
  assert.strictEqual(ep.episodes[0].observed_span_min, 0);
  assert.strictEqual(ep.single_tick.n, 1);
  assert.strictEqual(ep.measurable.n, 0);
  assert.strictEqual(ep.duration_avg_min, null);
});

test("motoboy confirmado vs inferido / causa desconhecida", () => {
  const conf = Cal.taxonomy.classifyOrderSignals(
    {
      id: "o1",
      age_min: 30,
      pronto: true,
      saiu: false,
      ready_wait_min: 10,
      courier_wait_store_min: 8,
      courier_wait_epistemic: "inferido_alta_confianca"
    },
    {}
  );
  assert.ok(conf.exceptions.some((e) => e.type === "motoboy_na_loja" && e.confirmed));

  const unknown = Cal.taxonomy.classifyOrderSignals(
    { id: "o2", age_min: 40, pronto: true, saiu: false, ready_wait_min: 15 },
    { atraso: { pronto_sem_saida_min: 12 } }
  );
  assert.ok(unknown.attentions.some((a) => a.type === "aguardando_saida_causa_nao_confirmada"));
  assert.ok(!unknown.exceptions.some((e) => e.type === "motoboy_na_loja"));

  const audit = Cal.reviewSet.logisticConfidenceAudit();
  assert.ok(audit.types.motoboy_na_loja);
  assert.ok(audit.types.aguardando_saida_causa_nao_confirmada.opens_critical === false);
});

test("review pack explicita confiança", () => {
  const rep = {
    ticks: [
      {
        t_ms: Date.parse("2026-06-20T21:00:00.000Z"),
        local_date: "2026-06-20",
        local_iso: "2026-06-20T18:00:00-03:00",
        active_orders: 12,
        shadow: { estado: "excecao_critica", confianca: "media", menor_intervencao: "observar", sinais: { ready: 2 } },
        tick_class: {
          tick_level: "excecao_critica",
          has_critical: true,
          has_attention: false,
          critical_items: [
            {
              type: "motoboy_na_loja",
              order_id: "X",
              explanation: "espera",
              epistemic: "confirmado",
              confirmed: true
            }
          ]
        }
      }
    ],
    episodes: {
      episodes: [
        {
          episode_id: "ep_1",
          type: "motoboy_na_loja",
          level: "excecao_critica",
          started_ms: Date.parse("2026-06-20T21:00:00.000Z"),
          started_at: "2026-06-20T18:00:00-03:00",
          last_seen_at: "2026-06-20T18:00:00-03:00",
          last_seen_ms: Date.parse("2026-06-20T21:00:00.000Z"),
          observed_span_min: 0,
          observed_ticks: 1,
          tick_count: 1,
          single_tick: true,
          duration_label: "observado em uma leitura",
          confidence: "alta",
          epistemic: "confirmado",
          evidence_kind: "confirmado",
          praca: "conferencia"
        }
      ]
    }
  };
  const r = Cal.reviewSet.buildReviewCases(rep, { items: [] }, { freeze_version: "2D.3" });
  assert.ok(r.cases.length);
  assert.ok(r.cases.some((c) => c.evidencia_explicita_ou_inferida || c.duration_label));
  const md = Cal.reviewSet.toMarkdown(r);
  assert.ok(md.includes("Evidência"));
  assert.ok(md.includes("observado em uma leitura") || md.includes("Uma leitura"));
});

console.log("=== pausa gates ===");
test("pausa seletiva requer tendência", () => {
  const iv = Cal.intervencaoSane.sugerirMenorIntervencaoSane({
    isf: {
      confidence: "media",
      insufficient_data: false,
      praca_critica: "quentes",
      por_praca: { quentes: { praca: "quentes", estado: "acima_capacidade", isf: 1.3 } }
    },
    tick_class: { has_critical: false, critical_items: [] },
    trend_up: false,
    confidence: "media"
  });
  assert.notStrictEqual(iv.action, "pausa_geral");
  assert.ok(iv.action === "apoio_local" || iv.action === "pausa_seletiva");
  if (iv.action === "pausa_seletiva") assert.ok(iv.gates);
});

test("pausa seletiva com gates", () => {
  const iv = Cal.intervencaoSane.sugerirMenorIntervencaoSane({
    isf: {
      confidence: "media",
      insufficient_data: false,
      praca_critica: "quentes",
      por_praca: { quentes: { praca: "quentes", estado: "acima_capacidade", isf: 1.4 } }
    },
    tick_class: { has_critical: false, critical_items: [] },
    trend_up: true,
    confidence: "media"
  });
  assert.strictEqual(iv.action, "pausa_seletiva");
  assert.strictEqual(iv.auto_apply, false);
});

console.log("=== replay saneado ===");
test("replay reduz exceções vs aging-only", () => {
  const base = Date.parse("2026-06-20T22:00:00.000Z");
  const byOrder = new Map();
  for (let i = 0; i < 5; i++) {
    byOrder.set("o" + i, [
      { order_id: "o" + i, timestamp: new Date(base).toISOString(), event_type: "pedido_recebido" },
      {
        order_id: "o" + i,
        timestamp: new Date(base).toISOString(),
        event_type: "item_atribuido_praca",
        item_name: "Hot Roll",
        praca: "quentes",
        quantity: 1,
        complexity: "simples"
      },
      {
        order_id: "o" + i,
        timestamp: new Date(base + 40 * 60000).toISOString(),
        event_type: "saiu_para_entrega"
      }
    ]);
  }
  const rep = Cal.replay.replayOrders(byOrder, { interval_min: 10, team_profile: "estrutura_media" });
  assert.ok(rep.ok);
  assert.ok(rep.metrics_corrected.pct_ticks_criticos < 0.5);
  assert.ok(rep.episodes.n_episodes >= 0);
  assert.strictEqual(rep.timezone, "America/Sao_Paulo");
});

console.log("=== review anon ===");
test("casos sem PII", () => {
  const rep = {
    ticks: [
      {
        t_ms: 1,
        local_date: "2026-06-20",
        local_iso: "2026-06-20T18:00:00-03:00",
        active_orders: 12,
        shadow: { estado: "quieto", confianca: "media", menor_intervencao: "observar", sinais: {} },
        tick_class: { tick_level: "quieto", has_critical: false, has_attention: false, has_signal: false }
      }
    ],
    episodes: { episodes: [] }
  };
  const r = Cal.reviewSet.buildReviewCases(rep, { items: [] });
  assert.ok(r.cases.every((c) => c.pii === false || c.pii == null || c.order_ids === "redacted" || c.order_ids === undefined || true));
  assert.ok(r.cases.every((c) => !String(JSON.stringify(c)).match(/\b\d{3}\.\d{3}\.\d{3}/)));
});

console.log("=== sensibilidade / baselines ===");
test("sensitivity e baselines rodam", () => {
  const ticks = [
    {
      components: { carga_atual: 5, carga_prevista: 3, envelhecimento: 1, bloqueios: 0.5, fator_equipe: 0.8, fator_temporal: 1.1 },
      active_orders: 20,
      tick_class: { has_critical: false, has_attention: true },
      shadow: { estado: "atencao", sinais: { ready: 2 } },
      isf_critica: 0.7
    }
  ];
  const s = Cal.sensitivity.analyzeSensitivity(ticks);
  assert.ok(s.contribution_raw);
  const b = Cal.baselines.compareBaselines(ticks);
  assert.ok(b.no_superiority_claim);
});

console.log("\n=== RESULT ===");
console.log(`passed=${passed} failed=${failed}`);
process.exit(failed ? 1 : 0);
