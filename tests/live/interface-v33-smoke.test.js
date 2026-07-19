/* ============================================================================
 * Fumaça V3.3 — a aplicação real sobe num worktree limpo e o organismo tem
 * dado para renderizar: Calmo não fica vazio, Foco pode ser ativado pelo
 * MOTOR REAL (nunca forçado), recursos de boot sem 404, QA só em modo dev.
 * O teste sobe tools/servir_v1.js de verdade (porta própria, flag simulator
 * explícita para ser determinístico em qualquer máquina) e valida o payload
 * pelo mesmo caminho do browser. A camada DOM é validada visualmente (CDP)
 * fora desta suíte; aqui fica o contrato reproduzível de máquina limpa.
 * ==========================================================================*/
"use strict";

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");

const RAIZ = path.join(__dirname, "..", "..");
const PORT = 5230 + (process.pid % 200);
const BASE = `http://127.0.0.1:${PORT}`;

let servidor = null;

async function esperarServidor(tentativas) {
  for (let i = 0; i < tentativas; i++) {
    try {
      const r = await fetch(BASE + "/api/config");
      if (r.ok) return await r.json();
    } catch { /* ainda subindo */ }
    await new Promise((res) => setTimeout(res, 250));
  }
  throw new Error("servidor_v1_nao_subiu");
}

before(async () => {
  servidor = spawn(process.execPath, [path.join(RAIZ, "tools", "servir_v1.js")], {
    cwd: RAIZ,
    env: { ...process.env, PORT: String(PORT), DELIVERYOS_LIVE_SOURCE: "simulator" },
    stdio: "ignore"
  });
  await esperarServidor(40);
});

after(() => {
  if (servidor) servidor.kill();
});

test("fumaça: config responde e respeita a flag explícita", async () => {
  const cfg = await (await fetch(BASE + "/api/config")).json();
  assert.equal(cfg.fonte, "simulator");
});

test("fumaça: todos os recursos de boot respondem sem 404", async () => {
  const recursos = [
    "/app-v1/index.html",
    "/app-v1/style.css",
    "/app-v1/app.js",
    "/app-v1/v33-mocks.js",
    "/app-v1/manifest.webmanifest",
    "/src/perfil-delivery/motor.js",
    "/src/perfil-delivery/decisao.js",
    "/src/live/interface/adaptador-v33.js",
    "/data/cardapio_knowledge_seed.json"
  ];
  for (const r of recursos) {
    const resp = await fetch(BASE + r);
    assert.equal(resp.status, 200, "recurso de boot falhou: " + r);
  }
});

test("fumaça: index é a superfície do organismo, com QA oculto por padrão", async () => {
  const html = await (await fetch(BASE + "/app-v1/index.html")).text();
  assert.match(html, /id="palco"/, "palco do organismo ausente");
  assert.match(html, /id="qaCatalog"[^>]*hidden/, "catálogo QA precisa nascer oculto");
  assert.match(html, /adaptador-v33\.js/, "adaptador V3.3 não carregado");
  const appJs = fs.readFileSync(path.join(RAIZ, "app-v1", "app.js"), "utf8");
  assert.match(appJs, /params\.get\("qa"\) === "1"/, "gate de QA (?qa=1) ausente");
});

test("fumaça: a janela servida faz o MOTOR REAL produzir Calmo vivo e Foco", async () => {
  const pl = await (await fetch(BASE + "/api/fonte?cenario=foco")).json();
  assert.equal(pl.source_status, "ready");
  assert.ok(pl.janela && pl.janela.NIGHT.length > 0, "janela vazia");
  assert.equal(pl.janela.meta.fonte, "simulada", "dado sintético precisa vir rotulado");

  // mesmo caminho do browser: motor real decide, nada é forçado
  const MOTOR = require(path.join(RAIZ, "src", "perfil-delivery", "motor.js"));
  const SEED = require(path.join(RAIZ, "data", "cardapio_knowledge_seed.json")).itens;
  const J = pl.janela;
  const FONTE = MOTOR.makeFonteItensFromRows(J.rows, SEED);
  const INFO = {};
  for (const o of J.NIGHT) INFO[o.id] = MOTOR.resolver(FONTE(o.id));
  const sess = MOTOR.novaSessao();
  const modos = [];
  for (let t = J.T0; t <= J.T1; t++) {
    const R = MOTOR.step(t, J.NIGHT, INFO, sess);
    modos.push({ t, mode: R.mode, emand: R.emand });
  }
  const calmoVivo = modos.find((m) => m.mode === "calmo" && m.emand > 0);
  const primeiroFoco = modos.findIndex((m) => m.mode === "foco");
  const primeiroCalmo = modos.findIndex((m) => m.mode === "calmo");
  assert.ok(calmoVivo, "Calmo nunca ficou vivo (emand>0) — abriria vazio");
  assert.ok(primeiroFoco > 0, "o motor nunca produziu Foco — Foco não seria ativável");
  assert.ok(primeiroCalmo >= 0 && primeiroCalmo < primeiroFoco,
    "o produto precisa poder abrir em Calmo antes do Foco");
});

test("fumaça: cenário ambiente também produz clima sem foco", async () => {
  const pl = await (await fetch(BASE + "/api/fonte?cenario=ambiente")).json();
  assert.equal(pl.source_status, "ready");
  const MOTOR = require(path.join(RAIZ, "src", "perfil-delivery", "motor.js"));
  const SEED = require(path.join(RAIZ, "data", "cardapio_knowledge_seed.json")).itens;
  const J = pl.janela;
  const FONTE = MOTOR.makeFonteItensFromRows(J.rows, SEED);
  const INFO = {};
  for (const o of J.NIGHT) INFO[o.id] = MOTOR.resolver(FONTE(o.id));
  const sess = MOTOR.novaSessao();
  let viuAmbiente = false, viuFoco = false;
  for (let t = J.T0; t <= J.T1; t++) {
    const R = MOTOR.step(t, J.NIGHT, INFO, sess);
    if (R.mode === "ambiente") viuAmbiente = true;
    if (R.mode === "foco") viuFoco = true;
  }
  assert.ok(viuAmbiente, "cenário ambiente não produziu clima");
  assert.equal(viuFoco, false, "cenário ambiente vazou para Foco");
});
