/**
 * ENTREGAS NA HOME — o gerente acompanha a rua pela Home, com processos reais.
 *
 * Critico de `dist/`, PostgreSQL isolado, tres motoboys (aparelhos logicos com
 * identidade, segredo, pre-vinculo e sessao proprios) enviando GPS, e o servidor
 * da Home de `dist/tools/product_system_server.js` lendo a MESMA porta de
 * realidade da superficie /entregas. Prova que /api/home traz a leitura da rua:
 * cada viagem com o seu aparelho, procedencia `simulado` (nunca real), posicao so
 * como instante e frescor (nenhuma coordenada na resposta), a viagem com ponto
 * velho sem frescor de "agora"; e que sem banco ou com o banco fora do ar a Home
 * responde 200 com o bloco declarado indisponivel — nunca zero, nunca some.
 *
 * Sem `DELIVERYOS_PG_URL` a suite se declara PULADA em voz alta.
 */
import { strict as assert } from "node:assert";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ambienteDeConcessaoDeTeste, concessaoDaBancada, registrarVinculoDeTeste, registrarViagemDeTeste } from "./concessao-de-teste";
import { bancoIsolado, type BancoIsolado } from "./banco-isolado";
import { AparelhoLogico, KEY_DEVICE_SECRET } from "./aparelho-logico";
import { hashDoSegredo } from "./auth/device-session";

const URL_PG = (process.env.DELIVERYOS_PG_URL ?? "").trim();
const raiz = process.cwd();
const BIN_CRITICO = join(raiz, "dist/src/platform/bin/critical.js");
const BIN_HOME = join(raiz, "dist/tools/product_system_server.js");
const SEGREDO = "fixture-home-entregas-".padEnd(48, "x");

let passaram = 0;
const falhas: string[] = [];
async function teste(nome: string, fn: () => void | Promise<void>): Promise<void> {
  try { await fn(); passaram += 1; console.log(`  ok  ${nome}`); }
  catch (e) { falhas.push(`${nome}: ${e instanceof Error ? e.message : String(e)}`); console.log(`  XX  ${nome}: ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`); }
}
interface Proc { filho: ChildProcess; porta: number; saida(): string; fim(): Promise<void> }
function subir(bin: string, env: NodeJS.ProcessEnv, porta: number): Proc {
  const filho = spawn(process.execPath, [bin], { cwd: raiz, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
  let buf = ""; filho.stdout?.on("data", (d: Buffer) => (buf += d)); filho.stderr?.on("data", (d: Buffer) => (buf += d));
  const saiu = new Promise<void>((r) => filho.once("exit", () => r()));
  return { filho, porta, saida: () => buf, fim: () => { if (filho.exitCode === null) { filho.kill("SIGTERM"); setTimeout(() => filho.exitCode === null && filho.kill("SIGKILL"), 5000).unref(); } return saiu; } };
}
const esperar = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
async function ate(cond: () => boolean | Promise<boolean>, ms = 20000): Promise<boolean> { const fim = Date.now() + ms; while (Date.now() < fim) { try { if (await cond()) return true; } catch { /* ainda subindo */ } await esperar(150); } return false; }
// Portas DISTINTAS de uma sequencia: com sorteio, dois servidores caiam na mesma porta, o segundo
// morria e a saude era respondida pelo primeiro (medido: H8 leu a Home sem banco).
let proximaPorta = 9500 + Math.floor(Math.random() * 400);
const porta = () => proximaPorta++;
async function home(p: number): Promise<{ status: number; json: Record<string, unknown>; bruto: string }> {
  const r = await fetch(`http://127.0.0.1:${p}/api/home`);
  const bruto = await r.text();
  return { status: r.status, json: JSON.parse(bruto), bruto };
}
async function subirHome(env: NodeJS.ProcessEnv): Promise<Proc> {
  const p = porta();
  const h = subir(BIN_HOME, { PRODUCT_UI_PORT: String(p), DELIVERYOS_DATABASE_URL: "", ...env }, p);
  assert.ok(await ate(async () => (await fetch(`http://127.0.0.1:${p}/api/health`)).ok), `a Home nao subiu:\n${h.saida()}`);
  await esperar(300);
  assert.equal(h.filho.exitCode, null, `a Home desta prova morreu (porta ${p} ocupada?):\n${h.saida()}`);
  return h;
}

async function autorizar(b: BancoIsolado, ap: AparelhoLogico, unit_id: string, actor_id: string, rotulo: string): Promise<void> {
  await b.cliente.query(`INSERT INTO identity.unit(unit_id, display_name) VALUES ($1, 'Home') ON CONFLICT DO NOTHING`, [unit_id]);
  await b.cliente.query(`INSERT INTO identity.actor(actor_id, unit_id, role, label) VALUES ($1, $2, 'motoboy_interno', 'Home') ON CONFLICT DO NOTHING`, [actor_id, unit_id]);
  await b.cliente.query(`INSERT INTO identity.device(device_id, unit_id, actor_id, label, secret_hash, secret_bound_at) VALUES ($1, $2, $3, $4, $5, now())`,
    [ap.deviceId, unit_id, actor_id, rotulo, hashDoSegredo(ap.db.get(KEY_DEVICE_SECRET)!)]);
  registrarVinculoDeTeste(ap.deviceId, unit_id, actor_id);
}

async function main(): Promise<void> {
  console.log("\n=== ENTREGAS NA HOME (processos reais) ===\n");
  if (!URL_PG) { console.log("PULADO: DELIVERYOS_PG_URL nao definida — Entregas na Home NAO foi exercitada.\n0/0 provas — HOME_ENTREGAS_PULADA"); return; }
  const b = await bancoIsolado(URL_PG, undefined, "home");
  const sufixo = Math.random().toString(36).slice(2, 6);
  const UNIDADE = `HOM${sufixo.toUpperCase()}`;
  const N = 3;
  const dirs = Array.from({ length: N }, (_, i) => mkdtempSync(join(tmpdir(), `home-entregas-${i}-`)));
  const motoboys = Array.from({ length: N }, (_, i) => `hm${i}-${sufixo}`);
  const viagens = Array.from({ length: N }, (_, i) => `ht${i}-${sufixo}`);
  const rotulos = ["Celular do motoboy A", "Celular do motoboy B", "Celular do motoboy C"];
  viagens.forEach((v, i) => registrarViagemDeTeste(v, UNIDADE, motoboys[i]));
  const procs: Proc[] = [];
  try {
    const pc = porta();
    const critico = subir(BIN_CRITICO, { DELIVERYOS_ENV: "local", DELIVERYOS_DATABASE_URL: b.url, DELIVERYOS_MIGRATE_ON_BOOT: "false",
      DELIVERYOS_DEVICE_TOKEN_SECRET: SEGREDO, DELIVERYOS_PORT: String(pc), DELIVERYOS_SOURCE_MODE: "simulated",
      DELIVERYOS_PILOT_TRIP_GRANT_SECRETS: ambienteDeConcessaoDeTeste(UNIDADE) }, pc);
    procs.push(critico);
    assert.ok(await ate(() => /\[critico\] ouvindo/.test(critico.saida())), `o critico nao subiu:\n${critico.saida()}`);
    const aps = dirs.map((d) => new AparelhoLogico({ concessao: concessaoDaBancada, diretorio: d, plataformaUrl: `http://127.0.0.1:${pc}` }));
    for (let i = 0; i < N; i++) await autorizar(b, aps[i], UNIDADE, motoboys[i], rotulos[i]);
    const agora = Date.now();
    // A e B mandam posicao de AGORA; C, de meia hora atras (ponto offline que chegou tarde).
    aps.forEach((a, i) => a.capturar(viagens[i], -23.55 - i * 0.01, -46.63, new Date(i === 2 ? agora - 30 * 60_000 : agora - 5_000).toISOString()));
    const r = await Promise.all(aps.map((a) => a.sincronizar()));
    assert.deepEqual(r, Array(N).fill("success"));

    const h = await subirHome({ DELIVERYOS_DATABASE_URL: b.url, DELIVERYOS_PRODUCT_READ_UNIT: UNIDADE });
    procs.push(h);
    const resp = await home(h.porta);
    const rua = resp.json.entregas as Record<string, any>;

    await teste("H1 /api/home responde 200 e traz a leitura da rua da plataforma", () => {
      assert.equal(resp.status, 200);
      assert.ok(rua && rua.disponivel === true, `bloco: ${JSON.stringify(rua)?.slice(0, 300)}`);
    });
    await teste("H2 as tres viagens chegam, cada uma com o SEU aparelho, nenhuma misturada", () => {
      const todas = Object.values(rua.viagens as Record<string, any[]>).flat();
      const minhas = todas.filter((v) => viagens.includes(v.viagem_id));
      assert.equal(minhas.length, N, `viagens: ${JSON.stringify(todas.map((v) => v.viagem_id))}`);
      for (let i = 0; i < N; i++) {
        const v = minhas.find((x) => x.viagem_id === viagens[i]);
        assert.equal(v.device_id, aps[i].deviceId, `viagem ${i} com aparelho de outro`);
        assert.equal(v.aparelho, rotulos[i], `viagem ${i} com o rotulo de outro aparelho`);
      }
    });
    await teste("H3 simulado nunca aparece como real", () => {
      const todas = Object.values(rua.viagens as Record<string, any[]>).flat().filter((v) => viagens.includes(v.viagem_id));
      assert.ok(todas.every((v) => v.procedencia === "simulado"), JSON.stringify(todas.map((v) => v.procedencia)));
    });
    await teste("H4 nenhuma coordenada na resposta: posicao e so instante e frescor", () => {
      assert.doesNotMatch(JSON.stringify(rua), /latitude|longitude|-23\.5|-46\.6/);
    });
    await teste("H5 o ponto de meia hora atras nao aparece como posicao de agora; os de agora, sim", () => {
      const todas = Object.values(rua.viagens as Record<string, any[]>).flat();
      const velha = todas.find((v) => v.viagem_id === viagens[2]);
      const novas = todas.filter((v) => v.viagem_id === viagens[0] || v.viagem_id === viagens[1]);
      assert.ok(velha && velha.frescor !== "fresh", `frescor do ponto velho: ${velha?.frescor}`);
      assert.ok(novas.every((v) => v.frescor === "fresh"), `frescor dos de agora: ${novas.map((v) => v.frescor)}`);
    });
    await teste("H5b a contagem que a Home desenha nao diz 'nenhuma viagem' com posicao recente chegando", () => {
      const c = rua.contagens;
      assert.ok(c.na_rua + c.ciclo_desconhecido_com_posicao >= 2, `contagens: ${JSON.stringify(c)}`);
    });
    await teste("H6 a superficie da Home desenha o bloco sem mapa e sem controle que execute", async () => {
      const js = await (await fetch(`http://127.0.0.1:${h.porta}/surfaces/home.js`)).text().catch(() => "");
      const fonte = js || "";
      assert.match(fonte, /entregasNaRua/);
      const bloco = fonte.slice(fonte.indexOf("function viagemNaRua"), fonte.indexOf("function areaAmpliada"));
      assert.doesNotMatch(bloco, /<button|<form|onclick|addEventListener|latitude/i);
      // A idade ja vem "ha N min" do viewmodel: o bloco nao pode repeti-la (medido na prova visual).
      assert.doesNotMatch(bloco, /posicao ha \$\{|desde ha \$\{/);
    });

    // Para a prova visual: segura os processos no ar e diz onde abrir a Home.
    if (process.env.HOME_ENTREGAS_PRENDER === "1") {
      console.log(`HOME_NO_AR http://127.0.0.1:${h.porta}/`);
      await esperar(Number(process.env.HOME_ENTREGAS_SEG || 240) * 1000);
    }
    const semBanco = await subirHome({});
    procs.push(semBanco);
    await teste("H7 sem banco configurado: Home 200 e Entregas declarada indisponivel (integracao pendente), nunca zero", async () => {
      const x = await home(semBanco.porta);
      assert.equal(x.status, 200);
      const e = x.json.entregas as Record<string, any>;
      assert.equal(e.disponivel, false);
      assert.equal(e.motivo, "integracao_pendente");
    });
    const bancoFora = await subirHome({ DELIVERYOS_DATABASE_URL: "postgres://ninguem:x@127.0.0.1:9/nada" });
    procs.push(bancoFora);
    await teste("H8 banco fora do ar: Home 200 e Entregas indisponivel; a Home nao cai", async () => {
      const x = await home(bancoFora.porta);
      assert.equal(x.status, 200);
      const e = x.json.entregas as Record<string, any>;
      assert.equal(e.disponivel, false);
      assert.equal(e.motivo, "indisponivel");
    });
  } finally {
    for (const p of procs.reverse()) await p.fim();
    await b.descartar();
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
  }
  console.log(`\n${passaram}/${passaram + falhas.length} provas de Entregas na Home`);
  if (falhas.length) { for (const f of falhas) console.log("  - " + f); process.exit(1); }
  console.log("HOME_ENTREGAS_GREEN SIMULADO_NAO_FISICO");
}
void main().catch((e) => { console.error("falha inesperada:", e); process.exit(1); });
