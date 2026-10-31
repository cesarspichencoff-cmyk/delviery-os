/**
 * A primeira viagem real pela interface REAL do piloto — console de expedição
 * em dois terminais (tablet e caixa) e a rider-mobile de dois motoboys — contra
 * o servidor REAL do piloto, no Chromium.
 *
 * Por que esta suíte existe: as provas anteriores montavam viagem por HTTP com
 * identidades escolhidas à mão (`ct-${tripId}`, `courier_actor_id: "rid-1"`).
 * A interface faz outra coisa, e foi ela que reprovou em 2026-10-31 sobre
 * 5a705b5c:
 *
 *  1. `command_id` vinha de um contador da página (`ct-1`, `dep-1`...) que
 *     recomeça a cada carregamento, e o piloto recusa `command_id` repetido no
 *     processo inteiro: o segundo terminal recebia DUPLICATE_COMMAND na sua
 *     primeira viagem; o motoboy que reabria o app tinha a saída recusada;
 *  2. o console montava toda viagem para `rid-demo` — motoboy de demonstração
 *     que não existe no piloto. O motoboy de verdade nunca tinha o GPS ligado
 *     (`viagem_de_outro`);
 *  3. o domínio aceitava motoboy agindo na viagem de OUTRO, e o snapshot do
 *     motoboy trazia as viagens, pedidos e ocorrências da casa inteira.
 *
 * Tudo sintético: tokens, motoboys, pedidos e endereços são de teste.
 */

import assert from "node:assert/strict";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, type Browser, type Page, type Request } from "playwright";

const RAIZ = process.cwd();
const TOKEN = {
  tablet: "tok-tablet-sintetico",
  caixa: "tok-caixa-sintetico",
  rid1: "tok-motoboy-1-sintetico",
  rid2: "tok-motoboy-2-sintetico",
  rid3: "tok-motoboy-3-sintetico",
  gerente: "tok-gerente-sintetico",
};

let passou = 0;
const falhas: string[] = [];
async function prova(nome: string, corpo: () => Promise<void>): Promise<void> {
  try {
    await corpo();
    passou += 1;
    console.log(`  ok  ${nome}`);
  } catch (e) {
    const m = e instanceof Error ? e.message.split("\n")[0] : String(e);
    falhas.push(`${nome}: ${m}`);
    console.log(`  XX  ${nome}: ${m}`);
  }
}

function portaLivre(): Promise<number> {
  return new Promise((ok, erro) => {
    const s = createServer();
    s.once("error", erro);
    s.listen(0, "127.0.0.1", () => {
      const p = (s.address() as { port: number }).port;
      s.close(() => ok(p));
    });
  });
}

interface Piloto {
  base: string;
  processo: ChildProcess;
  dir: string;
  log: string[];
}

async function subirPiloto(): Promise<Piloto> {
  const dir = mkdtempSync(join(tmpdir(), "real-trip-ui-"));
  const porta = await portaLivre();
  mkdirSync(join(dir, "config"), { recursive: true });
  writeFileSync(
    join(dir, "pilot.json"),
    JSON.stringify({
      mode: "pilot",
      unit_id: "ITAIM",
      unit_name: "UNIDADE DE TESTE",
      timezone: "America/Sao_Paulo",
      port: porta,
      bind: "127.0.0.1",
      data_dir: join(dir, "dados"),
      max_stops: 5,
      banner: "TESTE AUTOMATIZADO",
      users: [
        { actor_id: "ops-tablet-1", role: "operador_expedicao", label: "Tablet", token: TOKEN.tablet },
        { actor_id: "ops-caixa-1", role: "operador_expedicao", label: "Caixa", token: TOKEN.caixa },
        { actor_id: "rid-1", role: "motoboy_interno", label: "Motoboy Um", token: TOKEN.rid1 },
        { actor_id: "rid-2", role: "motoboy_interno", label: "Motoboy Dois", token: TOKEN.rid2 },
        { actor_id: "rid-3", role: "motoboy_interno", label: "Motoboy Três", token: TOKEN.rid3 },
        { actor_id: "rid-4", role: "motoboy_interno", label: "Motoboy Quatro", token: "tok-motoboy-4-sintetico" },
        { actor_id: "ger-1", role: "gerente", label: "Gerente", token: TOKEN.gerente },
      ],
      features: {
        demo_seed: false,
        demo_controls: false,
        map_poc: false,
        gps_production: false,
        auto_assignment: false,
        copiloto: false,
        shell: false,
      },
      backup: { auto_interval_minutes: 600, retain_count: 2, dir: join(dir, "backups") },
    }),
  );
  writeFileSync(join(dir, "flags.json"), JSON.stringify({ gps_capture_enabled: false }));
  writeFileSync(join(dir, "termo.json"), JSON.stringify({}));
  const env = {
    ...process.env,
    ENTREGAS_UI_PORT: String(porta),
    ENTREGAS_PILOT_CONFIG: join(dir, "pilot.json"),
    ENTREGAS_DATA_DIR: join(dir, "dados"),
    ENTREGAS_TERM_CONFIG: join(dir, "termo.json"),
    ENTREGAS_GPS_FLAGS_CONFIG: join(dir, "flags.json"),
  };
  // Sem unidade declarada: o boot ITAIM-only recusa arquivo declarado ausente.
  delete (env as Record<string, string | undefined>).ENTREGAS_UNIT_CONFIG;
  delete (env as Record<string, string | undefined>).ENTREGAS_BIND;
  delete (env as Record<string, string | undefined>).ENTREGAS_HTTPS;
  if (existsSync(join(RAIZ, "config", "entregas-unit-itaim.json"))) {
    throw new Error("config/entregas-unit-itaim.json presente: esta suíte exige ambiente sem unidade");
  }
  const separador = process.platform === "win32" ? ";" : ":";
  const tsxCli = (process.env.PATH ?? "")
    .split(separador)
    .map((bin) => join(bin, "..", "tsx", "dist", "cli.mjs"))
    .find((candidato) => existsSync(candidato));
  if (!tsxCli) throw new Error("tsx_cli_nao_localizado_no_path");
  // cwd na raiz: o piloto serve a interface de src/entregas/ui. Dados e
  // configuração ficam no diretório temporário.
  const processo = spawn(process.execPath, [tsxCli, "tools/entregas_pilot_server.ts"], {
    cwd: RAIZ,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    detached: process.platform !== "win32",
  });
  const log: string[] = [];
  processo.stdout?.on("data", (d) => log.push(String(d)));
  processo.stderr?.on("data", (d) => log.push(String(d)));
  const base = `http://127.0.0.1:${porta}`;
  for (let i = 0; i < 160; i++) {
    try {
      const r = await fetch(`${base}/api/health`);
      if (r.ok) return { base, processo, dir, log };
    } catch {
      /* ainda subindo */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  await derrubar({ base, processo, dir, log });
  throw new Error(`piloto não subiu: ${log.join("").slice(-600)}`);
}

async function derrubar(p: Piloto): Promise<void> {
  const saiu =
    p.processo.exitCode !== null || p.processo.signalCode !== null
      ? Promise.resolve()
      : new Promise<void>((ok) => p.processo.once("exit", () => ok()));
  try {
    if (p.processo.pid) {
      if (process.platform === "win32") {
        execFileSync("taskkill", ["/PID", String(p.processo.pid), "/T", "/F"], { stdio: "ignore" });
      } else {
        process.kill(-p.processo.pid, "SIGTERM");
      }
    }
  } catch {
    /* já saiu */
  }
  await Promise.race([saiu, new Promise((ok) => setTimeout(ok, 10_000))]);
  rmSync(p.dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}

async function api(
  p: Piloto,
  caminho: string,
  token: string,
  corpo?: unknown,
): Promise<{ status: number; json: Record<string, unknown> }> {
  const r = await fetch(`${p.base}${caminho}`, {
    method: corpo === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  const texto = await r.text();
  return { status: r.status, json: texto ? (JSON.parse(texto) as Record<string, unknown>) : {} };
}

interface ViagemSnap {
  trip_id: string;
  state: string;
  courier_actor_id: string;
  deliveries: Array<{ delivery_id: string; order_ref: string; state: string }>;
}

async function viagens(p: Piloto, token = TOKEN.gerente): Promise<ViagemSnap[]> {
  const s = await api(p, "/api/snapshot", token);
  assert.equal(s.status, 200, `snapshot ${s.status}`);
  return (s.json.trips ?? []) as ViagemSnap[];
}

const errosDeScript: string[] = [];

async function paginaLogada(
  browser: Browser,
  p: Piloto,
  caminho: string,
  token: string,
  viewport: { width: number; height: number },
): Promise<Page> {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  page.on("dialog", (d) => d.accept());
  page.on("pageerror", (e) => errosDeScript.push(`${caminho}: ${e.message}`));
  await page.goto(`${p.base}${caminho}`);
  await page.evaluate((t) => (window as unknown as { entregasPilotLogin(t: string): Promise<unknown> }).entregasPilotLogin(t), token);
  await page.reload();
  await page.waitForLoadState("networkidle");
  return page;
}

async function textoVisivel(page: Page, sel: string): Promise<string | null> {
  return (await page.isVisible(sel)) ? ((await page.textContent(sel)) ?? "").trim() : null;
}

/** Monta uma viagem pelo console REAL: marca o pedido, escolhe o motoboy, clica. */
async function montarPeloConsole(page: Page, pedido: string, motoboy: string): Promise<void> {
  await page.waitForSelector(`#readyList input[data-order="${pedido}"]`, { timeout: 5000 });
  await page.check(`#readyList input[data-order="${pedido}"]`);
  const seletor = await page.$("#riderSelect");
  assert.ok(seletor, "o console não oferece a escolha do motoboy da casa (#riderSelect ausente)");
  await page.selectOption("#riderSelect", motoboy);
  await page.click("#btnCreateTrip");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(300);
}

function corpoDoComando(req: Request): Record<string, unknown> {
  try {
    return JSON.parse(req.postData() ?? "{}") as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function main(): Promise<void> {
  console.log("=== Primeira viagem real pela interface do piloto (2 terminais, 2 motoboys) ===");
  const p = await subirPiloto();
  let browser: Browser | null = null;
  try {
    for (const [ref, rotulo] of [
      ["P-101", "Pedido 101 · Rua de Teste A, 1"],
      ["P-102", "Pedido 102 · Rua de Teste B, 2"],
      ["P-103", "Pedido 103 · Rua de Teste C, 3"],
      ["P-104", "Pedido 104 · Rua de Teste D, 4"],
      ["P-201", "Pedido 201 · Rua de Teste E, 5"],
      ["P-202", "Pedido 202 · Rua de Teste F, 6"],
    ]) {
      const r = await api(p, "/api/ready-order", TOKEN.caixa, { order_ref: ref, label: rotulo, channel: "proprio" });
      assert.equal(r.status, 200);
    }
    // Viagens dos motoboys 1 e 2 montadas por HTTP com identidade explícita:
    // as provas de posse, snapshot e reenvio não dependem do console (R1/R2).
    for (const [trip, rider, pedido] of [
      ["T-SEED-1", "rid-1", "P-201"],
      ["T-SEED-2", "rid-2", "P-202"],
    ]) {
      const r = await api(p, "/api/command", TOKEN.caixa, {
        type: "CreateTrip",
        command_id: `ct-seed-${trip}`,
        occurred_at: new Date().toISOString(),
        unit_id: "ITAIM",
        trip_id: trip,
        courier_actor_id: rider,
        deliveries: [{ delivery_id: `D-${pedido}`, order_ref: pedido }],
      });
      assert.equal((r.json.result as { ok?: boolean })?.ok, true, `semente ${trip}: ${JSON.stringify(r.json.result)}`);
    }
    browser = await chromium.launch();
    const tablet = await paginaLogada(browser, p, "/console/", TOKEN.tablet, { width: 1024, height: 768 });
    const caixa = await paginaLogada(browser, p, "/console/", TOKEN.caixa, { width: 1440, height: 900 });

    await prova("R1 dois terminais recém-abertos montam cada um a sua viagem, sem DUPLICATE_COMMAND", async () => {
      await montarPeloConsole(tablet, "P-101", "rid-3");
      assert.equal(await textoVisivel(tablet, "#errorBox"), null, "tablet mostrou erro");
      await montarPeloConsole(caixa, "P-102", "rid-4");
      const erroCaixa = await textoVisivel(caixa, "#errorBox");
      assert.equal(erroCaixa, null, `caixa mostrou erro: ${erroCaixa}`);
      const ts = await viagens(p);
      const pedidos = ts.flatMap((t) => t.deliveries.map((d) => d.order_ref)).filter((o) => o.startsWith("P-10")).sort();
      assert.deepEqual(pedidos, ["P-101", "P-102"], `viagens montadas: ${JSON.stringify(ts.map((t) => t.trip_id))}`);
    });

    await prova("R2 cada viagem fica com o motoboy escolhido, nenhuma com motoboy de demonstração", async () => {
      const ts = await viagens(p);
      const dono = Object.fromEntries(ts.map((t) => [t.deliveries[0]?.order_ref, t.courier_actor_id]));
      assert.equal(dono["P-101"], "rid-3", `P-101 ficou com ${dono["P-101"]}`);
      assert.equal(dono["P-102"], "rid-4", `P-102 ficou com ${dono["P-102"]}`);
      assert.ok(!ts.some((t) => t.courier_actor_id === "rid-demo"), "viagem para rid-demo");
    });

    await prova("R3 o snapshot do motoboy traz só a própria viagem, sem pedidos, expedições ou ocorrências da casa", async () => {
      await api(p, "/api/command", TOKEN.caixa, {
        type: "CreateOccurrence",
        command_id: "occ-r3-sintetica",
        occurred_at: new Date().toISOString(),
        unit_id: "ITAIM",
        occurrence_id: "OCC-R3-SINT",
        occurrence_type: "campo",
        report: "Relato sintético da casa",
        blocks_availability: false,
      });
      const s = await api(p, "/api/snapshot", TOKEN.rid2);
      const ts = (s.json.trips ?? []) as ViagemSnap[];
      assert.deepEqual(ts.map((t) => t.courier_actor_id), ["rid-2"], `motoboy 2 vê: ${JSON.stringify(ts.map((t) => t.courier_actor_id))}`);
      const prontos = (s.json.ready_orders ?? []) as Array<{ order_ref: string }>;
      assert.equal(prontos.length, 0, `motoboy vê a fila de prontos: ${prontos.map((o) => o.order_ref).join(",")}`);
      assert.equal(((s.json.occurrences ?? []) as unknown[]).length, 0, "motoboy vê ocorrências da casa");
      assert.equal(((s.json.handoffs ?? []) as unknown[]).length, 0, "motoboy vê expedições iFood");
      const riders = (s.json.riders ?? []) as Array<{ rider_id: string }>;
      assert.ok(riders.every((r) => r.rider_id === "rid-2"), `motoboy vê outros motoboys: ${riders.map((r) => r.rider_id).join(",")}`);
      const alheia = await api(p, "/api/trip/timeline?trip_id=T-SEED-1", TOKEN.rid2);
      assert.equal(alheia.status, 403, `linha do tempo da viagem de outro motoboy: ${alheia.status}`);
      const propria = await api(p, "/api/trip/timeline?trip_id=T-SEED-2", TOKEN.rid2);
      assert.equal(propria.status, 200, `linha do tempo da própria viagem: ${propria.status}`);
    });

    await prova("R4 a tela do motoboy 2 mostra a viagem DELE, não a do motoboy 1", async () => {
      const m2 = await paginaLogada(browser!, p, "/rider-mobile/", TOKEN.rid2, { width: 390, height: 844 });
      const ts = await viagens(p);
      const deDois = ts.find((t) => t.courier_actor_id === "rid-2");
      assert.ok(deDois, "viagem do motoboy 2 não existe");
      const pedidosNaTela = await m2.evaluate(() => document.body.innerText);
      assert.ok(!pedidosNaTela.includes("P-201"), "a tela do motoboy 2 mostra o pedido do motoboy 1");
      await m2.context().close();
      // Segunda camada: mesmo que uma resposta mais larga chegue (servidor
      // antigo, proxy, configuração errada), a página escolhe a viagem DELE.
      const forjada = await paginaLogada(browser!, p, "/rider-mobile/", TOKEN.rid2, { width: 390, height: 844 });
      await forjada.route("**/api/snapshot", async (route) => {
        const real = await route.fetch();
        const corpo = (await real.json()) as { trips?: ViagemSnap[] };
        const alheia: ViagemSnap = {
          trip_id: "T-FORJADA-OUTRO", state: "preparando_saida", courier_actor_id: "rid-1",
          deliveries: [{ delivery_id: "D-P-FORJADO", order_ref: "P-FORJADO", state: "aguardando_saida" }],
        };
        await route.fulfill({ response: real, json: { ...corpo, trips: [alheia, ...(corpo.trips ?? [])] } });
      });
      await forjada.reload();
      await forjada.waitForLoadState("networkidle");
      await forjada.waitForTimeout(400);
      const naTelaForjada = await forjada.evaluate(() => document.body.innerText);
      assert.ok(!naTelaForjada.includes("P-FORJADO"), "com snapshot largo, a tela mostrou a viagem de outro motoboy");
      await forjada.context().close();
    });

    await prova("R5 o domínio recusa motoboy confirmando a saída da viagem de outro, sem mudar o estado", async () => {
      const deUm = (await viagens(p)).find((t) => t.courier_actor_id === "rid-1");
      assert.ok(deUm, "viagem do motoboy 1 não existe");
      const r = await api(p, "/api/command", TOKEN.rid2, {
        type: "ConfirmTripDeparture",
        command_id: "dep-r5-invasor",
        occurred_at: new Date().toISOString(),
        unit_id: "ITAIM",
        trip_id: deUm.trip_id,
      });
      const res = r.json.result as { ok?: boolean; error?: string } | undefined;
      assert.equal(res?.ok, false, "a saída da viagem de outro foi aceita");
      const depois = (await viagens(p)).find((t) => t.trip_id === deUm.trip_id);
      assert.equal(depois?.state, "preparando_saida", `estado mudou para ${depois?.state}`);
    });

    await prova("R6 queda de rede antes da resposta: a nova tentativa reusa a MESMA identidade e o servidor aplica uma vez", async () => {
      const m1 = await paginaLogada(browser!, p, "/rider-mobile/", TOKEN.rid1, { width: 390, height: 844 });
      const enviados: Record<string, unknown>[] = [];
      let derrubarProxima = true;
      await m1.route("**/api/command", async (route) => {
        enviados.push(corpoDoComando(route.request()));
        if (derrubarProxima) {
          derrubarProxima = false;
          await route.abort("internetdisconnected");
          return;
        }
        await route.continue();
      });
      await m1.waitForSelector("#btnPrimary:visible", { timeout: 5000 });
      await m1.click("#btnPrimary");
      await m1.waitForTimeout(400);
      const ainda = (await viagens(p)).find((t) => t.courier_actor_id === "rid-1");
      assert.equal(ainda?.state, "preparando_saida", "a primeira tentativa (derrubada) teve efeito");
      await m1.click("#btnPrimary");
      await m1.waitForTimeout(600);
      assert.equal(enviados.length, 2, `tentativas: ${enviados.length}`);
      assert.equal(enviados[0].type, "ConfirmTripDeparture");
      assert.equal(enviados[1].command_id, enviados[0].command_id, "a nova tentativa trocou o command_id");
      assert.equal(enviados[1].occurred_at, enviados[0].occurred_at, "a nova tentativa trocou o horário do toque");
      const agora = (await viagens(p)).find((t) => t.courier_actor_id === "rid-1");
      assert.equal(agora?.state, "em_rota", `estado: ${agora?.state}`);
      assert.equal(await textoVisivel(m1, "#errorBox"), null, "erro na tela depois da tentativa que passou");
      await m1.context().close();
    });

    await prova("R7 resposta perdida depois do commit: o reenvio não vira erro nem segundo registro", async () => {
      const m1 = await paginaLogada(browser!, p, "/rider-mobile/", TOKEN.rid1, { width: 390, height: 844 });
      const enviados: Record<string, unknown>[] = [];
      let perderResposta = true;
      await m1.route("**/api/command", async (route) => {
        enviados.push(corpoDoComando(route.request()));
        if (perderResposta) {
          perderResposta = false;
          await route.fetch(); // o servidor recebe e grava...
          await route.abort("connectionreset"); // ...e a resposta não chega
          return;
        }
        await route.continue();
      });
      await m1.waitForSelector("#btnProblem:visible", { timeout: 5000 });
      await m1.click("#btnProblem");
      await m1.waitForTimeout(400);
      await m1.click("#btnProblem");
      await m1.waitForTimeout(600);
      assert.equal(enviados.length, 2, `tentativas: ${enviados.length}`);
      assert.equal(enviados[1].command_id, enviados[0].command_id, "reenvio trocou o command_id");
      assert.equal(enviados[1].occurrence_id, enviados[0].occurrence_id, "reenvio trocou o occurrence_id");
      const s = await api(p, "/api/snapshot", TOKEN.gerente);
      const doMotoboy = ((s.json.occurrences ?? []) as Array<{ occurrence_id: string }>).filter(
        (o) => o.occurrence_id === enviados[0].occurrence_id,
      );
      assert.equal(doMotoboy.length, 1, `ocorrências do toque: ${doMotoboy.length}`);
      const erro = await textoVisivel(m1, "#errorBox");
      assert.equal(erro, null, `o reenvio apareceu como erro: ${erro}`);
      await m1.context().close();
    });

    await prova("R8 reabrir o app não transforma a saída da viagem seguinte em ação duplicada", async () => {
      // Motoboy 3: a primeira ação de cada página recém-aberta é uma saída.
      // Com o contador antigo, as duas seriam `dep-1` e a segunda, recusada.
      const primeira = (await viagens(p)).find((t) => t.courier_actor_id === "rid-3");
      assert.ok(primeira, "viagem do motoboy 3 (montada pelo console em R1) não existe");
      const m3a = await paginaLogada(browser!, p, "/rider-mobile/", TOKEN.rid3, { width: 390, height: 844 });
      await m3a.waitForSelector("#btnPrimary:visible", { timeout: 5000 });
      await m3a.click("#btnPrimary");
      await m3a.waitForTimeout(600);
      assert.equal((await viagens(p)).find((t) => t.trip_id === primeira.trip_id)?.state, "em_rota", "primeira saída não aplicada");
      await m3a.context().close();
      const fechar = await api(p, "/api/command", TOKEN.gerente, {
        type: "CloseTripManually",
        command_id: "cls-r8-sintetico",
        occurred_at: new Date().toISOString(),
        unit_id: "ITAIM",
        trip_id: primeira.trip_id,
        reason: "Encerramento sintético para a próxima viagem",
      });
      assert.equal((fechar.json.result as { ok?: boolean })?.ok, true, `fechar: ${JSON.stringify(fechar.json.result)}`);
      // Terminal recém-aberto de novo: o contador antigo voltaria a ct-1.
      const tablet2 = await paginaLogada(browser!, p, "/console/", TOKEN.tablet, { width: 1024, height: 768 });
      await montarPeloConsole(tablet2, "P-103", "rid-3");
      assert.equal(await textoVisivel(tablet2, "#errorBox"), null, "tablet reaberto mostrou erro");
      const nova = (await viagens(p)).find((t) => t.deliveries.some((d) => d.order_ref === "P-103"));
      assert.ok(nova, "a viagem de P-103 não foi montada");
      const m3b = await paginaLogada(browser!, p, "/rider-mobile/", TOKEN.rid3, { width: 390, height: 844 });
      await m3b.waitForSelector("#btnPrimary:visible", { timeout: 5000 });
      await m3b.click("#btnPrimary");
      await m3b.waitForTimeout(600);
      const erro = await textoVisivel(m3b, "#errorBox");
      assert.equal(erro, null, `saída da viagem seguinte recusada: ${erro}`);
      const depois = (await viagens(p)).find((t) => t.trip_id === nova.trip_id);
      assert.equal(depois?.state, "em_rota", `estado: ${depois?.state}`);
      await m3b.context().close();
      await tablet2.context().close();
    });

    await prova("R9 o servidor recusa viagem para motoboy que não é da casa", async () => {
      const r = await api(p, "/api/command", TOKEN.caixa, {
        type: "CreateTrip",
        command_id: "ct-r9-fantasma",
        occurred_at: new Date().toISOString(),
        unit_id: "ITAIM",
        trip_id: "T-R9-FANTASMA",
        courier_actor_id: "rid-demo",
        deliveries: [{ delivery_id: "D-P-104", order_ref: "P-104" }],
      });
      const res = r.json.result as { ok?: boolean; code?: string } | undefined;
      assert.equal(res?.ok, false, "viagem para motoboy inexistente foi aceita");
      assert.ok(!(await viagens(p)).some((t) => t.trip_id === "T-R9-FANTASMA"), "a viagem fantasma existe");
      // O erro é do caixa. O tablet não pode recebê-lo como se fosse dele.
      const doTablet = await api(p, "/api/snapshot", TOKEN.tablet);
      assert.equal(doTablet.json.last_error ?? null, null, `o tablet recebeu o erro do caixa: ${doTablet.json.last_error}`);
      const doCaixa = await api(p, "/api/snapshot", TOKEN.caixa);
      assert.equal(doCaixa.json.last_error, "UNKNOWN_INTERNAL_RIDER", `o caixa não vê o próprio erro: ${doCaixa.json.last_error}`);
    });

    await prova("R10 sem erro de script nas páginas", async () => {
      assert.deepEqual(errosDeScript, []);
    });
  } finally {
    if (browser) await browser.close();
    await derrubar(p);
  }
  console.log(`\n${passou}/${passou + falhas.length} provas da viagem real pela interface`);
  if (falhas.length) {
    for (const f of falhas) console.log(`  - ${f}`);
    process.exitCode = 1;
    return;
  }
  console.log("REAL_TRIP_UI_GREEN");
}

main().catch((e) => {
  console.error("falha ao executar a suíte:", e);
  process.exitCode = 1;
});
