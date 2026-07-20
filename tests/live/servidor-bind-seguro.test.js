/* ============================================================================
 * Segurança — bind do servidor de dev (Auditoria 2026-07-20, P2).
 * ----------------------------------------------------------------------------
 * O servir_v1.js serve a RAIZ do repo por design (o browser carrega motor.js).
 * Bindar em 0.0.0.0 por padrão expõe o repositório inteiro na LAN. Estes
 * testes travam o comportamento seguro:
 *   - por padrão, escuta SÓ em localhost (não responde no IP de LAN);
 *   - a capacidade de testar no celular continua existindo via HOST=0.0.0.0.
 * ==========================================================================*/
"use strict";

const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const path = require("node:path");
const os = require("node:os");

const RAIZ = path.join(__dirname, "..", "..");

function ipLanV4() {
  const nis = os.networkInterfaces();
  for (const nome of Object.keys(nis)) {
    for (const i of nis[nome] || []) {
      if (i && i.family === "IPv4" && !i.internal) return i.address;
    }
  }
  return null;
}

async function esperar(base, tentativas) {
  for (let i = 0; i < tentativas; i++) {
    try {
      const r = await fetch(base + "/api/config");
      if (r.ok) return true;
    } catch { /* subindo */ }
    await new Promise((res) => setTimeout(res, 250));
  }
  throw new Error("nao_subiu");
}

function subir(port, envExtra) {
  return spawn(process.execPath, [path.join(RAIZ, "tools", "servir_v1.js")], {
    cwd: RAIZ,
    env: Object.assign({}, process.env, { PORT: String(port), DELIVERYOS_LIVE_SOURCE: "simulator" }, envExtra || {}),
    stdio: "ignore"
  });
}

describe("bind seguro por padrão (localhost apenas)", () => {
  const PORT = 6350 + (process.pid % 100);
  let servidor = null;
  const lan = ipLanV4();

  before(async () => {
    servidor = subir(PORT, {}); // sem HOST → deve cair no default 127.0.0.1
    await esperar(`http://127.0.0.1:${PORT}`, 40);
  });
  after(() => { if (servidor) servidor.kill(); });

  test("responde em localhost", async () => {
    const r = await fetch(`http://127.0.0.1:${PORT}/api/config`);
    assert.equal(r.ok, true);
  });

  test("NÃO responde no IP de LAN (repo não exposto na rede por padrão)", async (t) => {
    if (!lan) { t.skip("máquina sem IP de LAN para testar"); return; }
    let alcancavel = false;
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 1500);
      const r = await fetch(`http://${lan}:${PORT}/api/config`, { signal: ctrl.signal });
      clearTimeout(timer);
      alcancavel = r.ok;
    } catch {
      alcancavel = false; // recusa/timeout = correto (não escutando na LAN)
    }
    assert.equal(alcancavel, false, "servidor não deveria estar acessível na LAN sem HOST=0.0.0.0");
  });
});

describe("opt-in de LAN preservado (HOST=0.0.0.0)", () => {
  const PORT = 6450 + (process.pid % 100);
  let servidor = null;
  const lan = ipLanV4();

  before(async () => {
    servidor = subir(PORT, { HOST: "0.0.0.0" });
    await esperar(`http://127.0.0.1:${PORT}`, 40);
  });
  after(() => { if (servidor) servidor.kill(); });

  test("com HOST=0.0.0.0 volta a responder no IP de LAN (capacidade de celular preservada)", async (t) => {
    if (!lan) { t.skip("máquina sem IP de LAN para testar"); return; }
    const r = await fetch(`http://${lan}:${PORT}/api/config`);
    assert.equal(r.ok, true, "com opt-in explícito o acesso via LAN deve funcionar");
  });
});
