/* D4A — feature flag e estados da fonte: seleção segura por padrão, estados
 * derivados sem esconder erro, janela só em "ready", último confiável DATADO. */
"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { selecionarFonte, selecionarFonteDoAmbiente, NOME_FLAG } =
  require("../../src/live/interface/fonte");
const { derivarEstadoFonte, montarPayloadInterface, ESTADOS_FONTE } =
  require("../../src/live/interface/adaptador");
const { executarCenario } = require("../../tools/live/simulator/executor");

const TZ = "America/Sao_Paulo";
const snapDe = (cenario) => executarCenario({ cenario, seed: "d4a-fonte", storeTimeZone: TZ }).snapshot;

test("19. flag desligada/ausente: fonte atual, fallback REGISTRADO, simulador nunca liga sozinho", () => {
  for (const valor of [undefined, null, ""]) {
    const s = selecionarFonte(valor);
    assert.equal(s.fonte, "current");
    assert.equal(s.degraded_state, null);
    assert.equal(s.fallback, "flag_ausente_usando_fonte_atual");
  }
});

test("20. flag inválida: comportamento seguro + degraded_state explícito", () => {
  const s = selecionarFonte("producao-total");
  assert.equal(s.fonte, "current");           // nunca ativa simulador por engano
  assert.equal(s.degraded_state, "flag_invalida");
  assert.equal(s.flag_bruta, "producao-total"); // auditável
});

test("flag válida: current e simulator, case-insensitive, auditável e reversível", () => {
  assert.equal(selecionarFonte("current").fonte, "current");
  assert.equal(selecionarFonte("simulator").fonte, "simulator");
  assert.equal(selecionarFonte("  SIMULATOR ").fonte, "simulator");
  assert.equal(selecionarFonteDoAmbiente({ [NOME_FLAG]: "simulator" }).fonte, "simulator");
  assert.equal(selecionarFonteDoAmbiente({}).fonte, "current"); // reverter = remover a env
});

test("estados da fonte: os 8 estados do contrato, com prioridade de falha", () => {
  assert.deepEqual(ESTADOS_FONTE, ["initializing", "ready", "replaying", "stale",
    "disconnected", "degraded", "failed", "stopped"]);
  const pronto = snapDe("fluxo_normal");
  assert.equal(derivarEstadoFonte({ snapshot: null, inicializando: true }).estado, "initializing");
  assert.equal(derivarEstadoFonte({ snapshot: pronto }).estado, "ready");
  assert.equal(derivarEstadoFonte({ snapshot: pronto, replayStatus: { em_andamento: true } }).estado, "replaying");
  assert.equal(derivarEstadoFonte({ snapshot: snapDe("fonte_atrasada") }).estado, "stale");
  assert.equal(derivarEstadoFonte({ snapshot: snapDe("fonte_vencida") }).estado, "stale");
  assert.equal(derivarEstadoFonte({ snapshot: pronto, degradedState: "x" }).estado, "degraded");
  assert.equal(derivarEstadoFonte({ snapshot: pronto, erro: new Error("boom") }).estado, "failed");
  assert.equal(derivarEstadoFonte({ snapshot: pronto, parada: true }).estado, "stopped");
  // falha tem prioridade sobre tudo — erro nunca se perde em silêncio
  assert.equal(derivarEstadoFonte({ snapshot: pronto, erro: new Error("e"), replayStatus: { em_andamento: true } }).estado, "failed");
});

test("janela só existe em ready — dado antigo nunca aparece como atual", () => {
  const velho = snapDe("fonte_vencida"); // fonte de status vencida
  const pl = montarPayloadInterface({ snapshot: velho, storeTimeZone: TZ, origem: "simulator" });
  assert.equal(pl.source_status, "stale");
  assert.equal(pl.janela, null); // NUNCA como janela corrente
  assert.ok(pl.ultimo_confiavel); // último confiável só com carimbo e aviso
  assert.equal(pl.ultimo_confiavel.dia_local, pl.operational_day_key);
  assert.match(pl.ultimo_confiavel.aviso, /dado antigo/);
  // freshness e gate vêm do núcleo, preservados — nunca recalculados
  assert.equal(pl.gate_staleness.permitir_acao_dominante, false);
  assert.equal(pl.freshness.sim_status.freshness_state, "vencida");
});

test("durante replay: interface sabe, dados parciais não parecem estado final", () => {
  const pl = montarPayloadInterface({
    snapshot: snapDe("fluxo_normal"), storeTimeZone: TZ, origem: "simulator",
    replayStatus: { em_andamento: true, eventos_relidos: 2 }
  });
  assert.equal(pl.source_status, "replaying");
  assert.equal(pl.janela, null); // ações dependentes de estado consolidado protegidas
  assert.equal(pl.replay_status.em_andamento, true);
});

test("falha e ausência de payload: nada de Calmo — o payload nem tem esse conceito", () => {
  const pl = montarPayloadInterface({
    snapshot: null, storeTimeZone: TZ, origem: "simulator", erro: new Error("simulador_nao_iniciou")
  });
  assert.equal(pl.source_status, "failed");
  assert.equal(pl.source_motivo, "simulador_nao_iniciou"); // erro preservado
  assert.equal(pl.janela, null);
  // o adaptador NUNCA transporta estado cognitivo: calmo/ambiente/foco só
  // nascem do motor sobre a janela — sem janela, não existe como inventá-los
  const chaves = JSON.stringify(Object.keys(pl));
  for (const proibida of ["calmo", "ambiente", "foco", "mode"]) {
    assert.ok(!chaves.toLowerCase().includes(proibida), `payload nao pode ter ${proibida}`);
  }
});
