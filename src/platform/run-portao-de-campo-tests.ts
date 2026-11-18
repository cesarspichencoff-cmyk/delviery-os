/**
 * Portão de campo (D101) — processos reais: o binário do portão (dist/), o
 * piloto real (dist/) e uma plataforma falsa que registra tudo o que recebe.
 *
 * Prova a superfície pública: só a lista fechada passa; console, Copiloto,
 * backups, despacho, saúde e truques de caminho morrem no portão sem tocar em
 * destino nenhum; cookie e marca forjada não atravessam; corpo acima do teto é
 * recusado; no campo só motoboy entra — código de gerente recebe a mesma recusa
 * de código errado. Sintético: códigos do exemplo do piloto, nada real.
 */
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as http from "node:http";
import { createServer as createNetServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ROTAS_DE_CAMPO, rotaDe } from "./campo/portao-de-campo";

const ROOT = process.cwd();
const RIDER = "CHANGE_ME_RIDER_TOKEN";
const OPS = "CHANGE_ME_OPS_TOKEN";
const ADMIN = "CHANGE_ME_ADMIN_TOKEN";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const freePort = () => new Promise<number>((resolve) => {
  const s = createNetServer();
  s.listen(0, "127.0.0.1", () => { const p = (s.address() as { port: number }).port; s.close(() => resolve(p)); });
});
interface Resposta { status: number; headers: http.IncomingHttpHeaders; body: string }
function pedir(port: number, o: { method?: string; path: string; headers?: Record<string, string>; body?: string | Buffer }): Promise<Resposta> {
  return new Promise((resolve) => {
    const req = http.request({ host: "127.0.0.1", port, method: o.method ?? "GET", path: o.path, headers: o.headers ?? {} }, (res) => {
      const partes: Buffer[] = [];
      res.on("data", (c: Buffer) => partes.push(c));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(partes).toString("utf8") }));
      res.on("error", () => resolve({ status: -1, headers: {}, body: "" }));
    });
    req.on("error", () => resolve({ status: -1, headers: {}, body: "" }));
    if (o.body !== undefined) req.write(o.body);
    req.end();
  });
}

async function main(): Promise<void> {
  let ok = 0;
  const prova = async (nome: string, fn: () => Promise<void> | void) => { await fn(); ok += 1; console.log("PASS " + nome); };

  await prova("a lista fechada é pequena e só tem rotas do motoboy e do aparelho", () => {
    assert.ok(ROTAS_DE_CAMPO.length <= 20, "a superfície pública cresceu: " + ROTAS_DE_CAMPO.length);
    for (const r of ROTAS_DE_CAMPO)
      assert.ok(/^\/(rider-mobile\/|shared\/|api\/(session|snapshot|policies|term|command|events\/batch|device\/|gps\/batch))/.test(r.caminho), "rota fora do campo: " + r.caminho);
    for (const [m, p] of [["GET", "/"], ["GET", "/console/"], ["GET", "/copiloto/"], ["GET", "/api/health"], ["GET", "/api/command"],
      ["GET", "/api/backups"], ["POST", "/api/restore"], ["GET", "/api/trip/location"], ["GET", "/api/copiloto/source"],
      ["GET", "/api/ready-orders/observation"], ["POST", "/api/ready-order"], ["GET", "/ready"], ["GET", "/api/dispatch/trip/location"],
      ["GET", "/api/device/identity"], ["GET", "/api/device/pilot-identity"], ["DELETE", "/api/session"], ["GET", "/api/gps/batch"],
      ["GET", "/rider-mobile/../console/"], ["GET", "/rider-mobile/%2e%2e/console/"], ["GET", "//evil/rider-mobile/"],
      ["GET", "/api/snapshot?unit=OUTRA"], ["GET", "/shared/tokens.css/../../api/backups"]] as const)
      assert.equal(rotaDe(m, p), null, `${m} ${p} passaria pelo portão`);
  });

  const dir = mkdtempSync(join(tmpdir(), "portao-"));
  const filhos: ChildProcess[] = [];
  const recebidosPelaPlataforma: Array<{ method: string; url: string; headers: http.IncomingHttpHeaders; bytes: number }> = [];
  // Registra a CHEGADA (antes do corpo): um pedido abortado no meio também conta como "a plataforma foi tocada".
  const plataforma = http.createServer((req, res) => {
    const visto = { method: req.method || "", url: req.url || "", headers: req.headers, bytes: 0 };
    recebidosPelaPlataforma.push(visto);
    req.on("data", (c: Buffer) => { visto.bytes += c.length; });
    req.on("end", () => {
      res.writeHead(200, { "content-type": "application/json", "set-cookie": "vazou=1" });
      res.end(JSON.stringify({ ok: true, rota: req.url }));
    });
  });
  const portaPlataforma = await freePort();
  await new Promise<void>((r) => plataforma.listen(portaPlataforma, "127.0.0.1", r));
  const portaPiloto = await freePort(), portaPortao = await freePort();
  writeFileSync(join(dir, "flags.json"), JSON.stringify({ gps_capture_enabled: false }));
  writeFileSync(join(dir, "term.json"), JSON.stringify({}));
  const envPiloto: NodeJS.ProcessEnv = { ...process.env, ENTREGAS_UI_PORT: String(portaPiloto), ENTREGAS_PILOT_CONFIG: "config/entregas-pilot.example.json",
    ENTREGAS_DATA_DIR: join(dir, "data"), ENTREGAS_TERM_CONFIG: join(dir, "term.json"), ENTREGAS_GPS_FLAGS_CONFIG: join(dir, "flags.json") };
  for (const k of ["ENTREGAS_BIND", "ENTREGAS_HTTPS", "ENTREGAS_USERS", "ENTREGAS_STORAGE_BACKEND", "ENTREGAS_UNIT_CONFIG", "ENTREGAS_PLATFORM_URL"]) delete envPiloto[k];
  const subir = (bin: string, env: NodeJS.ProcessEnv) => {
    const p = spawn(process.execPath, [join(ROOT, bin)], { cwd: ROOT, env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    const log: string[] = [];
    p.stdout?.on("data", (d) => log.push(String(d))); p.stderr?.on("data", (d) => log.push(String(d)));
    filhos.push(p);
    return { p, log };
  };
  const piloto = subir("dist/tools/entregas_pilot_server.js", envPiloto);
  const portao = subir("dist/src/platform/bin/portao-de-campo.js", { ...process.env,
    DELIVERYOS_FIELD_LISTEN: `http://127.0.0.1:${portaPortao}/`, DELIVERYOS_FIELD_PILOT: `http://127.0.0.1:${portaPiloto}/`,
    DELIVERYOS_FIELD_CRITICAL: `http://127.0.0.1:${portaPlataforma}/` });
  const pelo = (o: Parameters<typeof pedir>[1]) => pedir(portaPortao, o);
  try {
    for (let i = 0; i < 150; i++) { if ((await pedir(portaPiloto, { path: "/api/health" })).status === 200 && portao.log.join("").includes("ouvindo")) break; await sleep(200); }
    assert.ok(portao.log.join("").includes("ouvindo"), "portão não subiu: " + portao.log.join(""));

    await prova("configuração insegura recusa o boot: escutar em todas as interfaces, destino sem porta, https", async () => {
      for (const [k, v] of [["DELIVERYOS_FIELD_LISTEN", "http://0.0.0.0:9/"], ["DELIVERYOS_FIELD_PILOT", "http://127.0.0.1/"], ["DELIVERYOS_FIELD_CRITICAL", "https://127.0.0.1:8080/"]]) {
        const env = { ...process.env, DELIVERYOS_FIELD_LISTEN: "http://127.0.0.1:9/", DELIVERYOS_FIELD_PILOT: "http://127.0.0.1:9/", DELIVERYOS_FIELD_CRITICAL: "http://127.0.0.1:9/", [k]: v };
        const p = spawn(process.execPath, [join(ROOT, "dist/src/platform/bin/portao-de-campo.js")], { cwd: ROOT, env, stdio: "ignore", windowsHide: true });
        const codigo = await new Promise<number | null>((r) => p.on("exit", r));
        assert.equal(codigo, 78, `${k}=${v} subiu`);
      }
    });

    await prova("fora da lista: 404 no portão, e nem piloto nem plataforma recebem nada", async () => {
      const antes = recebidosPelaPlataforma.length;
      for (const [method, path] of [["GET", "/"], ["GET", "/console/"], ["GET", "/copiloto/"], ["GET", "/api/backups"], ["GET", "/api/command"],
        ["GET", "/api/health"], ["GET", "/ready"], ["GET", "/api/dispatch/trip/location"], ["GET", "/rider-mobile/../console/"],
        ["GET", "/rider-mobile/%2e%2e/console/"], ["GET", "/api/device/identity"]] as const) {
        const r = await pelo({ method, path, headers: { authorization: "Bearer " + ADMIN } });
        assert.equal(r.status, 404, `${method} ${path} passou: ${r.status}`);
      }
      assert.equal(recebidosPelaPlataforma.length, antes);
    });

    await prova("a página do motoboy abre pelo portão; o console, que é a raiz do piloto, não", async () => {
      const pagina = await pelo({ path: "/rider-mobile/" });
      assert.equal(pagina.status, 200);
      assert.match(pagina.body, /<html|<!doctype/i);
      assert.equal((await pelo({ path: "/" })).status, 404);
    });

    await prova("no campo só motoboy entra: código de gerente e de expedição recebem a MESMA recusa do código errado", async () => {
      const login = (token: string) => pelo({ method: "POST", path: "/api/session", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) });
      const motoboy = await login(RIDER);
      assert.equal(motoboy.status, 200, motoboy.body);
      const errado = await login("codigo-que-nao-existe-xyz");
      const gerente = await login(ADMIN), expedicao = await login(OPS);
      assert.equal(gerente.status, 401); assert.equal(expedicao.status, 401);
      assert.equal(gerente.body, errado.body, "a tela confirmou que o código de gerente existe");
      // E com o código de gerente direto no cabeçalho, nada de operação pelo campo.
      const snap = await pelo({ path: "/api/snapshot", headers: { authorization: "Bearer " + ADMIN } });
      assert.equal(snap.status, 403);
      assert.match(snap.body, /papel_fora_do_campo/);
      const doMotoboy = await pelo({ path: "/api/snapshot", headers: { authorization: "Bearer " + RIDER } });
      assert.equal(doMotoboy.status, 200);
      // Pela porta interna do piloto (sem a marca), o gerente segue como antes.
      assert.equal((await pedir(portaPiloto, { path: "/api/snapshot", headers: { authorization: "Bearer " + ADMIN } })).status, 200);
    });

    await prova("a marca do campo não pode ser apagada pelo cliente, e cookie não atravessa", async () => {
      const r = await pelo({ path: "/api/snapshot", headers: { authorization: "Bearer " + ADMIN, "x-deliveryos-field": "0", cookie: "s=1" } });
      assert.equal(r.status, 403, "o cliente desligou a marca do campo");
    });

    await prova("rotas do aparelho vão à plataforma com o que o app manda — sem cookie, sem encaminhamento forjado — e a resposta não traz cookie", async () => {
      const antes = recebidosPelaPlataforma.length;
      const r = await pelo({ method: "POST", path: "/api/gps/batch", headers: { authorization: "Bearer tok-aparelho", "content-type": "application/json",
        cookie: "sessao=roubada", "x-forwarded-for": "1.2.3.4", "x-deliveryos-field": "0" }, body: JSON.stringify({ points: [], trip_grants: [] }) });
      assert.equal(r.status, 200);
      assert.equal(r.headers["set-cookie"], undefined, "cookie da origem vazou para o celular");
      const visto = recebidosPelaPlataforma[antes];
      assert.equal(visto.url, "/api/gps/batch");
      assert.equal(visto.headers.authorization, "Bearer tok-aparelho");
      assert.equal(visto.headers.cookie, undefined);
      assert.equal(visto.headers["x-forwarded-for"], undefined);
      assert.equal(visto.headers["x-deliveryos-field"], undefined, "marca do piloto mandada à plataforma");
    });

    await prova("método errado numa rota certa não passa (GET no GPS, DELETE na sessão)", async () => {
      assert.equal((await pelo({ method: "GET", path: "/api/gps/batch" })).status, 404);
      assert.equal((await pelo({ method: "DELETE", path: "/api/session" })).status, 404);
      assert.equal((await pelo({ method: "PUT", path: "/api/device/session" })).status, 404);
    });

    await prova("corpo acima do teto da rota é recusado, declarado ou em fluxo; GET com corpo também", async () => {
      const antes = recebidosPelaPlataforma.length;
      // Tamanho DECLARADO acima do teto, corpo enviado em dois pedaços com pausa: só a
      // conferência do cabeçalho recusa antes de abrir qualquer pedido no destino.
      const declarado = await new Promise<number>((resolve) => {
        const rq = http.request({ host: "127.0.0.1", port: portaPortao, method: "POST", path: "/api/device/queue-depth",
          headers: { "content-type": "application/json", "content-length": String(5 * 1024) } }, (res) => { res.resume(); resolve(res.statusCode ?? 0); });
        rq.on("error", () => resolve(-1));
        rq.write("x".repeat(3 * 1024));
        setTimeout(() => { try { rq.end("x".repeat(2 * 1024)); } catch { /* já recusado */ } }, 300);
      });
      assert.equal(declarado, 413);
      assert.equal(recebidosPelaPlataforma.length, antes, "corpo DECLARADO grande demais chegou a abrir pedido na plataforma");
      const fluxo = await pelo({ method: "POST", path: "/api/gps/batch", headers: { "content-type": "application/json", "transfer-encoding": "chunked" }, body: Buffer.alloc(2100 * 1024, 120) });
      assert.ok(fluxo.status === 413 || fluxo.status === -1, "corpo em fluxo acima do teto passou: " + fluxo.status);
      const getComCorpo = await pelo({ method: "GET", path: "/api/policies", headers: { "content-length": "5" }, body: "abcde" });
      assert.equal(getComCorpo.status, 413);
      assert.ok(recebidosPelaPlataforma.slice(antes).every((v) => v.bytes <= 2000 * 1024), "a plataforma recebeu corpo acima do teto");
    });

    await prova("destino fora do ar: 502 dizendo que o destino está indisponível, nada de pendurar o celular", async () => {
      await new Promise<void>((r) => plataforma.close(() => r()));
      const r = await pelo({ method: "POST", path: "/api/device/session", headers: { "content-type": "application/json" }, body: "{}" });
      assert.equal(r.status, 502);
      assert.match(r.body, /destino_indisponivel/);
    });

    console.log(`PORTAO_DE_CAMPO_PASS ${ok}/${ok} REAL_PROCESSES_SYNTHETIC`);
  } finally {
    for (const p of filhos) { try { p.kill(); } catch { /* já saiu */ } }
    if (plataforma.listening) plataforma.close();
    await sleep(300);
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* preso */ }
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
