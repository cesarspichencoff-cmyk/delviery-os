/**
 * Encaminhador TLS de ENSAIO — o equivalente, em Node, do socat da bancada do emulador.
 *
 * Por que existe: o app Android recusa HTTP em toda variante (BANCADA-EMULADOR.md §1)
 * e o runtime crítico não tem TLS. Na bancada, o TLS veio do socat dentro do WSL; o
 * computador do ensaio é Windows e WSL nele não é garantido. O host já tem Node.
 *
 * O que esta suíte exige: com a CA de laboratório, o pedido chega e o cabeçalho
 * Authorization passa intacto (TCP puro, nada interpretado); sem a CA, recusa; HTTP
 * puro na porta TLS falha; certificado com nome errado é recusado pelo cliente; escuta
 * em 0.0.0.0 é recusada; destino fora do ar fecha a conexão sem travar e volta quando
 * o destino volta; nada do conteúdo vai para o log.
 */
import assert from "node:assert/strict";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer as criarHttp, request as pedirHttp, type Server } from "node:http";
import { request as pedirHttps } from "node:https";
import { createServer as criarTcp } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

const RAIZ = process.cwd();
const SCRIPT = join(RAIZ, "tools/windows-local-lab/tls-encaminhador.cjs");
let passed = 0;
const failures: string[] = [];
async function teste(nome: string, fn: () => Promise<void>): Promise<void> {
  try { await fn(); passed += 1; console.log(`  OK   ${nome}`); }
  catch (e) { failures.push(nome); console.error(`  FAIL ${nome}\n       ${(e as Error).message.split("\n").slice(0, 4).join("\n       ")}`); }
}
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function portaLivre(): Promise<number> {
  return await new Promise((ok, falha) => {
    const s = criarTcp(); s.once("error", falha);
    s.listen(0, "127.0.0.1", () => { const a = s.address(); s.close(() => ok(typeof a === "object" && a ? a.port : 0)); });
  });
}

function certificados(dir: string): void {
  const o = (args: string[]) => execFileSync("openssl", args, { cwd: dir, stdio: "pipe" });
  o(["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "2", "-sha256", "-keyout", "ca.key", "-out", "ca.pem",
    "-subj", "/CN=ensaio CA", "-addext", "basicConstraints=critical,CA:TRUE", "-addext", "keyUsage=critical,keyCertSign,cRLSign"]);
  for (const [nome, san] of [["srv", "IP:127.0.0.1"], ["errado", "IP:10.9.9.9"]] as const) {
    o(["req", "-newkey", "rsa:2048", "-nodes", "-keyout", `${nome}.key`, "-out", `${nome}.csr`, "-subj", `/CN=ensaio ${nome}`]);
    writeFileSync(join(dir, `${nome}.ext`), `basicConstraints=CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\nsubjectAltName=${san}\n`);
    o(["x509", "-req", "-in", `${nome}.csr`, "-CA", "ca.pem", "-CAkey", "ca.key", "-CAcreateserial", "-days", "2", "-sha256",
      "-out", `${nome}.pem`, "-extfile", `${nome}.ext`]);
  }
}

interface Proc { filho: ChildProcess; saida(): string; fim(): Promise<void> }
function subir(args: string[]): Proc {
  const filho = spawn(process.execPath, [SCRIPT, ...args], { stdio: ["ignore", "pipe", "pipe"] });
  let buf = "";
  filho.stdout?.on("data", (d: Buffer) => (buf += d.toString()));
  filho.stderr?.on("data", (d: Buffer) => (buf += d.toString()));
  const saiu = new Promise<void>((r) => filho.once("exit", () => r()));
  return { filho, saida: () => buf, fim: async () => { if (filho.exitCode === null) filho.kill("SIGTERM"); await Promise.race([saiu, esperar(4000)]); } };
}
async function ate(p: Proc, padrao: RegExp): Promise<void> {
  for (let i = 0; i < 100; i++) { if (padrao.test(p.saida())) return; if (p.filho.exitCode !== null) break; await esperar(50); }
  throw new Error(`o encaminhador não respondeu: ${p.saida().slice(-300)}`);
}

function https(porta: number, opcoes: { ca?: Buffer; corpo?: Buffer; token?: string }): Promise<{ status: number; corpo: string }> {
  return new Promise((ok, falha) => {
    const r = pedirHttps({ host: "127.0.0.1", port: porta, path: "/api/eco", method: opcoes.corpo ? "POST" : "GET",
      ...(opcoes.ca ? { ca: opcoes.ca } : {}), headers: { ...(opcoes.token ? { Authorization: `Bearer ${opcoes.token}` } : {}) },
      timeout: 3000 }, (res) => {
      let t = ""; res.on("data", (d) => (t += d)); res.on("end", () => ok({ status: res.statusCode ?? 0, corpo: t }));
    });
    r.on("timeout", () => r.destroy(new Error("TIMEOUT")));
    r.on("error", falha);
    if (opcoes.corpo) r.write(opcoes.corpo);
    r.end();
  });
}

async function main(): Promise<void> {
  console.log("ENCAMINHADOR TLS DE ENSAIO — TLS de entrada, TCP puro para o destino");
  const dir = mkdtempSync(join(tmpdir(), "tls-encaminhador-"));
  certificados(dir);
  const ca = readFileSync(join(dir, "ca.pem"));
  const portaDestino = await portaLivre();
  const portaTls = await portaLivre();
  const TOKEN = "tok-sintetico-do-aparelho-0123456789";
  let destino: Server | null = null;
  const subirDestino = async () => {
    destino = criarHttp((req, res) => {
      let n = 0; req.on("data", (d: Buffer) => (n += d.length));
      req.on("end", () => { res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ metodo: req.method, caminho: req.url, autorizacao: req.headers.authorization ?? null, bytes: n })); });
    });
    await new Promise<void>((ok) => destino!.listen(portaDestino, "127.0.0.1", () => ok()));
  };
  await subirDestino();
  const args = ["--escuta", `127.0.0.1:${portaTls}`, "--destino", `127.0.0.1:${portaDestino}`,
    "--cert", join(dir, "srv.pem"), "--chave", join(dir, "srv.key")];
  let enc: Proc | null = null;
  try {
    enc = subir(args);
    await ate(enc, /TLS_ENCAMINHADOR_OUVINDO/);

    await teste("T1 com a CA de laboratório o pedido chega inteiro: método, caminho, Authorization e corpo", async () => {
      const corpo = Buffer.alloc(64 * 1024, 7);
      const r = await https(portaTls, { ca, corpo, token: TOKEN });
      assert.equal(r.status, 200);
      const eco = JSON.parse(r.corpo) as { metodo: string; caminho: string; autorizacao: string; bytes: number };
      assert.deepEqual([eco.metodo, eco.caminho, eco.autorizacao, eco.bytes], ["POST", "/api/eco", `Bearer ${TOKEN}`, corpo.length]);
    });

    await teste("T2 sem a CA o cliente recusa (certificado não confiável)", async () => {
      await assert.rejects(https(portaTls, {}), /self.signed|unable to verify|SELF_SIGNED|UNABLE_TO_VERIFY/i);
    });

    await teste("T3 HTTP puro na porta TLS não passa", async () => {
      await assert.rejects(new Promise((ok, falha) => {
        const r = pedirHttp({ host: "127.0.0.1", port: portaTls, path: "/api/eco", timeout: 3000 }, (res) => ok(res.statusCode));
        r.on("timeout", () => r.destroy(new Error("TIMEOUT"))); r.on("error", falha); r.end();
      }));
    });

    await teste("T4 certificado com nome que não cobre o endereço é recusado pelo cliente", async () => {
      const porta2 = await portaLivre();
      const outro = subir(["--escuta", `127.0.0.1:${porta2}`, "--destino", `127.0.0.1:${portaDestino}`,
        "--cert", join(dir, "errado.pem"), "--chave", join(dir, "errado.key")]);
      try {
        await ate(outro, /TLS_ENCAMINHADOR_OUVINDO/);
        await assert.rejects(https(porta2, { ca }), /altname|IP: 127\.0\.0\.1 is not in the cert|ERR_TLS_CERT_ALTNAME_INVALID/i);
      } finally { await outro.fim(); }
    });

    await teste("T5 escuta em 0.0.0.0 ou sem certificado é recusada no boot", async () => {
      for (const ruins of [
        ["--escuta", `0.0.0.0:${portaTls + 1}`, "--destino", `127.0.0.1:${portaDestino}`, "--cert", join(dir, "srv.pem"), "--chave", join(dir, "srv.key")],
        ["--escuta", `127.0.0.1:${portaTls + 1}`, "--destino", `127.0.0.1:${portaDestino}`],
      ]) {
        const p = subir(ruins);
        await new Promise((r) => p.filho.once("exit", r));
        assert.notEqual(p.filho.exitCode, 0, `subiu com ${ruins.join(" ")}`);
        assert.match(p.saida(), /TLS_ENCAMINHADOR_RECUSADO/);
      }
    });

    await teste("T6 destino fora do ar: a conexão fecha sem travar; o destino volta e o caminho volta", async () => {
      await new Promise<void>((ok) => destino!.close(() => ok()));
      await assert.rejects(https(portaTls, { ca, token: TOKEN }), /socket hang up|ECONNRESET|TIMEOUT/);
      assert.equal(enc!.filho.exitCode, null, "o encaminhador caiu junto com o destino");
      await subirDestino();
      const r = await https(portaTls, { ca, token: TOKEN });
      assert.equal(r.status, 200);
    });

    await teste("T7 nada do conteúdo vai para o log do encaminhador", async () => {
      assert.equal(enc!.saida().includes(TOKEN), false, "o token apareceu no log");
      assert.equal(enc!.saida().includes("/api/eco"), false, "o caminho apareceu no log");
    });
  } finally {
    await enc?.fim();
    await new Promise<void>((ok) => (destino ? destino.close(() => ok()) : ok()));
    rmSync(dir, { recursive: true, force: true });
  }
  const total = passed + failures.length;
  console.log(`TLS_ENCAMINHADOR: ${passed}/${total} PASS`);
  if (failures.length) { console.log(`TLS_ENCAMINHADOR_RED: ${failures.map((f) => f.split(" ")[0]).join(" ")}`); process.exit(1); }
  console.log("TLS_ENCAMINHADOR_GREEN");
}

main().catch((e) => { console.error(e); process.exit(1); });
