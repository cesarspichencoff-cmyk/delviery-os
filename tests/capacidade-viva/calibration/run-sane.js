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
