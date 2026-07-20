#!/usr/bin/env node
/* ============================================================================
 * Auditoria local da Capacidade Viva human-v2 em modo sombra (Fase 2E.2).
 * ----------------------------------------------------------------------------
 * Roda os motores REAIS (config, adapter, human-rules, observation-log)
 * sobre cenários controlados e imprime um relatório estruturado. Não é um
 * mock: usa exatamente os mesmos módulos que tools/servir_v1.js usa em
 * produção — só substitui a fonte (simulador aleatório) por janelas
 * construídas à mão, para poder afirmar "12.0 min → atenção" com precisão.
 *
 * Não persiste nada no log real (roda com persist:false) — os números deste
 * relatório vêm do stdout, não de um arquivo gerado em data/.
 *
 *   Uso: node tools/auditar_capacidade_viva_shadow.js
 * ==========================================================================*/
"use strict";

const path = require("path");
const ShadowConfig = require("../src/capacidade-viva/shadow/config.js");
const ShadowAdapter = require("../src/capacidade-viva/shadow/adapter.js");
const ShadowHR = require("../src/capacidade-viva/shadow/human-rules.js");
const ShadowFlags = require("../src/capacidade-viva/shadow/flags.js");
const { createObservationLog } = require("../src/capacidade-viva/shadow/observation-log.js");

const linha = () => console.log("-".repeat(78));
const resultados = [];

function registrar(secao, nome, ok, detalhe) {
  resultados.push({ secao, nome, ok, detalhe });
  console.log((ok ? "OK  " : "FAIL") + " [" + secao + "] " + nome + (detalhe ? " — " + detalhe : ""));
}

console.log("=== Auditoria Capacidade Viva human-v2 — modo sombra (Fase 2E.2) ===");
linha();

/* ---------------------------------------------------------------------------
 * 0) Config e flag
 * ------------------------------------------------------------------------- */
const shadowConfig = ShadowConfig.loadShadowConfig();
registrar("boot", "config carrega e hash bate", shadowConfig.ready === true,
  "hash=" + shadowConfig.actual_sha256 + " commit=" + shadowConfig.validation_commit);
registrar("boot", "automatic_decisions_allowed é false", shadowConfig.automatic_decisions_allowed === false);
registrar("boot", "flag ativa quando env define true", ShadowFlags.isShadowEnabled({ CAPACIDADE_VIVA_HUMAN_V2_SHADOW: "true" }) === true);
registrar("boot", "flag inativa em produção sem configuração", ShadowFlags.isShadowEnabled({ NODE_ENV: "production" }) === false);
linha();

/* ---------------------------------------------------------------------------
 * Helpers de cenário
 * ------------------------------------------------------------------------- */
function nightPronto(readyWaitMin, t, id) {
  return [{ id: id || "PED-AUDIT", curto: "AU1", r: t - readyWaitMin - 10, p: t - readyWaitMin, s: null, e: null, c: null }];
}
function motoboyFact(courierWaitMin) {
  return {
    id: "m-audit", age_min: 20, ready_wait_min: courierWaitMin, pronto: true, saiu: false, cancelado: false,
    courier_wait_store_min: courierWaitMin, courier_wait_epistemic: "confirmado",
    alocado: false, alocado_epistemic: null, age_is_proxy_from_volume: false, crosses_operational_days: false
  };
}
function volumeIsoladoFact() {
  return {
    id: "v-audit", age_min: 4, ready_wait_min: 0, pronto: false, saiu: false, cancelado: false,
    courier_wait_store_min: null, courier_wait_epistemic: null, alocado: false, alocado_epistemic: null,
    age_is_proxy_from_volume: false, crosses_operational_days: false
  };
}
function rodarPronto(min, t) {
  return ShadowAdapter.observeSnapshot({ NIGHT: nightPronto(min, t), rows: [], seedItens: [], t, sourceStatus: "ready", shadowConfig });
}

/* ---------------------------------------------------------------------------
 * 1/2) Cenários de auditoria — operação normal / atenção / quase crítico / crítico
 * ------------------------------------------------------------------------- */
console.log("=== Cenários: bandas de severidade ===");
const T = 1000;

const bandasMotoboy = [
  ["motoboy 7 min (5–9.99)", 7, "normal"],
  ["motoboy 12 min (10–14.99)", 12, "atencao"],
  ["motoboy 17 min (15–19.99)", 17, "quase_critico"],
  ["motoboy 25 min (20+)", 25, "critico"]
];
for (const [nome, min, esperado] of bandasMotoboy) {
  const cls = ShadowHR.classifyOrderHuman(motoboyFact(min), shadowConfig.config, {});
  registrar("bandas", nome, cls.severity_label === esperado, "obtido=" + cls.severity_label + " (via regra — braço não alcançável pelo adapter, ver §6 do relatório)");
}

const bandasPronto = [
  ["pronto 15 min (<25)", 15, "normal"],
  ["pronto 30 min (25–35)", 30, "atencao"],
  ["pronto 37 min (35–40)", 37, "quase_critico"],
  ["pronto 45 min (40+)", 45, "critico"]
];
for (const [nome, min, esperado] of bandasPronto) {
  const res = rodarPronto(min, T);
  registrar("bandas", nome, res.observation.estado === esperado, "obtido=" + res.observation.estado + " (via adapter, snapshot NIGHT real)");
}

const volCls = ShadowHR.classifyOrderHuman(volumeIsoladoFact(), shadowConfig.config, { only_active_orders: true });
registrar("bandas", "volume isolado sem evidência → evidência insuficiente", volCls.level === "evidencia_insuficiente", "obtido=" + volCls.level);
linha();

/* ---------------------------------------------------------------------------
 * Qualidade da fonte
 * ------------------------------------------------------------------------- */
console.log("=== Cenários: qualidade da fonte ===");
function zumbiFact(overrides) {
  return Object.assign({
    id: "z-audit", age_min: 500, ready_wait_min: 0, pronto: false, saiu: false, cancelado: false,
    courier_wait_store_min: null, courier_wait_epistemic: null, alocado: false, alocado_epistemic: null,
    age_is_proxy_from_volume: false, crosses_operational_days: false
  }, overrides || {});
}
const zumbiIdade = ShadowHR.classifyOrderHuman(zumbiFact(), shadowConfig.config, {});
registrar("fonte", "idade incompatível (500 min) → qualidade_da_fonte", zumbiIdade.zombie === true && zumbiIdade.level === "qualidade_fonte");

const zumbiIncoerente = ShadowHR.classifyOrderHuman(zumbiFact({ age_min: 30, ready_wait_min: 120 }), shadowConfig.config, {});
registrar("fonte", "dado temporal contraditório (pronto>idade+60) → qualidade_da_fonte", zumbiIncoerente.zombie === true, "subtype=" + (zumbiIncoerente.zombie_info && zumbiIncoerente.zombie_info.subtype));

const zumbiStatusTravado = ShadowHR.classifyOrderHuman(zumbiFact({ age_min: 200, ready_wait_min: 200 }), shadowConfig.config, {});
registrar("fonte", "status travado (pronto e idade ambos ≥180, nunca saiu) → qualidade_da_fonte", zumbiStatusTravado.zombie === true);

for (const c of [zumbiIdade, zumbiIncoerente, zumbiStatusTravado]) {
  registrar("fonte", "zumbi exclui ISF/capacidade/pausa", c.exclude_from_isf && c.exclude_from_capacity && c.exclude_from_pause);
}
linha();

/* ---------------------------------------------------------------------------
 * Multiplicidade: zumbi + normal + crítico na mesma janela
 * ------------------------------------------------------------------------- */
console.log("=== Multiplicidade de pedidos (zumbi + normal + crítico) ===");
const NIGHT_MULTI = [
  { id: "Z1", curto: "Z1", r: T - 500, p: null, s: null, e: null, c: null },      // zumbi por idade
  { id: "N1", curto: "N1", r: T - 15, p: T - 5, s: null, e: null, c: null },       // pronto 5min — normal
  { id: "C1", curto: "C1", r: T - 55, p: T - 45, s: null, e: null, c: null }       // pronto 45min — crítico
];
const resMulti = ShadowAdapter.observeSnapshot({ NIGHT: NIGHT_MULTI, rows: [], seedItens: [], t: T, sourceStatus: "ready", shadowConfig });
registrar("multiplicidade", "crítico permanece dominante mesmo com zumbi e normal presentes", resMulti.observation.estado === "critico", "estado=" + resMulti.observation.estado);
registrar("multiplicidade", "zumbi contado como excluído por fonte (1)", resMulti.observation.pedidos_excluidos_por_fonte === 1, "n=" + resMulti.observation.pedidos_excluidos_por_fonte);
registrar("multiplicidade", "3 pedidos avaliados na janela", resMulti.observation.pedidos_avaliados === 3);
registrar("multiplicidade", "pedido crítico participa do ISF", resMulti.observation.participa_do_isf === true);
console.log("   observação completa:", JSON.stringify(resMulti.observation));
linha();

/* ---------------------------------------------------------------------------
 * Falha técnica
 * ------------------------------------------------------------------------- */
console.log("=== Falha técnica (fail-safe) ===");
const semConfig = ShadowAdapter.observeSnapshot({ NIGHT: nightPronto(10, T), rows: [], seedItens: [], t: T, sourceStatus: "ready", shadowConfig: { ready: false, config: null } });
registrar("falha", "config ausente → adapter falha em modo seguro (não lança)", semConfig.ok === false && semConfig.kind === "shadow_failure");

process.env.CAPACIDADE_VIVA_HUMAN_V2_SHADOW_CONFIG_PATH = path.join(__dirname, "..", "tests", "capacidade-viva", "shadow", "fixtures", "config-hash-incorreto.json");
const hashRuim = ShadowConfig.loadShadowConfig();
registrar("falha", "hash inválido → ready:false, motor não inicia", hashRuim.ready === false && hashRuim.error === "hash_incompatível");
delete process.env.CAPACIDADE_VIVA_HUMAN_V2_SHADOW_CONFIG_PATH;

const snapshotIncompativel = ShadowAdapter.observeSnapshot({ NIGHT: "não é array", t: "NaN", shadowConfig });
registrar("falha", "snapshot incompatível → adapter falha em modo seguro (não lança)", snapshotIncompativel.ok === false);

const excecaoControlada = ShadowAdapter.observeSnapshot(undefined);
registrar("falha", "entrada nula/indefinida → adapter falha em modo seguro (não lança)", excecaoControlada.ok === false);
linha();

/* ---------------------------------------------------------------------------
 * Deduplicação / heartbeat — sequência de ticks
 * ------------------------------------------------------------------------- */
console.log("=== Deduplicação / heartbeat ===");
const log = createObservationLog({ persist: false, heartbeatMinutes: 15 });
const base = T;
const seq = [
  [0, 30, "ready"],   // tick 1 — primeira observação (normal, 30min pronto→atencao)
  [1, 30, "ready"],   // tick idêntico
  [2, 30, "ready"],   // tick idêntico
  [3, 45, "ready"],   // muda para crítico
  [4, 45, "ready"],   // tick idêntico (crítico)
  [5, 45, "degraded"], // muda saúde da fonte
  [6, 45, "degraded"], // tick idêntico
  [21, 45, "degraded"] // 15min depois → heartbeat (mesmo estado/fonte)
];
let processados = 0, persistidos = 0;
const razoes = [];
for (const [tOffsetMin, prontoMin, saude] of seq) {
  const t = base + tOffsetMin; // T em minutos simulados; offset pequeno só para diferenciar timestamp real do registro
  const r = rodarPronto(prontoMin, base); // mesma janela-base, varia só o "agora" via prontoMin
  const obsSintetica = Object.assign({}, r.observation, {
    timestamp: new Date(Date.parse("2026-01-01T00:00:00.000Z") + tOffsetMin * 60000).toISOString(),
    saude_da_fonte: saude
  });
  const decisao = log.register(obsSintetica);
  processados++;
  if (decisao.register) persistidos++;
  razoes.push(decisao.reason);
}
registrar("dedup", "8 snapshots processados", processados === 8);
registrar("dedup", "registros persistidos == 4 (mudança estado, mudança estado, mudança fonte, heartbeat)", persistidos === 4, "razoes=" + JSON.stringify(razoes));
console.log("   redução observada: " + processados + " processados -> " + persistidos + " persistidos (" +
  Math.round((1 - persistidos / processados) * 100) + "% deduplicado)");
linha();

/* ---------------------------------------------------------------------------
 * Ausência de PII / ranking / comando executável
 * ------------------------------------------------------------------------- */
console.log("=== PII / ranking / comando executável ===");
const serializado = JSON.stringify(resMulti.observation);
registrar("pii", "nenhuma referência a funcionário/colaborador/ranking/employee", !/funcionario|colaborador|ranking|employee/i.test(serializado));
registrar("pii", "intervencao_executavel é false", resMulti.observation.intervencao_executavel === false);
registrar("pii", "automatic_decisions_allowed é false na observação", resMulti.observation.automatic_decisions_allowed === false);
linha();

/* ---------------------------------------------------------------------------
 * D4A — campos disponíveis vs. necessários para o braço motoboy
 * ------------------------------------------------------------------------- */
console.log("=== D4A: limitação do braço motoboy ===");
const NIGHT_D4A = nightPronto(12, T);
console.log("   forma real de um NIGHT do D4A:", JSON.stringify(NIGHT_D4A[0]));
const factNormalizado = ShadowAdapter.normalizeNightOrder(NIGHT_D4A[0], T);
console.log("   fato normalizado pelo adapter:", JSON.stringify(factNormalizado));
registrar("d4a", "courier_wait_store_min está sempre null (campo `s` do D4A nunca observado)", factNormalizado.courier_wait_store_min === null);
linha();

/* ---------------------------------------------------------------------------
 * Resumo
 * ------------------------------------------------------------------------- */
const falhas = resultados.filter((r) => !r.ok);
console.log("=== RESUMO ===");
console.log("checks=" + resultados.length + " ok=" + (resultados.length - falhas.length) + " falhas=" + falhas.length);
if (falhas.length) {
  for (const f of falhas) console.log(" - FALHOU:", f.secao, f.nome, f.detalhe || "");
  process.exit(1);
}
process.exit(0);
