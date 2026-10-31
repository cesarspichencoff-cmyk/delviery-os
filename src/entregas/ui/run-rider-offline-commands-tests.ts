/**
 * C5 — comandos offline nativos da rider-mobile, contra o piloto REAL.
 *
 * O que estava aberto (BLOCKERS.md C5, desde 2026-10-01): `outbox_event` do
 * Room não tinha produtor. Saída, chegada, entrega, cliente não encontrado e
 * ocorrência iam só por `/api/command`, online. Sem rede na porta do cliente,
 * a confirmação falhava e se perdia — enquanto a tela prometia "suas
 * confirmações ficam guardadas".
 *
 * Esta suíte prova o caminho inteiro que existe fora do Kotlin: a página grava
 * a intenção na fila do aparelho (ponte falsa que imita o Room: chave primária
 * por event_id, IGNORE em conflito, ordem por sequência), o "worker" envia ao
 * `/api/events/batch` real quando a rede volta (aqui com a sessão do motoboy;
 * no aparelho, com a credencial delegada pela plataforma), e o domínio aplica
 * UMA vez, com recibo durável. O Kotlin é provado à parte, no JUnit do CI.
 *
 * Fila do aparelho só é usada quando o servidor a anuncia: flag
 * `offline_queue_enabled` + recibos duráveis + chave de delegação. Sem isso,
 * a página segue online — o comportamento anterior, com reenvio idêntico.
 *
 * Tudo sintético: tokens, motoboy, pedidos e chave de delegação de teste.
 */

import assert from "node:assert/strict";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";

const RAIZ = process.cwd();
const TOKEN = { motoboy: "tok-motoboy-off-sintetico", ops: "tok-ops-off-sintetico", gerente: "tok-gerente-off-sintetico" };

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

async function subirPiloto(opcoes: { filaOffline: boolean; delegacao: boolean }): Promise<Piloto> {
  const dir = mkdtempSync(join(tmpdir(), "rider-offline-"));
  const porta = await portaLivre();
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
        { actor_id: "rid-1", role: "motoboy_interno", label: "Motoboy Um", token: TOKEN.motoboy },
        { actor_id: "ops-1", role: "operador_expedicao", label: "Operador", token: TOKEN.ops },
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
  writeFileSync(join(dir, "flags.json"), JSON.stringify({ gps_capture_enabled: false, offline_queue_enabled: opcoes.filaOffline }));
  writeFileSync(join(dir, "termo.json"), JSON.stringify({}));
  const env: Record<string, string | undefined> = {
    ...process.env,
    ENTREGAS_UI_PORT: String(porta),
    ENTREGAS_PILOT_CONFIG: join(dir, "pilot.json"),
    ENTREGAS_DATA_DIR: join(dir, "dados"),
    ENTREGAS_TERM_CONFIG: join(dir, "termo.json"),
    ENTREGAS_GPS_FLAGS_CONFIG: join(dir, "flags.json"),
  };
  if (opcoes.delegacao) {
    // Chave pública de TESTE: o piloto só verifica delegação com ela; nenhum
    // segredo da plataforma passa por aqui.
    const { publicKey } = generateKeyPairSync("ed25519");
    const pem = publicKey.export({ type: "spki", format: "pem" }) as string;
    env.ENTREGAS_PILOT_DELEGATION_PUBLIC_KEY_B64 = Buffer.from(pem).toString("base64");
    env.ENTREGAS_PILOT_DELEGATION_KEY_ID = "kid-teste-offline";
  }
  delete env.ENTREGAS_UNIT_CONFIG;
  delete env.ENTREGAS_BIND;
  delete env.ENTREGAS_HTTPS;
  if (existsSync(join(RAIZ, "config", "entregas-unit-itaim.json"))) {
    throw new Error("config/entregas-unit-itaim.json presente: esta suíte exige ambiente sem unidade");
  }
  const separador = process.platform === "win32" ? ";" : ":";
  const tsxCli = (process.env.PATH ?? "")
    .split(separador)
    .map((bin) => join(bin, "..", "tsx", "dist", "cli.mjs"))
    .find((candidato) => existsSync(candidato));
  if (!tsxCli) throw new Error("tsx_cli_nao_localizado_no_path");
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
      if ((await fetch(`${base}/api/health`)).ok) return { base, processo, dir, log };
    } catch {
      /* subindo */
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

async function api(p: Piloto, caminho: string, token: string, corpo?: unknown): Promise<Record<string, unknown>> {
  const r = await fetch(`${p.base}${caminho}`, {
    method: corpo === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  return (await r.json()) as Record<string, unknown>;
}

async function montarViagem(p: Piloto, trip: string, pedidos: string[]): Promise<void> {
  for (const ref of pedidos) {
    await api(p, "/api/ready-order", TOKEN.ops, { order_ref: ref, label: `Pedido ${ref} · Rua de Teste`, channel: "proprio" });
  }
  const r = await api(p, "/api/command", TOKEN.ops, {
    type: "CreateTrip",
    command_id: `ct-${trip}`,
    occurred_at: new Date().toISOString(),
    unit_id: "ITAIM",
    trip_id: trip,
    courier_actor_id: "rid-1",
    deliveries: pedidos.map((ref, i) => ({ delivery_id: `D-${ref}`, order_ref: ref, planned_stop_order: i + 1 })),
  });
  assert.equal((r.result as { ok?: boolean })?.ok, true, `CreateTrip: ${JSON.stringify(r.result)}`);
}

interface ViagemSnap {
  trip_id: string;
  state: string;
  deliveries: Array<{ delivery_id: string; state: string }>;
}
async function viagem(p: Piloto, trip: string): Promise<ViagemSnap | undefined> {
  const s = await api(p, "/api/snapshot", TOKEN.gerente);
  return ((s.trips ?? []) as ViagemSnap[]).find((t) => t.trip_id === trip);
}
async function eventosDaViagem(p: Piloto, trip: string): Promise<Array<{ event_type?: string; kind?: string }>> {
  const s = await api(p, `/api/trip/timeline?trip_id=${encodeURIComponent(trip)}`, TOKEN.gerente);
  return ((s.timeline ?? []) as Array<{ event_type?: string; kind?: string }>);
}

/**
 * Ponte falsa com a fila do aparelho. `recordOperationalEvent` imita o Room
 * (chave por event_id, IGNORE, sequência). `__syncOutbox()` imita o
 * SyncWorker: manda os pendentes em ordem e aplica o recibo POR EVENTO.
 */
function scriptDaPonte(comFila: boolean): string {
  return `localStorage.setItem("entregas_pilot_token", ${JSON.stringify(TOKEN.motoboy)});
  (() => {
    const chamadas = (window.__nativeCalls = []);
    const fila = (window.__outbox = []);
    let seq = 0;
    const chamar = (n, a) => chamadas.push([n, a === undefined ? null : a]);
    const ponte = {
      version: () => "android-bridge@1.0.0",
      capabilities: () => JSON.stringify({ runtime: "android", app_version: "1.0.0-debug", foreground_service: true,
        native_geofencing: true, activity_recognition: false, sdk_int: 34, device_id: "dev-offline-01",
        device_proof_sha256: "3ba3f5f43b92602683c19aee62a20342b084dd5971ddd33808d81a328879a547" }),
      status: () => JSON.stringify({ active_trip_id: null, allowed: false, message: "", blocks: "capture_disabled,no_active_trip",
        approximate_only: false, term_ok: false, pending_points: 0,
        pending_events: fila.filter((e) => e.state !== "sent" && e.state !== "rejected").length,
        rejected_events: fila.filter((e) => e.state === "rejected").length }),
      applyServerPolicies: (json) => { chamar("applyServerPolicies", JSON.parse(json)); return JSON.stringify({ ok: true }); },
      recordTermAcknowledgement: (json) => { chamar("recordTermAcknowledgement", JSON.parse(json)); return JSON.stringify({ ok: true }); },
      receipt: () => JSON.stringify({ ok: false }),
      requestLocationPermission: () => chamar("requestLocationPermission"),
      openAppSettings: () => chamar("openAppSettings"),
      startTripCapture: (t) => chamar("startTripCapture", t),
      stopTripCapture: () => chamar("stopTripCapture"),
      syncNow: () => chamar("syncNow"),
    };
    if (${comFila ? "true" : "false"}) {
      ponte.recordOperationalEvent = (json) => {
        const o = JSON.parse(json); chamar("recordOperationalEvent", o);
        if (!o || typeof o.event_id !== "string" || !o.command || typeof o.command.type !== "string") {
          return JSON.stringify({ ok: false, error: "evento_invalido" });
        }
        if (fila.some((e) => e.event_id === o.event_id)) return JSON.stringify({ ok: true, event_id: o.event_id, duplicate: true });
        fila.push({ event_id: o.event_id, idempotency_key: o.idempotency_key || o.event_id, command: o.command,
          kind: o.command.type, trip_id: o.command.trip_id || o.command.related_trip_id || null,
          delivery_id: o.command.delivery_id || null, sequence_local: ++seq, state: "pending", last_error: null });
        return JSON.stringify({ ok: true, event_id: o.event_id, duplicate: false });
      };
      ponte.operationalEvents = () => JSON.stringify(fila.map((e) => ({ event_id: e.event_id, kind: e.kind,
        trip_id: e.trip_id, delivery_id: e.delivery_id, state: e.state, last_error: e.last_error, sequence_local: e.sequence_local })));
    }
    window.EntregasNative = ponte;
    window.__syncOutbox = async () => {
      const pendentes = fila.filter((e) => e.state === "pending" || e.state === "failed").sort((a, b) => a.sequence_local - b.sequence_local);
      if (!pendentes.length) return { enviados: 0 };
      const r = await fetch("/api/events/batch", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ events: pendentes.map((e) => ({ event_id: e.event_id, idempotency_key: e.idempotency_key, command: e.command })) }) });
      const corpo = await r.json();
      if (!r.ok || !corpo.ok || !Array.isArray(corpo.results)) return { enviados: 0, http: r.status, corpo };
      for (const res of corpo.results) {
        const e = fila.find((x) => x.event_id === res.event_id);
        if (!e) continue;
        if (res.ok) e.state = "sent";
        else if (res.retryable) { e.state = "failed"; e.last_error = res.code || res.error || "recuperavel"; }
        else { e.state = "rejected"; e.last_error = res.error || res.code || "recusado"; }
      }
      return { enviados: pendentes.length, resultados: corpo.results };
    };
  })();`;
}

const errosDeScript: string[] = [];

async function abrir(browser: Browser, p: Piloto, comFila: boolean): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript({ content: scriptDaPonte(comFila) });
  const page = await ctx.newPage();
  page.on("dialog", (d) => d.accept());
  page.on("pageerror", (e) => errosDeScript.push(e.message));
  await page.goto(`${p.base}/rider-mobile/`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => {
    const t = document.getElementById("stopTitle")?.textContent || "";
    return t && t !== "Carregando…";
  }, null, { timeout: 15000 });
  await page.waitForLoadState("networkidle");
  return { ctx, page };
}

async function botaoPrimario(page: Page, contem: string): Promise<void> {
  await page.waitForFunction((c) => {
    const b = document.getElementById("btnPrimary") as HTMLButtonElement | null;
    return !!b && !b.hidden && !b.disabled && (b.textContent || "").includes(c);
  }, contem, { timeout: 10000 });
  await page.click("#btnPrimary");
}

type Fila = Array<{ event_id: string; idempotency_key: string; kind: string; state: string; command: Record<string, unknown>; last_error: string | null }>;
async function filaDoAparelho(page: Page): Promise<Fila> {
  return (await page.evaluate(() => (window as unknown as { __outbox?: unknown[] }).__outbox ?? [])) as Fila;
}
async function chamadasDe(page: Page, nome: string): Promise<unknown[]> {
  return (await page.evaluate((n) => ((window as unknown as { __nativeCalls?: [string, unknown][] }).__nativeCalls ?? [])
    .filter((c) => c[0] === n).map((c) => c[1]), nome)) as unknown[];
}
async function textoVisivel(page: Page, sel: string): Promise<string | null> {
  return (await page.isVisible(sel)) ? ((await page.textContent(sel)) ?? "").trim() : null;
}
async function sincronizar(page: Page): Promise<Record<string, unknown>> {
  return (await page.evaluate(() => (window as unknown as { __syncOutbox(): Promise<Record<string, unknown>> }).__syncOutbox())) as Record<string, unknown>;
}

async function main(): Promise<void> {
  console.log("=== C5 — comandos offline nativos da rider-mobile (piloto real, ponte falsa) ===");
  const browser = await chromium.launch();
  try {
    {
      const p = await subirPiloto({ filaOffline: true, delegacao: true });
      try {
        await prova("O0 o servidor anuncia a fila do aparelho só com flag, recibos duráveis e delegação", async () => {
          const pol = await api(p, "/api/policies", TOKEN.motoboy);
          assert.equal((pol.flags as { offline_queue_enabled?: boolean })?.offline_queue_enabled, true);
        });
        await montarViagem(p, "T-OFF-1", ["P-OFF-1", "P-OFF-2"]);
        const { ctx, page } = await abrir(browser, p, true);
        const comandosOnline: string[] = [];
        page.on("request", (r) => { if (r.url().endsWith("/api/command")) comandosOnline.push(r.method()); });

        await prova("O1 sem rede, a saída fica guardada no aparelho, sem /api/command e sem erro na tela", async () => {
          await ctx.setOffline(true);
          await botaoPrimario(page, "Confirmar saída");
          await page.waitForTimeout(500);
          const fila = await filaDoAparelho(page);
          assert.equal(fila.length, 1, `intenções na fila do aparelho: ${fila.length}`);
          assert.equal(fila[0].kind, "ConfirmTripDeparture");
          assert.equal(fila[0].command.trip_id, "T-OFF-1");
          assert.equal(fila[0].idempotency_key, fila[0].event_id, "chave de idempotência diferente do event_id");
          assert.match(fila[0].event_id, /^[A-Za-z0-9_-]{1,128}$/);
          assert.equal(comandosOnline.length, 0, "a página ainda chamou /api/command");
          assert.equal(await textoVisivel(page, "#errorBox"), null, "erro na tela com a ação guardada");
          const pendente = await textoVisivel(page, "#pendingLine");
          assert.ok(pendente && /guardad/i.test(pendente), `a tela não diz que está guardado: ${pendente}`);
          assert.equal((await viagem(p, "T-OFF-1"))?.state, "preparando_saida", "o servidor mudou sem receber nada");
        });

        await prova("O2 ainda sem rede: chegada e entrega seguem pela tela e entram em ordem na fila", async () => {
          await botaoPrimario(page, "Cheguei");
          await page.waitForTimeout(300);
          await botaoPrimario(page, "Confirmar entrega");
          await page.waitForTimeout(400);
          const fila = await filaDoAparelho(page);
          assert.deepEqual(fila.map((e) => e.kind), ["ConfirmTripDeparture", "RecordArrivalReported", "ConfirmDelivery"]);
          assert.equal(new Set(fila.map((e) => e.event_id)).size, 3, "event_id repetido");
          assert.equal(fila[1].command.delivery_id, "D-P-OFF-1");
          assert.equal(fila[2].command.delivery_id, "D-P-OFF-1");
          const titulo = (await page.textContent("#stopTitle")) ?? "";
          assert.ok(!/entregue|confirmad/i.test(titulo) || /guardad|aguard/i.test(titulo), `a tela afirma confirmação sem servidor: ${titulo}`);
        });

        await prova("O3 tocar de novo numa ação pendente não cria segunda intenção", async () => {
          const antes = (await filaDoAparelho(page)).length;
          await page.evaluate(() => document.getElementById("btnProblem")?.click());
          await page.waitForTimeout(200);
          await page.evaluate(() => document.getElementById("btnProblem")?.click());
          await page.waitForTimeout(300);
          const fila = await filaDoAparelho(page);
          assert.equal(fila.length, antes + 1, `toques repetidos geraram ${fila.length - antes} intenções`);
          assert.equal(fila[fila.length - 1].kind, "CreateOccurrence");
        });

        await prova("O4 a rede volta: o envio aplica tudo UMA vez, em ordem, e a tela segue o domínio", async () => {
          await ctx.setOffline(false);
          const r = await sincronizar(page);
          assert.equal(r.enviados, 4, `enviados: ${JSON.stringify(r)}`);
          const fila = await filaDoAparelho(page);
          assert.deepEqual(fila.map((e) => e.state), ["sent", "sent", "sent", "sent"], `estados: ${JSON.stringify(fila.map((e) => [e.kind, e.state, e.last_error]))}`);
          const t = await viagem(p, "T-OFF-1");
          assert.equal(t?.state, "em_rota");
          assert.equal(t?.deliveries.find((d) => d.delivery_id === "D-P-OFF-1")?.state, "entregue_confirmado");
          await page.waitForFunction(() => !document.getElementById("pendingLine") || (document.getElementById("pendingLine") as HTMLElement).hidden, null, { timeout: 8000 });
        });

        await prova("O5 reenvio do mesmo lote (worker repetido) não duplica: recibo devolve o mesmo resultado", async () => {
          const fila = await filaDoAparelho(page);
          await page.evaluate(() => { for (const e of (window as unknown as { __outbox: Array<{ state: string }> }).__outbox) e.state = "pending"; });
          const r = await sincronizar(page);
          const resultados = (r.resultados ?? []) as Array<{ ok: boolean }>;
          assert.equal(resultados.length, fila.length);
          assert.ok(resultados.every((x) => x.ok === true), `reenvio recusado: ${JSON.stringify(resultados)}`);
          const eventos = await eventosDaViagem(p, "T-OFF-1");
          const saidas = eventos.filter((e) => /trip_started|saida|departure/i.test(String(e.event_type ?? e.kind ?? "")));
          assert.equal(saidas.length, 1, `saídas na linha do tempo: ${saidas.length}`);
        });
        await ctx.close();
      } finally {
        await derrubar(p);
      }
    }
    {
      // Fila desligada (ou sem recibos/delegação): a página não usa o aparelho.
      const p = await subirPiloto({ filaOffline: false, delegacao: true });
      try {
        await montarViagem(p, "T-ON-1", ["P-ON-1"]);
        const { ctx, page } = await abrir(browser, p, true);
        await prova("O6 fila não anunciada: o toque segue online e nada entra na fila do aparelho", async () => {
          const pol = await api(p, "/api/policies", TOKEN.motoboy);
          assert.equal((pol.flags as { offline_queue_enabled?: boolean })?.offline_queue_enabled, false);
          await botaoPrimario(page, "Confirmar saída");
          await page.waitForTimeout(600);
          assert.equal((await filaDoAparelho(page)).length, 0);
          assert.equal((await chamadasDe(page, "recordOperationalEvent")).length, 0);
          assert.equal((await viagem(p, "T-ON-1"))?.state, "em_rota");
        });
        await ctx.close();
      } finally {
        await derrubar(p);
      }
    }
    {
      const p = await subirPiloto({ filaOffline: true, delegacao: false });
      try {
        await prova("O7 flag ligada sem chave de delegação: o servidor NÃO anuncia a fila (o aparelho não conseguiria enviar)", async () => {
          const pol = await api(p, "/api/policies", TOKEN.motoboy);
          assert.equal((pol.flags as { offline_queue_enabled?: boolean })?.offline_queue_enabled, false);
        });
      } finally {
        await derrubar(p);
      }
    }
    await prova("O8 sem erro de script nas páginas", async () => {
      assert.deepEqual(errosDeScript, []);
    });
  } finally {
    await browser.close();
  }
  console.log(`\n${passou}/${passou + falhas.length} provas dos comandos offline`);
  if (falhas.length) {
    for (const f of falhas) console.log(`  - ${f}`);
    process.exitCode = 1;
    return;
  }
  console.log("RIDER_OFFLINE_COMMANDS_GREEN");
}

main().catch((e) => {
  console.error("falha ao executar a suíte:", e);
  process.exitCode = 1;
});
