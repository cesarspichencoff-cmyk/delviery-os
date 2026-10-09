/**
 * Entregas, ponta a ponta com PostgreSQL REAL: servidor do Product System de
 * verdade (processo filho) -> porta de realidade -> entregasVM -> HTTP.
 *
 * O que so este gate prova: o filtro de unidade atravessa a rota
 * `/api/entregas?unidade=`, a leitura chega do banco com a frase, a
 * conferencia e as idades, e a leitura NAO ESCREVE (event log e cadastro
 * identicos antes e depois). Banco isolado por execucao (`banco-isolado.ts`),
 * criado, migrado e apagado; todo fato semeado e `simulated`.
 *
 * Uso: DELIVERYOS_PG_URL=postgres://<admin>@<host>/postgres \
 *        npx tsx tests/product/run-entregas-servidor-pg-tests.ts [--evidencias <dir>]
 * Sem DELIVERYOS_PG_URL: sai 78, PULADO em voz alta — nunca verde.
 */

import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";

import { bancoIsolado, type BancoIsolado } from "../../src/platform/banco-isolado";
import { fontesEmUso, servirFontesCanonicas } from "./fontes-canonicas";

const URL_BASE = (process.env.DELIVERYOS_PG_URL ?? "").trim();
if (!URL_BASE) {
  console.error("PULADO: DELIVERYOS_PG_URL ausente. Nenhuma prova com banco rodou — isto nao e verde.");
  process.exit(78);
}
const argEvid = process.argv.indexOf("--evidencias");
const EVIDENCIAS = argEvid > 0 ? resolve(process.argv[argEvid + 1] ?? "") : "";
const PORTA = 9700 + Math.floor(Math.random() * 200);

let passaram = 0;
const falhas: string[] = [];
async function teste(nome: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    passaram += 1;
    console.log(`  ok  ${nome}`);
  } catch (e) {
    falhas.push(`${nome}: ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`);
    console.log(`  XX  ${nome}`);
  }
}

/** O cenario de `entregas-fixture.ts`, gravado no banco com instantes relativos a agora. */
async function semear(b: BancoIsolado): Promise<void> {
  const q = (sql: string, p: unknown[] = []) => b.cliente.query(sql, p);
  const ha = (s: number) => new Date(Date.now() - s * 1000).toISOString();
  await q(`INSERT INTO identity.unit(unit_id, display_name) VALUES ('ITAIM','Itaim'),('VILA-LAB','Vila Lab')`);
  const aparelhos: [string, string, string, string | null, string | null, string | null, string | null, [number, number, number] | null][] = [
    ["dev-a", "ITAIM", "Moto 01 · celular A", ha(86400), ha(180), "1.4.2", null, [0, 0, 240]],
    ["dev-b", "ITAIM", "Moto 02 · celular B", ha(86400), ha(3300), "1.4.2", null, [37, 2, 3120]],
    ["dev-c", "ITAIM", "Moto 03 · celular C", ha(86400), ha(600), "1.4.1", null, [5, 0, 2100]],
    ["dev-d", "ITAIM", "Moto 04 · celular D", null, null, null, null, null],
    ["dev-e", "ITAIM", "Moto 05 · celular E", ha(86400), ha(7000), "1.4.2", null, null],
    ["dev-f", "ITAIM", "Moto 06 · celular F", ha(172800), ha(90000), "1.3.9", ha(7200), [3, 1, 90000]],
    ["dev-h", "ITAIM", "Moto 08 · celular H", ha(86400), ha(100), "1.4.2", null, null],
    ["dev-g", "VILA-LAB", "Moto 07 · celular G", ha(86400), ha(120), "1.4.2", null, [1, 0, 300]],
  ];
  for (const [id, unidade, rotulo, vinculo, sessao, app, revogado, fila] of aparelhos) {
    const ator = `rider-${id.slice(-1)}`;
    await q(`INSERT INTO identity.actor(actor_id, unit_id, role, label) VALUES ($1,$2,'motoboy_interno',$3)`, [ator, unidade, `Rider ${id.slice(-1).toUpperCase()}`]);
    await q(
      `INSERT INTO identity.device(device_id, unit_id, actor_id, label, app_version, registered_at, secret_bound_at, last_session_at,
                                   revoked_at, queue_pending_points, queue_pending_events, queue_depth_reported_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [id, unidade, ator, rotulo, app, ha(200000), vinculo, sessao, revogado, fila?.[0] ?? null, fila?.[1] ?? null, fila ? ha(fila[2]) : null],
    );
  }
  let seq = 0;
  const fato = async (unidade: string, viagem: string, tipo: string, ocorreuHa: number, recebeuHa: number, aparelho: string | null, relogio = "trusted") => {
    seq += 1;
    await q(
      `INSERT INTO platform.event_log (event_id, unit_id, object_type, object_id, event_type, payload, occurred_at, recorded_at,
          origin, idempotency_key, contract_version, device_id, sequence_local, source_mode, clock_trust)
       VALUES ($1,$2,'trip',$3,$4,'{}'::jsonb,$5,$6,'device',$7,$8,$9,$10,'simulated',$11)`,
      [`ev-${seq}`, unidade, viagem, tipo, ha(ocorreuHa), ha(recebeuHa), `k-${seq}`, `${tipo}@1.0.0`, aparelho, seq, relogio],
    );
  };
  await fato("ITAIM", "T-101", "trip_created", 1500, 1500, "dev-a");
  await fato("ITAIM", "T-101", "trip_started", 1400, 1400, "dev-a");
  for (const s of [900, 600, 300, 120, 40]) await fato("ITAIM", "T-101", "gps_batch_received", s, s - 5, "dev-a");
  await fato("ITAIM", "T-102", "trip_created", 2400, 2400, "dev-b");
  await fato("ITAIM", "T-102", "trip_started", 2300, 2300, "dev-b");
  for (const s of [1500, 1100, 540]) await fato("ITAIM", "T-102", "gps_batch_received", s, s - 3, "dev-b");
  await fato("ITAIM", "T-103", "trip_created", 3000, 3000, "dev-c");
  await fato("ITAIM", "T-103", "trip_started", 2900, 2900, "dev-c");
  await fato("ITAIM", "T-103", "delivery_confirmed", 900, 890, "dev-c");
  await fato("ITAIM", "T-103", "trip_return_started", 600, 595, "dev-c");
  for (const s of [500, 180]) await fato("ITAIM", "T-103", "gps_batch_received", s, s - 2, "dev-c");
  await fato("ITAIM", "T-104", "trip_created", 120, 120, null);
  await fato("ITAIM", "T-099", "trip_created", 95000, 95000, "dev-f");
  await fato("ITAIM", "T-099", "gps_batch_received", 94000, 93990, "dev-f");
  await fato("ITAIM", "T-099", "trip_closed", 92000, 92000, "dev-f");
  await fato("ITAIM", "T-302", "gps_batch_received", 7200, 7190, "dev-h");
  await fato("ITAIM", "T-301", "gps_batch_received", 30, 28, "dev-h");
  await fato("VILA-LAB", "T-201", "trip_created", 800, 800, "dev-g");
  await fato("VILA-LAB", "T-201", "trip_started", 700, 700, "dev-g");
  await fato("VILA-LAB", "T-201", "gps_batch_received", -540, 60, "dev-g", "suspect");
}

async function impressaoDoBanco(b: BancoIsolado): Promise<string> {
  const log = await b.cliente.query(`SELECT event_id, recorded_at FROM platform.event_log ORDER BY event_id`);
  const ap = await b.cliente.query(`SELECT * FROM identity.device ORDER BY device_id`);
  return createHash("sha256").update(JSON.stringify([log, ap])).digest("hex");
}

async function aguardar(filho: ChildProcess): Promise<void> {
  const fim = Date.now() + 30_000;
  while (Date.now() < fim) {
    if (filho.exitCode !== null) throw new Error(`o servidor saiu antes de ouvir (${filho.exitCode})`);
    try {
      if ((await fetch(`http://127.0.0.1:${PORTA}/api/health`)).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("o servidor nao abriu a porta no prazo");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function ler(caminho: string): Promise<any> {
  const r = await fetch(`http://127.0.0.1:${PORTA}${caminho}`);
  assert.equal(r.status, 200, `${caminho} respondeu ${r.status}`);
  return r.json();
}

void (async () => {
  const b = await bancoIsolado(URL_BASE, undefined, "uxrua");
  let servidor: ChildProcess | null = null;
  let saida = "";
  console.log(`\nENTREGAS COM POSTGRESQL REAL — banco isolado ${b.nome}`);
  try {
    await semear(b);
    const antes = await impressaoDoBanco(b);
    servidor = spawn("npx", ["tsx", "tools/product_system_server.ts"], {
      cwd: process.cwd(),
      env: { ...process.env, PRODUCT_UI_PORT: String(PORTA), DELIVERYOS_DATABASE_URL: b.url, DELIVERYOS_PG_URL: "" },
      stdio: ["ignore", "pipe", "pipe"],
      // Grupo proprio: `npx` -> `tsx` -> `node` sao tres processos, e matar so
      // o primeiro deixava o servidor vivo segurando os pipes (medido).
      detached: true,
    });
    servidor.stdout?.on("data", (c) => (saida += String(c)));
    servidor.stderr?.on("data", (c) => (saida += String(c)));
    await aguardar(servidor);

    await teste("S1 a leitura vem do banco: frase, unidades com contagem, conferencia na ordem", async () => {
      const vm = await ler("/api/entregas");
      const l = vm.leitura;
      assert.equal(l.disponivel, true);
      assert.deepEqual(l.unidades.map((u: { unit_id: string; aparelhos: number; viagens_na_rua: number }) => [u.unit_id, u.aparelhos, u.viagens_na_rua]), [["ITAIM", 7, 3], ["VILA-LAB", 1, 1]]);
      assert.equal(l.titulo, "4 viagens na rua em 2 unidades; 1 sem posicao recente.");
      assert.deepEqual(l.conferir.map((c: { chave: string }) => c.chave), ["viagem:T-102", "fila:dev-b", "cadastro:dev-d"]);
      assert.match(l.conferir[0].titulo, /ha 9 min/);
      assert.ok(l.selos.some((s: { estado: string }) => s.estado === "simulado"), "fato simulated sem o selo simulado");
      assert.equal(l.selos.some((s: { estado: string }) => s.estado === "real"), false, "fato simulated virou real");
    });

    await teste("S2 o filtro atravessa a rota: ?unidade=ITAIM so traz ITAIM, e a lista de unidades continua inteira", async () => {
      const vm = await ler("/api/entregas?unidade=ITAIM");
      assert.equal(vm.leitura.unidade_selecionada, "ITAIM");
      assert.equal(vm.leitura.titulo, "3 viagens na rua em ITAIM; 1 sem posicao recente.");
      assert.equal(vm.realidade.aparelhos.length, 7);
      assert.equal(vm.realidade.aparelhos.some((a: { unidade: string }) => a.unidade !== "ITAIM"), false);
      assert.equal(vm.leitura.unidades.length, 2);
    });

    await teste("S3 unidade estranha nao derruba nem vira 'todas': ausencia declarada, texto limitado", async () => {
      const longa = "X".repeat(300);
      const vm = await ler(`/api/entregas?unidade=${longa}`);
      assert.equal(vm.leitura.unidade_encontrada, false);
      assert.equal(vm.leitura.unidade_selecionada.length, 64, "o parametro nao foi limitado");
      assert.equal(vm.realidade.aparelhos.length, 0);
      const html = await ler(`/api/entregas?unidade=${encodeURIComponent('<b>"x"')}`);
      assert.equal(html.leitura.unidade_encontrada, false);
    });

    await teste("S4 a leitura NAO escreve: event log e cadastro identicos depois de seis leituras", async () => {
      const depois = await impressaoDoBanco(b);
      assert.equal(depois, antes);
      const r = await fetch(`http://127.0.0.1:${PORTA}/api/entregas`, { method: "POST" });
      assert.equal(r.status, 405, "escrita aceita pelo servidor de leitura");
    });

    if (EVIDENCIAS) {
      await teste("S5 capturas da tela com o banco real (evidencia)", async () => {
        mkdirSync(EVIDENCIAS, { recursive: true });
        const { chromium } = await import("playwright");
        const browser = await chromium.launch(process.env.PRODUCT_UI_CHROMIUM ? { executablePath: process.env.PRODUCT_UI_CHROMIUM } : {});
        try {
          for (const [nome, viewport] of [["desktop", { width: 1440, height: 900 }], ["celular", { width: 390, height: 844 }]] as const) {
            for (const [rotulo, hash] of [["todas", "#/entregas"], ["itaim", "#/entregas?unidade=ITAIM"]] as const) {
              const ctx = await browser.newContext({ viewport, reducedMotion: "reduce" });
              await servirFontesCanonicas(ctx, process.env.PRODUCT_UI_FONTES);
              const page = await ctx.newPage();
              await page.goto(`http://127.0.0.1:${PORTA}/${hash}`);
              await page.waitForSelector('#superficie[aria-busy="false"] [data-titulo-da-leitura]');
              if (nome === "desktop" && rotulo === "todas") console.log(`      capturas com fontes ${await fontesEmUso(page)}`);
              await page.screenshot({ path: join(EVIDENCIAS, `pg-${rotulo}-${nome}-dobra.png`) });
              await page.screenshot({ path: join(EVIDENCIAS, `pg-${rotulo}-${nome}-inteira.png`), fullPage: true });
              await ctx.close();
            }
          }
        } finally {
          await browser.close();
        }
      });
    }
  } finally {
    if (servidor?.pid) {
      try {
        process.kill(-servidor.pid, "SIGTERM");
      } catch {}
    }
    await b.descartar();
  }
  if (falhas.length) {
    console.error(`\nENTREGAS_SERVIDOR_PG: ${passaram}/${passaram + falhas.length} PASS`);
    for (const f of falhas) console.error(` - ${f}`);
    if (saida) console.error(saida.slice(-1500));
    process.exit(1);
  }
  console.log(`\nENTREGAS_SERVIDOR_PG: ${passaram}/${passaram} PASS`);
  process.exit(0);
})();
