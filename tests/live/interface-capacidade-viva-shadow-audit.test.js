/* ============================================================================
 * Fumaça de AUDITORIA — Capacidade Viva human-v2 em modo sombra (Fase 2E.2).
 * ----------------------------------------------------------------------------
 * Complementa tests/live/interface-capacidade-viva-shadow-smoke.test.js
 * (Fase 2E.1) com as verificações específicas desta fase de auditoria:
 *   1) o novo launcher tools/servir_v1_shadow.js liga a flag de verdade;
 *   2) falha técnica ao vivo (config ausente) não derruba o servidor e não
 *      contamina o canal operacional;
 *   3) o texto/HTML servido ao operador é idêntico com sombra ligada ou
 *      desligada, e nunca menciona o motor sombra.
 *
 * Cada describe usa seu próprio diretório de log (via
 * CAPACIDADE_VIVA_HUMAN_V2_SHADOW_LOG_PATH/_FAILURE_LOG_PATH) para não
 * disputar o arquivo real com outros arquivos de teste rodando em paralelo.
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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cv-shadow-audit-" + tag + "-"));
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

function subirServidor(scriptRelativo, port, envExtra) {
  return spawn(process.execPath, [path.join(RAIZ, scriptRelativo)], {
    cwd: RAIZ,
    env: Object.assign({}, process.env, { PORT: String(port), DELIVERYOS_LIVE_SOURCE: "simulator" }, envExtra || {}),
    stdio: "ignore"
  });
}

describe("launcher tools/servir_v1_shadow.js liga a flag de verdade", () => {
  const PORT = 5850 + (process.pid % 100);
  const BASE = `http://127.0.0.1:${PORT}`;
  const scratch = scratchLogPaths("launcher");
  let servidor = null;

  before(async () => {
    servidor = subirServidor("tools/servir_v1_shadow.js", PORT, scratch.env);
    await esperarServidor(BASE, 40);
  });
  after(() => { if (servidor) servidor.kill(); });

  test("uma requisição a /api/fonte gera observação sombra real via o launcher novo", async () => {
    const linhasAntes = contarLinhas(scratch.logPath);
    const pl = await (await fetch(BASE + "/api/fonte?cenario=foco")).json();
    assert.equal(pl.source_status, "ready");
    await new Promise((res) => setTimeout(res, 200));
    assert.ok(contarLinhas(scratch.logPath) > linhasAntes, "o launcher não ligou o modo sombra de verdade");
  });
});

describe("falha técnica ao vivo (config ausente) — Copiloto e canal técnico", () => {
  const PORT = 5950 + (process.pid % 100);
  const BASE = `http://127.0.0.1:${PORT}`;
  const scratch = scratchLogPaths("falha");
  let servidor = null;

  before(async () => {
    servidor = subirServidor("tools/servir_v1.js", PORT, Object.assign({
      CAPACIDADE_VIVA_HUMAN_V2_SHADOW: "true",
      CAPACIDADE_VIVA_HUMAN_V2_SHADOW_CONFIG_PATH: path.join(RAIZ, "auditoria_2e2_config_ausente.json")
    }, scratch.env));
    await esperarServidor(BASE, 40);
  });
  after(() => { if (servidor) servidor.kill(); });

  test("/api/fonte continua ready mesmo com configuração sombra ausente", async () => {
    const pl = await (await fetch(BASE + "/api/fonte?cenario=foco")).json();
    assert.equal(pl.source_status, "ready");
    assert.ok(pl.janela && pl.janela.NIGHT.length > 0);
  });

  test("a falha vai só para o canal técnico — canal operacional não recebe nada", async () => {
    const obsAntes = contarLinhas(scratch.logPath);
    const falhasAntes = contarLinhas(scratch.failurePath);
    await fetch(BASE + "/api/fonte?cenario=foco");
    await new Promise((res) => setTimeout(res, 200));
    assert.ok(contarLinhas(scratch.failurePath) > falhasAntes, "falha técnica não foi registrada");
    assert.equal(contarLinhas(scratch.logPath), obsAntes, "uma observação foi registrada apesar da config ausente");
  });
});

describe("isolamento completo da interface — texto/HTML idênticos com sombra ligada ou desligada", () => {
  const PORT_OFF = 6050 + (process.pid % 100);
  const PORT_ON = 6150 + (process.pid % 100);
  const BASE_OFF = `http://127.0.0.1:${PORT_OFF}`;
  const BASE_ON = `http://127.0.0.1:${PORT_ON}`;
  const scratch = scratchLogPaths("isolamento");
  let servidorOff = null;
  let servidorOn = null;

  before(async () => {
    servidorOff = subirServidor("tools/servir_v1.js", PORT_OFF, { NODE_ENV: "production" });
    servidorOn = subirServidor("tools/servir_v1_shadow.js", PORT_ON, scratch.env);
    await Promise.all([esperarServidor(BASE_OFF, 40), esperarServidor(BASE_ON, 40)]);
  });
  after(() => { if (servidorOff) servidorOff.kill(); if (servidorOn) servidorOn.kill(); });

  test("app-v1/index.html e app.js servidos são byte-idênticos nos dois modos", async () => {
    const [htmlOff, htmlOn] = await Promise.all([
      (await fetch(BASE_OFF + "/app-v1/index.html")).text(),
      (await fetch(BASE_ON + "/app-v1/index.html")).text()
    ]);
    assert.equal(htmlOff, htmlOn);
    const [jsOff, jsOn] = await Promise.all([
      (await fetch(BASE_OFF + "/app-v1/app.js")).text(),
      (await fetch(BASE_ON + "/app-v1/app.js")).text()
    ]);
    assert.equal(jsOff, jsOn);
  });

  test("nenhum recurso servido ao navegador menciona o motor sombra", async () => {
    const recursos = ["/app-v1/index.html", "/app-v1/app.js", "/app-v1/style.css"];
    for (const r of recursos) {
      const [txtOff, txtOn] = await Promise.all([
        (await fetch(BASE_OFF + r)).text(),
        (await fetch(BASE_ON + r)).text()
      ]);
      for (const txt of [txtOff, txtOn]) {
        assert.ok(!/capacidade-viva\/shadow|human-v2|cv-cal-tata|shadow_observation/i.test(txt), r + " vaza referência ao motor sombra");
      }
    }
  });

  test("payload de /api/fonte com mesma seed é idêntico (exceto relógio) nos dois modos", async () => {
    const [plOff, plOn] = await Promise.all([
      (await fetch(BASE_OFF + "/api/fonte?cenario=foco&seed=audit-2e2-live")).json(),
      (await fetch(BASE_ON + "/api/fonte?cenario=foco&seed=audit-2e2-live")).json()
    ]);
    const semRelogio = (p) => JSON.stringify(Object.assign({}, p, { gerado_em: null }));
    assert.equal(semRelogio(plOff), semRelogio(plOn));
  });
});
