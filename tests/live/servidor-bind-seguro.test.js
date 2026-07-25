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
const fs = require("node:fs");
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

/* ============================================================================
 * Extensão desta missão (gate de reconciliação do bind seguro) — adicionada
 * além do que o commit 5e22553 trouxe. Duas provas que o cherry-pick sozinho
 * não cobria: (1) asserção estrutural explícita contra o literal "0.0.0.0"
 * hardcoded (nunca substitui a prova comportamental acima, só complementa);
 * (2) falha de inicialização (porta ocupada) precisa encerrar o processo
 * filho sozinha, sem travar o teste nem deixar processo pendurado.
 * ==========================================================================*/

describe("asserção estrutural — impede regressão direta do literal 0.0.0.0 como padrão", () => {
  test("servir_v1.js nunca volta a chamar listen com \"0.0.0.0\" hardcoded, e o default continua 127.0.0.1", () => {
    const codigo = fs.readFileSync(path.join(RAIZ, "tools", "servir_v1.js"), "utf8");
    assert.doesNotMatch(
      codigo, /servidor\.listen\(PORT,\s*"0\.0\.0\.0"/,
      "regressão direta: bind hardcoded em 0.0.0.0, sem passar por HOST/opt-in"
    );
    assert.match(
      codigo, /const HOST = process\.env\.HOST \|\| "127\.0\.0\.1"/,
      "host padrão precisa continuar resolvendo para 127.0.0.1 quando HOST não é informado"
    );
  });
});

describe("falha de inicialização encerra corretamente (sem processo órfão)", () => {
  test("segunda instância na mesma porta falha (EADDRINUSE) e o processo filho termina sozinho, sem travar o teste", async () => {
    const PORT = 6550 + (process.pid % 100);
    const primeiro = subir(PORT, {});
    try {
      await esperar(`http://127.0.0.1:${PORT}`, 40);

      const segundo = subir(PORT, {});
      const codigoSaida = await new Promise((resolve) => {
        segundo.once("exit", (code) => resolve(code));
        setTimeout(() => resolve(undefined), 5000); // nunca trava o teste indefinidamente
      });

      assert.notEqual(
        codigoSaida, undefined,
        "processo com porta ocupada precisa terminar sozinho (EADDRINUSE -> process.exit), nunca ficar pendurado"
      );
      assert.equal(
        codigoSaida, 1,
        "saída esperada é o código de erro que o próprio servir_v1.js já registra para EADDRINUSE"
      );
    } finally {
      primeiro.kill();
    }
  });
});
