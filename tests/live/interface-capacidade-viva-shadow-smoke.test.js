/* ============================================================================
 * Fumaça — Capacidade Viva human-v2 em MODO SOMBRA (Fase 2E.1, §10).
 * ----------------------------------------------------------------------------
 * Sobe tools/servir_v1.js de verdade (mesmo padrão de
 * interface-v33-smoke.test.js) e prova, pelo caminho real que o navegador
 * usa, as três garantias que só um teste de servidor vivo consegue provar:
 *
 *   1) Copiloto continua respondendo normalmente mesmo com o motor sombra
 *      quebrado (config ausente/hash incorreto) — §9/§10.
 *   2) O payload de /api/fonte é IDÊNTICO com o modo sombra ligado ou
 *      desligado — nenhum campo novo vaza para a interface (§8).
 *   3) Com a feature flag desligada (produção sem configuração), o motor
 *      sombra nem executa — nenhuma observação é registrada (§7/§10).
 *
 * Cada describe usa seu próprio diretório de log (via
 * CAPACIDADE_VIVA_HUMAN_V2_SHADOW_LOG_PATH/_FAILURE_LOG_PATH) para não
 * disputar o arquivo real com outros arquivos de teste rodando em paralelo
 * (ver tests/live/interface-capacidade-viva-shadow-audit.test.js).
 * ==========================================================================*/
"use strict";

const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");

const RAIZ = path.join(__dirname, "..", "..");

function contarLinhas(filePath) {
  if (!fs.existsSync(filePath)) return 0;
  return fs.readFileSync(filePath, "utf8").split("\n").filter((l) => l.trim()).length;
}

function scratchLogPaths(tag) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cv-shadow-smoke-" + tag + "-"));
  const logPath = path.join(dir, "observacoes.runtime.jsonl");
  const failurePath = path.join(dir, "falhas.runtime.jsonl");
  return {
    logPath, failurePath,
    env: {
      CAPACIDADE_VIVA_HUMAN_V2_SHADOW_LOG_PATH: logPath,
      CAPACIDADE_VIVA_HUMAN_V2_SHADOW_FAILURE_LOG_PATH: failurePath
    }
  };
}

async function esperarServidor(base, tentativas) {
  for (let i = 0; i < tentativas; i++) {
    try {
      const r = await fetch(base + "/api/config");
      if (r.ok) return true;
    } catch { /* ainda subindo */ }
    await new Promise((res) => setTimeout(res, 250));
  }
  throw new Error("servidor_v1_nao_subiu");
}

function subirServidor(port, envExtra) {
  return spawn(process.execPath, [path.join(RAIZ, "tools", "servir_v1.js")], {
    cwd: RAIZ,
    env: Object.assign({}, process.env, { PORT: String(port), DELIVERYOS_LIVE_SOURCE: "simulator" }, envExtra || {}),
    stdio: "ignore"
  });
}

describe("modo sombra ligado com configuração QUEBRADA — Copiloto precisa continuar funcionando", () => {
  const PORT = 5450 + (process.pid % 100);
  const BASE = `http://127.0.0.1:${PORT}`;
  const scratch = scratchLogPaths("quebrada");
  let servidor = null;

  before(async () => {
    servidor = subirServidor(PORT, Object.assign({
      CAPACIDADE_VIVA_HUMAN_V2_SHADOW: "1",
      CAPACIDADE_VIVA_HUMAN_V2_SHADOW_CONFIG_PATH: path.join(RAIZ, "nao_existe_de_verdade.json")
    }, scratch.env));
    await esperarServidor(BASE, 40);
  });
  after(() => { if (servidor) servidor.kill(); });

  test("Copiloto continua funcionando quando o motor sombra falha", async () => {
    const pl = await (await fetch(BASE + "/api/fonte?cenario=foco")).json();
    assert.equal(pl.source_status, "ready");
    assert.ok(pl.janela && pl.janela.NIGHT.length > 0, "janela vazia — falha do motor sombra afetou o Copiloto");
  });

  test("a falha do motor sombra é registrada só no canal técnico, nunca como pressão operacional", async () => {
    const falhasAntes = contarLinhas(scratch.failurePath);
    await fetch(BASE + "/api/fonte?cenario=foco");
    await new Promise((res) => setTimeout(res, 200));
    const falhasDepois = contarLinhas(scratch.failurePath);
    assert.ok(falhasDepois > falhasAntes, "nenhuma falha técnica foi registrada — canal de falha (§9) não disparou");
  });
});

describe("modo sombra ligado com configuração válida — payload de /api/fonte não muda", () => {
  const PORT_OFF = 5550 + (process.pid % 100);
  const PORT_ON = 5650 + (process.pid % 100);
  const BASE_OFF = `http://127.0.0.1:${PORT_OFF}`;
  const BASE_ON = `http://127.0.0.1:${PORT_ON}`;
  const scratch = scratchLogPaths("payload");
  let servidorOff = null;
  let servidorOn = null;

  before(async () => {
    servidorOff = subirServidor(PORT_OFF, { NODE_ENV: "production" }); // sem flag → sombra desligada
    servidorOn = subirServidor(PORT_ON, Object.assign({ CAPACIDADE_VIVA_HUMAN_V2_SHADOW: "1" }, scratch.env)); // sombra ligada, config real
    await Promise.all([esperarServidor(BASE_OFF, 40), esperarServidor(BASE_ON, 40)]);
  });
  after(() => { if (servidorOff) servidorOff.kill(); if (servidorOn) servidorOn.kill(); });

  test("/api/fonte devolve exatamente os mesmos campos com sombra ligada ou desligada", async () => {
    const [plOff, plOn] = await Promise.all([
      (await fetch(BASE_OFF + "/api/fonte?cenario=foco&seed=copiloto-v33")).json(),
      (await fetch(BASE_ON + "/api/fonte?cenario=foco&seed=copiloto-v33")).json()
    ]);
    assert.deepEqual(Object.keys(plOff).sort(), Object.keys(plOn).sort(), "campos do payload divergem entre sombra ligada/desligada");
    assert.deepEqual(Object.keys(plOff.janela).sort(), Object.keys(plOn.janela).sort());
    // mesmo cenário/seed → mesmo conteúdo determinístico (o campo gerado_em pode variar por relógio de execução)
    const semRelogio = (p) => JSON.stringify(Object.assign({}, p, { gerado_em: null }));
    assert.equal(semRelogio(plOff), semRelogio(plOn), "conteúdo do payload divergiu com o modo sombra ligado");
  });
});

describe("feature flag desligada — motor sombra nem executa", () => {
  const PORT = 5750 + (process.pid % 100);
  const BASE = `http://127.0.0.1:${PORT}`;
  const scratch = scratchLogPaths("flagoff");
  let servidor = null;

  before(async () => {
    servidor = subirServidor(PORT, Object.assign({ NODE_ENV: "production" }, scratch.env)); // sem CAPACIDADE_VIVA_HUMAN_V2_SHADOW, produção → desligado
    await esperarServidor(BASE, 40);
  });
  after(() => { if (servidor) servidor.kill(); });

  test("nenhuma observação sombra é registrada com a flag desligada", async () => {
    const linhasAntes = contarLinhas(scratch.logPath);
    const pl = await (await fetch(BASE + "/api/fonte?cenario=foco")).json();
    assert.equal(pl.source_status, "ready"); // Copiloto funciona normalmente
    await new Promise((res) => setTimeout(res, 200));
    assert.equal(contarLinhas(scratch.logPath), linhasAntes, "uma observação foi registrada mesmo com a feature flag desligada");
  });
});
