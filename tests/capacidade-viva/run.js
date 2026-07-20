/**
 * Testes Capacidade Viva V0.1 + adapters inteligência.
 * node tests/capacidade-viva/run.js
 */
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const CV = require("../../src/capacidade-viva");
const intel = require("../../src/live/interface/adaptador-inteligencia");

const SHW_HR = require("../../src/capacidade-viva/shadow/human-rules.js");
const SHW_Config = require("../../src/capacidade-viva/shadow/config.js");
const SHW_Adapter = require("../../src/capacidade-viva/shadow/adapter.js");
const SHW_Flags = require("../../src/capacidade-viva/shadow/flags.js");
const { createObservationLog } = require("../../src/capacidade-viva/shadow/observation-log.js");

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log("  OK ", name);
  } catch (e) {
    failed++;
    failures.push({ name, error: e.message });
    console.log("  FAIL", name, "-", e.message);
  }
}

const config = CV.loadDefaultConfig();
const demo = require("../../data/capacidade-viva/fixtures/items-demo.json");

console.log("=== carga ponderada ===");
test("carga usa complexidade não só quantidade", () => {
  const simples = CV.cargaPonderadaPraca({
    config,
    items: [
      { id: "a", praca: "sushi", quantidade: 5, complexidade: "simples" },
      { id: "b", praca: "sushi", quantidade: 5, complexidade: "simples" }
    ]
  });
  const complexos = CV.cargaPonderadaPraca({
    config,
    items: [
      { id: "c", praca: "quentes", quantidade: 2, complexidade: "muito_complexo" },
      { id: "d", praca: "quentes", quantidade: 2, complexidade: "complexo" }
    ]
  });
  assert.ok(complexos.carga > 0);
  assert.ok(simples.components.length === 2);
  assert.ok(simples.false_precision === false);
});

console.log("=== complexidade ===");
test("pesos configuráveis", () => {
  assert.ok(CV.pesoComplexidade(config, "simples") < CV.pesoComplexidade(config, "complexo"));
  const c = CV.classifyItem(demo.items[0], config);
  assert.ok(c.peso >= 1);
});

console.log("=== equipe ===");
test("capacidade sem rastrear indivíduos", () => {
  const cap = CV.capacidadeEquipe(
    { equipe: { sushi: 8, conferencia: 5, quentes: 3, caixa: 3, cozinha: 2, motoboy: 4, flutuantes: 1 } },
    config
  );
  assert.strictEqual(cap.tracks_individuals, false);
  assert.ok(cap.por_praca.sushi.fator_capacidade > 0.5);
});

console.log("=== contexto temporal ===");
test("dia e horário provisórios", () => {
  const friPeak = CV.fatorTemporal(config, new Date("2026-07-17T20:00:00")); // sexta
  assert.ok(friPeak.fator >= 1);
  const vol = CV.leituraVolumeGlobal(55, config);
  assert.ok(vol.does_not_override_praca_critica);
});

console.log("=== ISF ===");
test("praça crítica não escondida por média", () => {
  const isf = CV.calcularISF({
    config,
    turno: { equipe: { sushi: 8, quentes: 1, conferencia: 5, caixa: 3, cozinha: 1, motoboy: 2 } },
    por_praca: {
      sushi: { items: demo.items.filter((i) => i.praca === "sushi") },
      quentes: {
        items: demo.items.filter((i) => i.praca === "quentes").concat(
          demo.items.filter((i) => i.praca === "quentes")
        ),
        envelhecimento: 8,
        bloqueios: 2
      },
      conferencia: { items: demo.items.filter((i) => i.praca === "conferencia") }
    },
    n_pedidos: 40,
    confianca: "media"
  });
  assert.ok(isf.praca_critica);
  assert.strictEqual(isf.uses_average_to_hide_critical, false);
  assert.ok(isf.por_praca[isf.praca_critica].isf >= isf.por_praca.sushi.isf);
});

console.log("=== exceções ===");
test("exceção crítica sem depender de volume geral", () => {
  const ex = CV.detectarExcecoes({
    config,
    orders: [{ id: "X1", motoboy_esperando: true, pronto: true, age_min: 12 }],
    source: {}
  });
  assert.ok(ex.count >= 1);
  assert.ok(ex.not_continuous_pressure);
});

console.log("=== menor intervenção ===");
test("pausa seletiva antes da geral", () => {
  const isf = {
    confidence: "media",
    praca_critica: "quentes",
    por_praca: { quentes: { praca: "quentes", estado: "acima_capacidade", isf: 1.4 } },
    insufficient_data: false
  };
  const iv = CV.sugerirMenorIntervencao({ isf, excecoes: { items: [], count: 0 }, config });
  assert.strictEqual(iv.action, "pausa_seletiva");
  assert.strictEqual(iv.auto_apply, false);
  assert.ok(iv.requires_human_confirmation);
});

test("motoboy esperando → intervenção cirúrgica", () => {
  const iv = CV.sugerirMenorIntervencao({
    isf: {
      confidence: "media",
      insufficient_data: false,
      praca_critica: "sushi",
      por_praca: { sushi: { estado: "controlavel", isf: 0.4 } }
    },
    excecoes: {
      count: 1,
      items: [{ type: "motoboy_esperando", title: "Motoboy esperando" }]
    },
    config
  });
  assert.strictEqual(iv.action, "finalizar_pedidos_motoboy_esperando");
});

console.log("=== recuperação ===");
test("classifica recuperação líquida e colateral", () => {
  const before = {
    praca_critica: "quentes",
    por_praca: { quentes: { isf: 1.2, estado: "acima_capacidade" }, sushi: { isf: 0.4, estado: "controlavel" } }
  };
  const afterOk = {
    praca_critica: "quentes",
    por_praca: { quentes: { isf: 0.5, estado: "controlavel" }, sushi: { isf: 0.4, estado: "controlavel" } },
    signals: { fila_parou_crescer: true, erros_nao_aumentaram: true }
  };
  const r1 = CV.classificarRecuperacao({ before, after: afterOk, executed: true, elapsed_min: 12, config });
  assert.strictEqual(r1.outcome, "recuperacao_liquida");
  assert.ok(r1.not_employee_evaluation);

  const afterCol = {
    praca_critica: "conferencia",
    por_praca: {
      quentes: { isf: 0.5, estado: "controlavel" },
      conferencia: { isf: 1.5, estado: "acima_capacidade" }
    }
  };
  const r2 = CV.classificarRecuperacao({ before, after: afterCol, executed: true, elapsed_min: 18, config });
  assert.strictEqual(r2.outcome, "deslocou_problema");
});

console.log("=== feedback ===");
test("feedback humano opcional", () => {
  const f = CV.registrarFeedback({ choice: "ajudou_parcialmente", observation: "ok" });
  assert.ok(f.ok);
  assert.strictEqual(f.feedback.required_during_peak, false);
});

console.log("=== config versionada ===");
test("alteração registra anterior/novo/motivo/versão", () => {
  const cfg = JSON.parse(JSON.stringify(config));
  const hist = CV.createHistory();
  const { entry } = CV.applyConfigChange(cfg, hist, {
    path: "atraso.pronto_parado_min",
    value: 10,
    reason: "calibração provisória"
  });
  assert.strictEqual(entry.previous, 8);
  assert.strictEqual(entry.next, 10);
  assert.ok(entry.version_after);
  assert.ok(hist.entries.length === 1);
});

console.log("=== explicabilidade ===");
test("envelope explicável", () => {
  const e = CV.explainable(1.2, { source: "test", explanation: "demo", confidence: "media" });
  assert.ok(e.value != null && e.source && e.timestamp && e.confidence && e.explanation);
});

console.log("=== adapters V3.3 ===");
test("toV33ViewHints não redesenha", () => {
  const av = CV.avaliar({
    turno: { equipe: { sushi: 2, quentes: 1, conferencia: 2, caixa: 1, cozinha: 1, motoboy: 1 } },
    por_praca: {
      quentes: { items: demo.items.filter((i) => i.praca === "quentes"), envelhecimento: 10, bloqueios: 3 }
    },
    n_pedidos: 80,
    orders: [{ id: "1", motoboy_esperando: true, age_min: 15, pronto: true }]
  });
  const v = CV.toV33ViewHints(av);
  assert.ok(v.not_redesign);
  assert.ok(v.mode_hint);
});

test("forecast adapter marca simulated=false com histórico", () => {
  const f = intel.buildForecastForArea({
    area: "conferencia",
    queue_history: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    horizon_min: 15
  });
  assert.strictEqual(f.simulated, false);
  assert.ok(f.confidence.visual === "confidence");
  assert.ok(/estimativa|não certeza|certeza/i.test(f.note + f.text));
});

test("forecast sem dado não fabrica pressão", () => {
  const f = intel.buildForecastForArea({ area: "sushi", queue_history: [] });
  assert.strictEqual(f.simulated, true);
  assert.ok(/Não tenho leitura suficiente/i.test(f.text));
});

test("action track responsável funcional", () => {
  const pb = intel.suggestPlaybookForArea("quentes");
  const a = intel.adaptActionTrack({ stateId: "assumiu", playbook: pb, from_engine: true });
  assert.ok(a.responsible.note.indexOf("ranking") >= 0);
  assert.strictEqual(a.onlyCurrent, true);
});

test("confiança insuficiente → observar", () => {
  const iv = CV.sugerirMenorIntervencao({
    isf: { insufficient_data: true, confidence: "baixa", por_praca: {} },
    excecoes: { items: [], count: 0 },
    config
  });
  assert.strictEqual(iv.action, "observar");
});

console.log("=== Fase 2E.1 — Capacidade Viva human-v2 em modo sombra (§10) ===");

const HASH_INCORRETO_FIXTURE = path.join(__dirname, "shadow", "fixtures", "config-hash-incorreto.json");

function motoboyFact(courierWaitMin) {
  return {
    id: "m1", age_min: 20, ready_wait_min: courierWaitMin, pronto: true, saiu: false, cancelado: false,
    courier_wait_store_min: courierWaitMin, courier_wait_epistemic: "confirmado",
    alocado: false, alocado_epistemic: null, age_is_proxy_from_volume: false,
    crosses_operational_days: false
  };
}

function nightProntoSemSaida(readyWaitMin, t) {
  return [{ id: "PED-X", curto: "X1", r: t - readyWaitMin - 10, p: t - readyWaitMin, s: null, e: null, c: null }];
}

test("hash correto habilita o motor sombra", () => {
  const cfg = SHW_Config.loadShadowConfig();
  assert.strictEqual(cfg.ready, true);
  assert.strictEqual(cfg.status, "shadow_only");
  assert.strictEqual(cfg.automatic_decisions_allowed, false);
  assert.strictEqual(cfg.actual_sha256, SHW_Config.METADATA.expected_sha256);
});

test("hash incorreto bloqueia somente o motor sombra", () => {
  process.env.CAPACIDADE_VIVA_HUMAN_V2_SHADOW_CONFIG_PATH = HASH_INCORRETO_FIXTURE;
  try {
    const cfg = SHW_Config.loadShadowConfig();
    assert.strictEqual(cfg.ready, false);
    assert.strictEqual(cfg.error, "hash_incompatível");
    assert.strictEqual(cfg.config, null);
  } finally {
    delete process.env.CAPACIDADE_VIVA_HUMAN_V2_SHADOW_CONFIG_PATH;
  }
  // o arquivo real, validado, continua carregando normalmente depois
  assert.strictEqual(SHW_Config.loadShadowConfig().ready, true);
});

test("adapter falha em modo seguro quando a config não está pronta (pré-condição de 'Copiloto continua funcionando')", () => {
  const r1 = SHW_Adapter.observeSnapshot({ NIGHT: [], rows: [], t: 100, shadowConfig: { ready: false, config: null } });
  assert.strictEqual(r1.ok, false);
  assert.strictEqual(r1.kind, "shadow_failure");
  const r2 = SHW_Adapter.observeSnapshot(null);
  assert.strictEqual(r2.ok, false);
  const r3 = SHW_Adapter.observeSnapshot({ NIGHT: "não é array", t: "não é número", shadowConfig: null });
  assert.strictEqual(r3.ok, false);
  // nenhuma dessas chamadas lançou — é exatamente essa garantia que permite ao
  // Copiloto continuar respondendo mesmo com o motor sombra quebrado (ver
  // tools/servir_v1.js:rodarLeituraSombra e o teste de fumaça em
  // tests/live/interface-capacidade-viva-shadow-smoke.test.js).
});

test("saída do human-v2 não altera estado oficial (snapshot de entrada nunca é mutado)", () => {
  const shadowConfig = SHW_Config.loadShadowConfig();
  const t = 500;
  const NIGHT = nightProntoSemSaida(45, t);
  const antes = JSON.stringify(NIGHT);
  const res = SHW_Adapter.observeSnapshot({ NIGHT, rows: [], seedItens: [], t, sourceStatus: "ready", shadowConfig });
  assert.strictEqual(JSON.stringify(NIGHT), antes, "o adapter mutou a janela recebida");
  assert.strictEqual(res.kind, "shadow_observation");
  assert.notStrictEqual(res.kind, "operational_decision");
});

test("módulos do modo sombra nunca referenciam DOM/UI (garantia estática de 'não altera body[data-mode]')", () => {
  const arquivos = ["adapter.js", "config.js", "flags.js", "human-rules.js", "labels.js", "observation-log.js"]
    .map((f) => path.join(__dirname, "..", "..", "src", "capacidade-viva", "shadow", f));
  const proibidos = /\bdocument\b|data-mode|innerHTML|querySelector|body\[/;
  for (const f of arquivos) {
    const src = fs.readFileSync(f, "utf8");
    assert.ok(!proibidos.test(src), "arquivo sombra referencia DOM/UI: " + f);
  }
  const appJs = fs.readFileSync(path.join(__dirname, "..", "..", "app-v1", "app.js"), "utf8");
  assert.ok(appJs.indexOf("capacidade-viva/shadow") === -1, "app.js não deve conhecer o motor sombra nesta fase");
});

test("wiring do servidor não altera o payload de /api/fonte (garantia de 'não altera painel ou prioridade')", () => {
  const shadowConfig = SHW_Config.loadShadowConfig();
  const payload = {
    source_status: "ready",
    janela: { meta: { dia_local: "2026-07-19" }, T1: 500, NIGHT: nightProntoSemSaida(10, 500), rows: [] }
  };
  const antes = JSON.stringify(payload);
  SHW_Adapter.observeSnapshot({
    NIGHT: payload.janela.NIGHT, rows: payload.janela.rows, seedItens: [],
    t: payload.janela.T1, sourceStatus: payload.source_status, shadowConfig
  });
  assert.strictEqual(JSON.stringify(payload), antes, "o payload que o navegador recebe não pode mudar");
});

test("nenhuma decisão automática é emitida", () => {
  assert.strictEqual(SHW_Flags.automaticDecisionsEnabled(), false);
  const shadowConfig = SHW_Config.loadShadowConfig();
  const t = 500;
  const res = SHW_Adapter.observeSnapshot({
    NIGHT: nightProntoSemSaida(45, t), rows: [], seedItens: [], t, sourceStatus: "ready", shadowConfig
  });
  assert.strictEqual(res.observation.automatic_decisions_allowed, false);
  assert.strictEqual(res.observation.intervencao_executavel, false);
  assert.strictEqual(typeof res.observation.intervencao_sugerida_texto, "string");
});

test("pedido zumbi não contamina o ISF", () => {
  const shadowConfig = SHW_Config.loadShadowConfig();
  const zfact = {
    id: "z1", age_min: 500, ready_wait_min: 0, pronto: false, saiu: false, cancelado: false,
    courier_wait_store_min: null, courier_wait_epistemic: null, alocado: false, alocado_epistemic: null,
    age_is_proxy_from_volume: false, crosses_operational_days: false
  };
  const cls = SHW_HR.classifyOrderHuman(zfact, shadowConfig.config, {});
  assert.strictEqual(cls.zombie, true);
  assert.strictEqual(cls.exclude_from_isf, true);
  assert.strictEqual(cls.exclude_from_capacity, true);
  assert.strictEqual(cls.exclude_from_pause, true);
});

test("qualidade da fonte tem precedência (zumbi nunca esconde um crítico real na mesma janela)", () => {
  const shadowConfig = SHW_Config.loadShadowConfig();
  const t = 1000;
  const NIGHT = [
    { id: "z1", curto: "Z1", r: t - 500, p: null, s: null, e: null, c: null }, // zumbi por idade
    { id: "c1", curto: "C1", r: t - 55, p: t - 45, s: null, e: null, c: null } // pronto 45min → crítico
  ];
  const res = SHW_Adapter.observeSnapshot({ NIGHT, rows: [], seedItens: [], t, sourceStatus: "ready", shadowConfig });
  assert.strictEqual(res.observation.estado, "critico");
  assert.strictEqual(res.observation.pedidos_excluidos_por_fonte, 1);
});

test("motoboy 5–9.99 min permanece normal", () => {
  const shadowConfig = SHW_Config.loadShadowConfig();
  const cls = SHW_HR.classifyOrderHuman(motoboyFact(7), shadowConfig.config, {});
  assert.strictEqual(cls.severity_label, "normal");
});
test("motoboy 10–14.99 min permanece atenção", () => {
  const shadowConfig = SHW_Config.loadShadowConfig();
  const cls = SHW_HR.classifyOrderHuman(motoboyFact(12), shadowConfig.config, {});
  assert.strictEqual(cls.severity_label, "atencao");
});
test("motoboy 15–19.99 min permanece quase crítico", () => {
  const shadowConfig = SHW_Config.loadShadowConfig();
  const cls = SHW_HR.classifyOrderHuman(motoboyFact(17), shadowConfig.config, {});
  assert.strictEqual(cls.severity_label, "quase_critico");
});
test("motoboy 20+ min permanece crítico", () => {
  const shadowConfig = SHW_Config.loadShadowConfig();
  const cls = SHW_HR.classifyOrderHuman(motoboyFact(25), shadowConfig.config, {});
  assert.strictEqual(cls.severity_label, "critico");
});

test("pronto sem saída abaixo de 25 min permanece normal", () => {
  const shadowConfig = SHW_Config.loadShadowConfig();
  const t = 500;
  const res = SHW_Adapter.observeSnapshot({ NIGHT: nightProntoSemSaida(15, t), rows: [], seedItens: [], t, sourceStatus: "ready", shadowConfig });
  assert.strictEqual(res.observation.estado, "normal");
});
test("pronto sem saída 25–35 min permanece atenção", () => {
  const shadowConfig = SHW_Config.loadShadowConfig();
  const t = 500;
  const res = SHW_Adapter.observeSnapshot({ NIGHT: nightProntoSemSaida(30, t), rows: [], seedItens: [], t, sourceStatus: "ready", shadowConfig });
  assert.strictEqual(res.observation.estado, "atencao");
});
test("pronto sem saída 35–40 min permanece quase crítico", () => {
  const shadowConfig = SHW_Config.loadShadowConfig();
  const t = 500;
  const res = SHW_Adapter.observeSnapshot({ NIGHT: nightProntoSemSaida(37, t), rows: [], seedItens: [], t, sourceStatus: "ready", shadowConfig });
  assert.strictEqual(res.observation.estado, "quase_critico");
});
test("pronto sem saída 40+ min permanece crítico", () => {
  const shadowConfig = SHW_Config.loadShadowConfig();
  const t = 500;
  const res = SHW_Adapter.observeSnapshot({ NIGHT: nightProntoSemSaida(45, t), rows: [], seedItens: [], t, sourceStatus: "ready", shadowConfig });
  assert.strictEqual(res.observation.estado, "critico");
});

test("volume bruto isolado gera evidência insuficiente", () => {
  // Este gate (context.only_active_orders / volume_only) existe para quando a
  // ÚNICA informação disponível é uma CONTAGEM de pedidos ativos, sem timing
  // por pedido nenhum — nunca acontece via o adapter (a janela NIGHT sempre
  // traz carimbo real por pedido), então é exercitado direto na regra humana,
  // exatamente como o motor a define. Mesma limitação honesta documentada
  // para courier_wait_store_min em adapter.js — não contornar com dado
  // fabricado no adapter só para "passar" este teste.
  const shadowConfig = SHW_Config.loadShadowConfig();
  const fact = {
    id: "v1", age_min: 5, ready_wait_min: 0, pronto: false, saiu: false, cancelado: false,
    courier_wait_store_min: null, courier_wait_epistemic: null, alocado: false, alocado_epistemic: null,
    age_is_proxy_from_volume: false, crosses_operational_days: false
  };
  const cls = SHW_HR.classifyOrderHuman(fact, shadowConfig.config, { only_active_orders: true });
  assert.strictEqual(cls.level, "evidencia_insuficiente");
  assert.strictEqual(cls.exclude_from_isf, true);
});

test("logs consecutivos idênticos são deduplicados", () => {
  const log = createObservationLog({ persist: false });
  const base = Date.parse("2026-01-01T00:00:00.000Z");
  const obs = (tOffsetMin, estado) => ({
    timestamp: new Date(base + tOffsetMin * 60000).toISOString(), estado,
    regra_acionada: "tata_v2", saude_da_fonte: "ready",
    excluido_por_qualidade_da_fonte: false, pedidos_excluidos_por_fonte: 0, confianca: "media"
  });
  assert.strictEqual(log.register(obs(0, "normal")).register, true);
  assert.strictEqual(log.register(obs(1, "normal")).register, false);
  assert.strictEqual(log.register(obs(2, "normal")).register, false);
  assert.strictEqual(log.getEntries().length, 1);
});

test("mudança de estado gera novo registro", () => {
  const log = createObservationLog({ persist: false });
  const base = Date.parse("2026-01-01T00:00:00.000Z");
  const obs = (tOffsetMin, estado) => ({
    timestamp: new Date(base + tOffsetMin * 60000).toISOString(), estado,
    regra_acionada: "tata_v2", saude_da_fonte: "ready",
    excluido_por_qualidade_da_fonte: false, pedidos_excluidos_por_fonte: 0, confianca: "media"
  });
  log.register(obs(0, "normal"));
  const r = log.register(obs(1, "atencao"));
  assert.strictEqual(r.register, true);
  assert.strictEqual(r.reason, "mudanca_de_estado");
  assert.strictEqual(log.getEntries().length, 2);
});

test("nenhum nome de funcionário ou ranking é produzido", () => {
  const shadowConfig = SHW_Config.loadShadowConfig();
  const t = 1000;
  const NIGHT = [
    { id: "PED-A", curto: "A1", r: t - 55, p: t - 45, s: null, e: null, c: null },
    { id: "PED-B", curto: "B1", r: t - 500, p: null, s: null, e: null, c: null }
  ];
  const res = SHW_Adapter.observeSnapshot({ NIGHT, rows: [], seedItens: [], t, sourceStatus: "ready", shadowConfig });
  const serializado = JSON.stringify(res.observation);
  assert.ok(!/nome_funcionario|colaborador|employee|ranking|funcionario/i.test(serializado));
  // "config_nome" é campo exigido pelo §4 ("nome da configuração") — não é
  // nome de pessoa. Só reprova chave que sinalize identidade de funcionário.
  const chaves = Object.keys(res.observation);
  assert.ok(!chaves.some((k) => /funcionario|colaborador|ranking|employee/i.test(k)));
});

test("feature flag off (produção sem configuração) impede habilitação do modo sombra", () => {
  assert.strictEqual(SHW_Flags.isShadowEnabled({ NODE_ENV: "production" }), false);
  assert.strictEqual(SHW_Flags.isShadowEnabled({}), true); // sem NODE_ENV definido, default é development
  assert.strictEqual(SHW_Flags.isShadowEnabled({ NODE_ENV: "development" }), true);
  assert.strictEqual(SHW_Flags.isShadowEnabled({ NODE_ENV: "test" }), true);
  assert.strictEqual(SHW_Flags.isShadowEnabled({ NODE_ENV: "production", CAPACIDADE_VIVA_HUMAN_V2_SHADOW: "1" }), true);
});

test("flag de modo sombra nunca habilita decisão operacional automática", () => {
  assert.strictEqual(SHW_Flags.automaticDecisionsEnabled(), false);
  // nem mesmo tentando "convencer" via variáveis de ambiente forjadas —
  // a função não lê env nenhuma, então nada pode ligá-la.
  assert.strictEqual(
    SHW_Flags.automaticDecisionsEnabled({
      CAPACIDADE_VIVA_HUMAN_V2_SHADOW: "1",
      CAPACIDADE_VIVA_HUMAN_V2_OPERATIONAL: "1",
      NODE_ENV: "production"
    }),
    false
  );
});

console.log("\n=== RESULT ===");
console.log(`passed=${passed} failed=${failed}`);
if (failed) {
  for (const f of failures) console.log(" -", f.name, f.error);
  process.exit(1);
}
process.exit(0);
