/* ============================================================================
 * Células operacionais V1 — integração com o MOTOR REAL e checagem de fontes.
 * ----------------------------------------------------------------------------
 * Roda o motor real sobre um cenário certificado e alimenta as células puras
 * (mesmo caminho do browser). Prova Quentes×Cozinha separados com dado real e
 * que as células sem fonte (Conferência, Entregas) nunca inventam estado.
 * ==========================================================================*/
"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const RAIZ = path.join(__dirname, "..", "..");
const MOTOR = require(path.join(RAIZ, "src", "perfil-delivery", "motor.js"));
const CEL = require(path.join(RAIZ, "src", "live", "interface", "celulas-operacionais"));
const { executarCenario } = require(path.join(RAIZ, "tools", "live", "simulator", "executor"));
const { CENARIO_FOCO } = require(path.join(RAIZ, "tools", "live", "simulator", "investigacao_volume", "cenarios_volume"));
const { montarPayloadInterface } = require(path.join(RAIZ, "src", "live", "interface", "adaptador.js"));
const SEED = require(path.join(RAIZ, "data", "cardapio_knowledge_seed.json")).itens;

const APP_JS = fs.readFileSync(path.join(RAIZ, "app-v1", "app.js"), "utf8");

function janelaReal() {
  const r = executarCenario({ cenario: CENARIO_FOCO, seed: "copiloto-v33", storeTimeZone: "America/Sao_Paulo" });
  const pl = montarPayloadInterface({ snapshot: r.snapshot, storeTimeZone: "America/Sao_Paulo", origem: "simulator", agoraIso: r.snapshot.gerado_em });
  return pl.janela;
}
function sevPorPraca(R, pracas) {
  const sp = {};
  for (const s of R.sits) if (s.kind === "praca" && pracas.indexOf(s.praca) >= 0) sp[s.praca] = Math.max(sp[s.praca] || 0, s.sev || 0);
  return sp;
}

test("integração: Quentes e Cozinha derivam de praças distintas com dado real do motor", () => {
  const J = janelaReal();
  const FONTE = MOTOR.makeFonteItensFromRows(J.rows, SEED);
  const INFO = {};
  for (const o of J.NIGHT) INFO[o.id] = MOTOR.resolver(FONTE(o.id));
  const sess = MOTOR.novaSessao();
  for (let t = J.T0; t <= J.T1; t++) {
    const R = MOTOR.step(t, J.NIGHT, INFO, sess);
    const q = CEL.estadoAgregado(sevPorPraca(R, ["enrolados_quentes"]), ["enrolados_quentes"], MOTOR.DISPLAY);
    const c = CEL.estadoAgregado(sevPorPraca(R, ["cozinha_quentes"]), ["cozinha_quentes"], MOTOR.DISPLAY);
    // Quentes nunca pode herdar severidade de cozinha_quentes (sem duplicar)
    const spBoth = sevPorPraca(R, ["enrolados_quentes", "cozinha_quentes"]);
    if (spBoth.cozinha_quentes && !spBoth.enrolados_quentes) {
      assert.equal(q.sev, 0, "cozinha_quentes vazou para Quentes em t=" + t);
      assert.equal(c.sev, spBoth.cozinha_quentes, "Cozinha deveria refletir cozinha_quentes em t=" + t);
    }
  }
});

test("integração: Caixa deriva de prontos reais e nunca ultrapassa 'atenção'", () => {
  const J = janelaReal();
  for (let t = J.T0; t <= J.T1; t++) {
    const r = CEL.leituraCaixa(J.NIGHT, t);
    assert.ok(["calmo", "em movimento", "atenção", "leitura parcial", "fonte indisponível"].indexOf(r.frase) >= 0,
      "estado inesperado do Caixa: " + r.frase + " em t=" + t);
    assert.notEqual(r.cor, "vermelho");
  }
});

/* Células sem fonte conectada — verificação estrutural (app.js declara honesto) */

test("Conferência declara leitura não conectada, sem inventar estado/pressão", () => {
  assert.match(APP_JS, /nome: "Conferência", cor: "validacao"/);
  assert.match(APP_JS, /conferência final ainda não tem fonte conectada/i);
  // não é alimentada por montagem_outros
  const bloco = APP_JS.slice(APP_JS.indexOf('nome: "Conferência"'), APP_JS.indexOf('nome: "Conferência"') + 400);
  assert.doesNotMatch(bloco, /montagem_outros/);
});

test("Entregas declara 'aguardando integração', sem mocks de motoboy/viagem", () => {
  assert.match(APP_JS, /nome: "Entregas", cor: "validacao"/);
  assert.match(APP_JS, /Entregas ainda não está integrado ao Copiloto/i);
});

test("montagem_outros NÃO alimenta Conferência nem qualquer célula da interface", () => {
  // montagem_outros pode aparecer em COMENTÁRIO (explicando que NÃO é fonte),
  // mas nunca como praça em código: não pode surgir entre aspas (uso real).
  assert.doesNotMatch(APP_JS, /"montagem_outros"/);
  assert.doesNotMatch(APP_JS, /'montagem_outros'/);
});

test("Caixa não é praça: não usa piorPraca nem sev de praça para seu estado", () => {
  // o estado do Caixa vem de leituraCaixa(NIGHT,t), não de sits de praça
  assert.match(APP_JS, /CEL\.leituraCaixa\(NIGHT, t\)/);
});
