/**
 * Q-018 — a rider-mobile aciona a captura nativa pela ponte `EntregasNative`.
 *
 * Decisão do César (2026-09-25): a rider-mobile é dona da interação com o
 * motoboy; o Kotlin continua dono das capacidades nativas (permissão, GPS,
 * serviço em primeiro plano, persistência, sincronização). Nenhuma UI nativa
 * nova. Consentimento e status de GPS que já existem entram na página. A
 * captura só começa depois da SAÍDA CONFIRMADA PELO DOMÍNIO e com
 * consentimento e permissão válidos.
 *
 * Como mede: o piloto REAL (tools/entregas_pilot_server.ts) servindo a página
 * da árvore de trabalho, um Chromium de verdade, e uma ponte `EntregasNative`
 * falsa injetada antes de qualquer script da página. A ponte falsa registra
 * cada chamada e tem um portão próprio com a mesma semântica do Kotlin
 * (flag, viagem, termo publicável e aceito pelo hash, permissão) — o que ela
 * NÃO prova é o Kotlin: isso é A1–A3 e a bancada, no Foxxy.
 *
 * O termo usado aqui é FIXTURE SINTÉTICA de teste, com "SEM VALOR LEGAL" no
 * texto, gravada num diretório temporário. Não é o termo do piloto e nunca
 * vai para `config/`.
 */

import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";

const RAIZ = process.cwd();
// Tokens do arquivo de EXEMPLO do piloto — só existem em laboratório.
const TOKEN_MOTOBOY = "CHANGE_ME_RIDER_TOKEN";
const TOKEN_CONSOLE = "CHANGE_ME_OPS_TOKEN";
// Encerrar viagem é de gerente/líder, não de operador de console.
const TOKEN_GERENTE = "CHANGE_ME_ADMIN_TOKEN";
const DEVICE_FALSO = "dev-ponte-falsa-01";

let passou = 0;
const falhas: string[] = [];
async function teste(nome: string, corpo: () => Promise<void>): Promise<void> {
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

/** Termo SINTÉTICO de teste, publicável, marcado sem valor legal. */
const TERMO_DE_TESTE = {
  version: "9.9.9-teste",
  material_version: "teste-1",
  unit_id: "UNIDADE-TESTE",
  title: "TERMO DE TESTE — SEM VALOR LEGAL",
  body: "Texto sintético de teste. A localização é usada só durante a viagem ativa. SEM VALOR LEGAL.",
  effective_date: "2026-01-01",
  controller: {
    legal_name: "EMPRESA FICTÍCIA DE TESTE — SEM VALOR LEGAL",
    cnpj: "00.000.000/0000-00",
    contact_channel: "canal fictício de teste",
    contact_owner: "papel fictício de teste",
  },
  retention: { operational_event_days: 10, detailed_point_days: 5, after_expiry: "delete" },
  access_roles: ["despacho_autorizado"],
  language: "pt-BR",
  approved: true,
};

interface Piloto {
  base: string;
  processo: ChildProcess;
  dir: string;
  log: string[];
}

async function subirPiloto(opcoes: { flagGps: boolean; termoPublicavel: boolean }): Promise<Piloto> {
  const dir = mkdtempSync(join(tmpdir(), "rider-bridge-"));
  const porta = await portaLivre();
  writeFileSync(join(dir, "termo.json"), JSON.stringify(opcoes.termoPublicavel ? TERMO_DE_TESTE : {}));
  writeFileSync(join(dir, "flags.json"), JSON.stringify({ gps_capture_enabled: opcoes.flagGps }));
  const env = {
    ...process.env,
    ENTREGAS_UI_PORT: String(porta),
    ENTREGAS_PILOT_CONFIG: "config/entregas-pilot.example.json",
    ENTREGAS_DATA_DIR: join(dir, "dados"),
    ENTREGAS_TERM_CONFIG: join(dir, "termo.json"),
    ENTREGAS_GPS_FLAGS_CONFIG: join(dir, "flags.json"),
    ENTREGAS_UNIT_CONFIG: join(dir, "sem-unidade.json"),
  };
  delete (env as Record<string, string | undefined>).ENTREGAS_BIND;
  delete (env as Record<string, string | undefined>).ENTREGAS_HTTPS;
  const processo = spawn("npx", ["tsx", "tools/entregas_pilot_server.ts"], {
    cwd: RAIZ,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });
  const log: string[] = [];
  processo.stdout?.on("data", (d) => log.push(String(d)));
  processo.stderr?.on("data", (d) => log.push(String(d)));
  const base = `http://127.0.0.1:${porta}`;
  for (let i = 0; i < 120; i++) {
    try {
      const r = await fetch(`${base}/api/health`);
      if (r.ok) return { base, processo, dir, log };
    } catch {
      /* ainda subindo */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  derrubar({ base, processo, dir, log });
  throw new Error(`piloto não subiu: ${log.join("").slice(-400)}`);
}

function derrubar(p: Piloto): void {
  try {
    if (p.processo.pid) process.kill(-p.processo.pid, "SIGTERM");
  } catch {
    /* já saiu */
  }
  rmSync(p.dir, { recursive: true, force: true });
}

async function comoConsole(p: Piloto, caminho: string, corpo: unknown, token = TOKEN_CONSOLE): Promise<Record<string, unknown>> {
  const r = await fetch(`${p.base}${caminho}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(corpo),
  });
  return (await r.json()) as Record<string, unknown>;
}

async function montarViagem(p: Piloto, tripId: string, courier = "rid-1"): Promise<void> {
  const pedido = `P-${tripId}`;
  await comoConsole(p, "/api/ready-order", { order_ref: pedido, label: `Teste · Rua da Bancada, ${tripId}` });
  const r = (await comoConsole(p, "/api/command", {
    type: "CreateTrip",
    command_id: `ct-${tripId}`,
    occurred_at: new Date().toISOString(),
    unit_id: "demo-unit",
    trip_id: tripId,
    courier_actor_id: courier,
    deliveries: [{ delivery_id: `D-${pedido}`, order_ref: pedido }],
    actor: { actor_id: "ops-console-1", role: "operador_expedicao" },
  })) as { result?: { ok?: boolean; error?: string } };
  assert.ok(r.result?.ok, `CreateTrip recusado: ${r.result?.error}`);
}

async function encerrarViagem(p: Piloto, tripId: string): Promise<void> {
  const r = (await comoConsole(p, "/api/command", {
    type: "CloseTripManually",
    command_id: `cls-${tripId}`,
    occurred_at: new Date().toISOString(),
    unit_id: "demo-unit",
    trip_id: tripId,
    reason: "Encerramento pelo console (teste)",
    actor: { actor_id: "admin-1", role: "gerente" },
  }, TOKEN_GERENTE)) as { result?: { ok?: boolean; error?: string } };
  assert.ok(r.result?.ok, `CloseTripManually recusado: ${r.result?.error}`);
}

/**
 * O motoboy da sessão já respondeu ao termo NO SERVIDOR (o registro legal),
 * para um aparelho. Sem isto, os cenários de "aparelho já liberado" passariam
 * pela falta de aceite, não pelo que dizem testar.
 */
async function respostaNoServidor(p: Piloto, status: "accepted" | "declined", deviceId = DEVICE_FALSO): Promise<void> {
  const r = await fetch(`${p.base}/api/term/acknowledge`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN_MOTOBOY}` },
    body: JSON.stringify({ status, device_id: deviceId, app_version: "1.0.0-debug" }),
  });
  const b = (await r.json()) as { ok?: boolean; record?: { status?: string } };
  assert.equal(b.ok, true, `resposta ao termo recusada: ${JSON.stringify(b)}`);
  assert.equal(b.record?.status, status);
}

async function estadoDaViagem(p: Piloto, tripId: string): Promise<string | undefined> {
  const r = await fetch(`${p.base}/api/snapshot`, { headers: { Authorization: `Bearer ${TOKEN_CONSOLE}` } });
  const s = (await r.json()) as { trips?: { trip_id: string; state: string }[] };
  return s.trips?.find((t) => t.trip_id === tripId)?.state;
}

/**
 * A ponte falsa. `portaoAberto` semeia um aparelho que já passou por termo e
 * permissão (isola a lacuna da ponte); sem ele, o portão depende do que a
 * página entregar: políticas, aceite e permissão.
 */
interface ConfigDaPonte {
  portaoAberto?: boolean;
  permissao: "concedida" | "ausente";
  concedeAoPedir: boolean;
  /** O serviço nativo já está preso a esta viagem quando a página abre. */
  viagemNativa?: string;
}

function scriptDaPonte(cfg: ConfigDaPonte | null): string {
  const espiaoGeo = `
    window.__geoWatch = 0;
    if (navigator.geolocation) {
      const orig = navigator.geolocation.watchPosition.bind(navigator.geolocation);
      navigator.geolocation.watchPosition = (...a) => { window.__geoWatch += 1; return orig(...a); };
    }`;
  const sessao = `localStorage.setItem("entregas_pilot_token", ${JSON.stringify(TOKEN_MOTOBOY)});`;
  if (!cfg) return `${sessao}${espiaoGeo}`;
  return `${sessao}${espiaoGeo}
  (() => {
    const cfg = ${JSON.stringify(cfg)};
    const chamadas = (window.__nativeCalls = []);
    const estado = {
      permissao: cfg.permissao === "concedida" ? "granted" : "missing",
      acks: [], politicas: null, viagem: cfg.viagemNativa || null, deviceId: ${JSON.stringify(DEVICE_FALSO)},
    };
    const chamar = (nome, arg) => chamadas.push([nome, arg === undefined ? null : arg]);
    const postar = (m) => setTimeout(() => window.__entregasNativeMessage && window.__entregasNativeMessage(JSON.stringify(m)), 0);
    function bloqueios() {
      if (cfg.portaoAberto) return estado.viagem ? [] : ["no_active_trip"];
      const b = [];
      if (!estado.politicas || !estado.politicas.flags || !estado.politicas.flags.gps_capture_enabled) b.push("capture_disabled");
      if (!estado.viagem) b.push("no_active_trip");
      const termo = estado.politicas && estado.politicas.term;
      if (!termo || !termo.publishable) b.push("term_not_publishable");
      else {
        const doHash = estado.acks.filter((a) => a.term_hash === termo.hash);
        if (!doHash.length) b.push("term_not_acknowledged");
        else if (doHash[doHash.length - 1].status !== "accepted") b.push("term_declined");
      }
      if (estado.permissao !== "granted") b.push(estado.permissao === "denied" ? "permission_denied" : "permission_missing");
      return b;
    }
    window.EntregasNative = {
      version: () => "android-bridge@1.0.0",
      capabilities: () => JSON.stringify({ runtime: "android", app_version: "1.0.0-debug", foreground_service: true,
        native_geofencing: true, activity_recognition: false, sdk_int: 34, device_id: estado.deviceId }),
      status: () => {
        const b = bloqueios();
        return JSON.stringify({ active_trip_id: estado.viagem, allowed: b.length === 0, message: b.length ? "bloqueado: " + b[0] : "",
          blocks: b.join(","), approximate_only: false, term_ok: !b.some((x) => x.startsWith("term_")), pending_points: 0, pending_events: 0 });
      },
      applyServerPolicies: (json) => { chamar("applyServerPolicies", JSON.parse(json)); estado.politicas = JSON.parse(json); return JSON.stringify({ ok: true }); },
      recordTermAcknowledgement: (json) => {
        const o = JSON.parse(json); chamar("recordTermAcknowledgement", o);
        if (o.device_id !== estado.deviceId) return JSON.stringify({ ok: false, error: "registro_invalido" });
        estado.acks.push(o); return JSON.stringify({ ok: true, acknowledgement_id: o.acknowledgement_id });
      },
      receipt: (id) => { chamar("receipt", id); const a = estado.acks.find((x) => x.acknowledgement_id === id);
        return JSON.stringify(a ? { ok: true, recibo: id, versao_do_termo: a.term_version, impressao_do_texto: a.term_hash, aceito_em: a.accepted_at, situacao: a.status === "accepted" ? "aceito" : "recusado" } : { ok: false }); },
      requestLocationPermission: () => { chamar("requestLocationPermission");
        setTimeout(() => { estado.permissao = cfg.concedeAoPedir ? "granted" : "denied";
          postar({ type: "service_state", foreground_service_running: false, notification_visible: false, bound_trip_id: estado.viagem,
            permission_state: estado.permissao === "granted" ? "granted_precise" : "denied", location_services_enabled: true }); }, 30); },
      openAppSettings: () => chamar("openAppSettings"),
      startTripCapture: (tripId) => { chamar("startTripCapture", tripId);
        const b = bloqueios().filter((x) => x !== "no_active_trip");
        if (b.length) { postar({ type: "error", error: b[0].startsWith("permission") ? "permission_denied" : "not_supported", detail: "bloqueado: " + b[0], block: b[0] }); return; }
        estado.viagem = tripId;
        postar({ type: "service_state", foreground_service_running: true, notification_visible: true, bound_trip_id: tripId });
        setTimeout(() => postar({ type: "location", latitude: -23.58, longitude: -46.67, accuracy_m: 8, time_ms: Date.now(), provider: "fused" }), 40); },
      stopTripCapture: () => { chamar("stopTripCapture"); estado.viagem = null;
        postar({ type: "service_state", foreground_service_running: false, notification_visible: false, bound_trip_id: null, stop_reason: "trip_ended" }); },
      syncNow: () => chamar("syncNow"),
    };
  })();`;
}

async function abrir(browser: Browser, p: Piloto, cfg: ConfigDaPonte | null): Promise<{ ctx: BrowserContext; page: Page; erros: string[] }> {
  const ctx = await browser.newContext();
  await ctx.addInitScript({ content: scriptDaPonte(cfg) });
  const page = await ctx.newPage();
  const erros: string[] = [];
  page.on("pageerror", (e) => erros.push(String(e)));
  page.on("dialog", (d) => void d.accept());
  await page.goto(`${p.base}/rider-mobile/`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => {
    const t = document.getElementById("stopTitle")?.textContent || "";
    return t && t !== "Carregando…";
  }, null, { timeout: 15000 });
  return { ctx, page, erros };
}

type Chamada = [string, unknown];
async function chamadas(page: Page): Promise<Chamada[]> {
  return (await page.evaluate(() => (window as unknown as { __nativeCalls?: Chamada[] }).__nativeCalls ?? [])) as Chamada[];
}
async function chamadasDe(page: Page, nome: string): Promise<unknown[]> {
  return (await chamadas(page)).filter((c) => c[0] === nome).map((c) => c[1]);
}
async function esperarChamada(page: Page, nome: string, ms = 8000): Promise<void> {
  await page.waitForFunction(
    (n) => ((window as unknown as { __nativeCalls?: [string, unknown][] }).__nativeCalls ?? []).some((c) => c[0] === n),
    nome,
    { timeout: ms },
  );
}
const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function confirmarSaida(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const b = document.getElementById("btnPrimary");
    return !!b && !b.hidden && (b.textContent || "").includes("Confirmar saída");
  }, null, { timeout: 10000 });
  await page.click("#btnPrimary");
}

async function aceitarTermo(page: Page): Promise<void> {
  await page.waitForSelector("#consent:not([hidden])", { timeout: 10000 });
  await page.check("#consentCheck");
  await page.click("#btnConsentAccept");
}

async function main(): Promise<void> {
  console.log("\n=== Q-018 — rider-mobile aciona a captura nativa pela ponte ===\n");
  const browser = await chromium.launch();
  try {
    /* ------------------------------------------------------------ */
    console.log("A. NAVEGADOR SEM A PONTE: a página segue funcionando, e não há GPS web paralelo");
    {
      const p = await subirPiloto({ flagGps: true, termoPublicavel: true });
      try {
        await montarViagem(p, "T-NAV-1");
        const { ctx, page, erros } = await abrir(browser, p, null);
        await teste("A1 sem EntregasNative, a saída confirma e a viagem vai para em_rota", async () => {
          await confirmarSaida(page);
          for (let i = 0; i < 40 && (await estadoDaViagem(p, "T-NAV-1")) !== "em_rota"; i++) await pausa(100);
          assert.equal(await estadoDaViagem(p, "T-NAV-1"), "em_rota");
        });
        await teste("A2 nenhum watchPosition do navegador: GPS só pelo aplicativo", async () => {
          await pausa(800);
          assert.equal(await page.evaluate(() => (window as unknown as { __geoWatch: number }).__geoWatch), 0);
        });
        await teste("A3 sem erro de script", async () => {
          assert.deepEqual(erros, []);
        });
        await ctx.close();
      } finally {
        derrubar(p);
      }
    }

    /* ------------------------------------------------------------ */
    console.log("\nB. A LACUNA DA PONTE: aparelho já com termo e permissão válidos");
    {
      const p = await subirPiloto({ flagGps: true, termoPublicavel: true });
      try {
        await montarViagem(p, "T-PONTE-1");
        await respostaNoServidor(p, "accepted");
        const { ctx, page, erros } = await abrir(browser, p, { portaoAberto: true, permissao: "concedida", concedeAoPedir: true });
        await teste("B1 antes da saída, nada liga a captura", async () => {
          await pausa(800);
          assert.deepEqual(await chamadasDe(page, "startTripCapture"), []);
        });
        await teste("B2 saída confirmada pelo domínio -> startTripCapture da MESMA viagem, uma vez", async () => {
          await confirmarSaida(page);
          await esperarChamada(page, "startTripCapture");
          assert.equal(await estadoDaViagem(p, "T-PONTE-1"), "em_rota");
          assert.deepEqual(await chamadasDe(page, "startTripCapture"), ["T-PONTE-1"]);
          assert.equal(await page.evaluate(() => (window as unknown as { __geoWatch: number }).__geoWatch), 0);
        });
        await teste("B3 o status de GPS existente reflete o serviço nativo", async () => {
          await page.waitForFunction(() => (document.getElementById("gpsStatus")?.textContent || "").includes("GPS ATIVO"), null, { timeout: 5000 });
        });
        await teste("B4 viagem encerrada pelo console -> stopTripCapture (GPS só durante viagem ativa)", async () => {
          await encerrarViagem(p, "T-PONTE-1");
          await esperarChamada(page, "stopTripCapture", 25000);
          await page.waitForFunction(() => (document.getElementById("gpsStatus")?.textContent || "").includes("GPS DESLIGADO"), null, { timeout: 5000 });
        });
        await teste("B5 sem erro de script", async () => {
          assert.deepEqual(erros, []);
        });
        await ctx.close();
      } finally {
        derrubar(p);
      }
    }

    /* ------------------------------------------------------------ */
    console.log("\nC. O CAMINHO COMPLETO: políticas, termo, permissão, saída, captura");
    {
      const p = await subirPiloto({ flagGps: true, termoPublicavel: true });
      try {
        await montarViagem(p, "T-COMPLETO-1");
        const { ctx, page, erros } = await abrir(browser, p, { permissao: "ausente", concedeAoPedir: true });
        const politicas = (await (await fetch(`${p.base}/api/policies`, { headers: { Authorization: `Bearer ${TOKEN_MOTOBOY}` } })).json()) as {
          term: { hash: string; material_version: string };
        };
        await teste("C1 a página entrega ao nativo as políticas que o servidor deu (flag e hash do termo)", async () => {
          await esperarChamada(page, "applyServerPolicies");
          const dadas = (await chamadasDe(page, "applyServerPolicies")) as { flags: { gps_capture_enabled: boolean }; term: { hash: string } }[];
          assert.equal(dadas[dadas.length - 1].flags.gps_capture_enabled, true);
          assert.equal(dadas[dadas.length - 1].term.hash, politicas.term.hash);
        });
        await teste("C2 termo antes de permissão: a tela do termo aparece e nada pede permissão ainda", async () => {
          await page.waitForSelector("#consent:not([hidden])", { timeout: 10000 });
          assert.deepEqual(await chamadasDe(page, "requestLocationPermission"), []);
        });
        await teste("C3 o checkbox nasce desmarcado e CONCORDAR fica desabilitado até o dedo marcar", async () => {
          assert.equal(await page.isChecked("#consentCheck"), false);
          assert.equal(await page.isDisabled("#btnConsentAccept"), true);
          await page.check("#consentCheck");
          assert.equal(await page.isDisabled("#btnConsentAccept"), false);
          await page.uncheck("#consentCheck");
        });
        await teste("C4 aceite construído pelo SERVIDOR e gravado no nativo, com o hash do termo e o aparelho do nativo", async () => {
          await aceitarTermo(page);
          await esperarChamada(page, "recordTermAcknowledgement");
          const ack = (await chamadasDe(page, "recordTermAcknowledgement"))[0] as Record<string, string>;
          assert.equal(ack.status, "accepted");
          assert.equal(ack.term_hash, politicas.term.hash);
          assert.equal(ack.device_id, "dev-ponte-falsa-01");
          assert.equal(ack.rider_id, "rid-1");
          assert.match(ack.acknowledgement_id, /^[0-9a-f]{32}$/);
        });
        await teste("C5 só depois do aceite a página pede a permissão do Android", async () => {
          await esperarChamada(page, "requestLocationPermission");
          const ordem = (await chamadas(page)).map((c) => c[0]);
          assert.ok(ordem.indexOf("recordTermAcknowledgement") < ordem.indexOf("requestLocationPermission"));
        });
        await teste("C6 termo e permissão válidos, viagem ainda em preparo: nada liga", async () => {
          await pausa(800);
          assert.deepEqual(await chamadasDe(page, "startTripCapture"), []);
        });
        await teste("C7 saída confirmada -> captura da viagem, depois das políticas e do aceite", async () => {
          await confirmarSaida(page);
          await esperarChamada(page, "startTripCapture");
          assert.deepEqual(await chamadasDe(page, "startTripCapture"), ["T-COMPLETO-1"]);
          const ordem = (await chamadas(page)).map((c) => c[0]);
          assert.ok(ordem.indexOf("applyServerPolicies") < ordem.indexOf("startTripCapture"));
          assert.ok(ordem.indexOf("recordTermAcknowledgement") < ordem.indexOf("startTripCapture"));
        });
        await teste("C8 nenhum watchPosition do navegador no aplicativo", async () => {
          assert.equal(await page.evaluate(() => (window as unknown as { __geoWatch: number }).__geoWatch), 0);
        });
        await teste("C9 o servidor guardou o aceite (registro legal), do motoboy da sessão e do aparelho nativo", async () => {
          const linhas = readFileSync(join(p.dir, "dados", "term-acks.jsonl"), "utf8").split("\n").filter(Boolean);
          const aceites = linhas.map((l) => JSON.parse(l) as Record<string, string>).filter((a) => a.status === "accepted");
          assert.equal(aceites.length, 1);
          assert.equal(aceites[0].rider_id, "rid-1");
          assert.equal(aceites[0].device_id, "dev-ponte-falsa-01");
          assert.equal(aceites[0].term_hash, politicas.term.hash);
        });
        await teste("C10 sem erro de script", async () => {
          assert.deepEqual(erros, []);
        });
        await ctx.close();
      } finally {
        derrubar(p);
      }
    }

    /* ------------------------------------------------------------ */
    console.log("\nD. O QUE NÃO PODE LIGAR");
    {
      const p = await subirPiloto({ flagGps: true, termoPublicavel: true });
      try {
        await montarViagem(p, "T-RECUSA-1");
        await respostaNoServidor(p, "accepted");
        const { ctx, page } = await abrir(browser, p, { portaoAberto: true, permissao: "concedida", concedeAoPedir: true });
        await page.route("**/api/command", async (rota) => {
          const corpo = JSON.parse(rota.request().postData() || "{}") as { type?: string };
          if (corpo.type !== "ConfirmTripDeparture") return rota.continue();
          await rota.fulfill({ status: 200, contentType: "application/json",
            body: JSON.stringify({ result: { ok: false, error: "Não é possível confirmar a saída neste momento." } }) });
        });
        await teste("D1 saída RECUSADA pelo domínio -> nenhuma captura", async () => {
          // O aceite do servidor chegou ao nativo: o único motivo possível é a saída.
          await esperarChamada(page, "recordTermAcknowledgement");
          await confirmarSaida(page);
          await pausa(1500);
          assert.equal(await estadoDaViagem(p, "T-RECUSA-1"), "preparando_saida");
          assert.deepEqual(await chamadasDe(page, "startTripCapture"), []);
        });
        await ctx.close();
      } finally {
        derrubar(p);
      }
    }
    {
      const p = await subirPiloto({ flagGps: true, termoPublicavel: true });
      try {
        await montarViagem(p, "T-RECUSA-2");
        const { ctx, page } = await abrir(browser, p, { permissao: "ausente", concedeAoPedir: true });
        await teste("D2 termo RECUSADO -> recusa registrada, nenhuma permissão pedida, nenhuma captura", async () => {
          await page.waitForSelector("#consent:not([hidden])", { timeout: 10000 });
          await page.click("#btnConsentDecline");
          await esperarChamada(page, "recordTermAcknowledgement");
          const ack = (await chamadasDe(page, "recordTermAcknowledgement"))[0] as Record<string, string>;
          assert.equal(ack.status, "declined");
          await confirmarSaida(page);
          await pausa(1500);
          assert.equal(await estadoDaViagem(p, "T-RECUSA-2"), "em_rota");
          assert.deepEqual(await chamadasDe(page, "requestLocationPermission"), []);
          assert.deepEqual(await chamadasDe(page, "startTripCapture"), []);
        });
        await ctx.close();
      } finally {
        derrubar(p);
      }
    }
    {
      const p = await subirPiloto({ flagGps: true, termoPublicavel: true });
      try {
        await montarViagem(p, "T-RECUSA-3");
        const { ctx, page } = await abrir(browser, p, { permissao: "ausente", concedeAoPedir: false });
        await teste("D3 permissão NEGADA -> nenhuma captura, e o caminho das configurações existe", async () => {
          await aceitarTermo(page);
          await esperarChamada(page, "requestLocationPermission");
          await confirmarSaida(page);
          await pausa(1500);
          assert.deepEqual(await chamadasDe(page, "startTripCapture"), []);
          await page.waitForSelector("#btnLocationSettings:not([hidden])", { timeout: 5000 });
          await page.click("#btnLocationSettings");
          await esperarChamada(page, "openAppSettings");
        });
        await ctx.close();
      } finally {
        derrubar(p);
      }
    }
    {
      const p = await subirPiloto({ flagGps: false, termoPublicavel: true });
      try {
        await montarViagem(p, "T-RECUSA-4");
        const { ctx, page } = await abrir(browser, p, { permissao: "concedida", concedeAoPedir: true });
        await teste("D4 flag de GPS DESLIGADA no servidor -> sem termo, sem pedido de permissão, sem captura", async () => {
          await esperarChamada(page, "applyServerPolicies");
          await confirmarSaida(page);
          await pausa(1500);
          assert.equal(await page.isHidden("#consent"), true);
          assert.deepEqual(await chamadasDe(page, "requestLocationPermission"), []);
          assert.deepEqual(await chamadasDe(page, "startTripCapture"), []);
        });
        await ctx.close();
      } finally {
        derrubar(p);
      }
    }

    /* ------------------------------------------------------------ */
    console.log("\nE. QUEM, QUAL VIAGEM, E O QUE SOBRA DEPOIS");
    {
      const p = await subirPiloto({ flagGps: true, termoPublicavel: true });
      try {
        await montarViagem(p, "T-OUTRO-APARELHO");
        // O mesmo motoboy aceitou, mas em OUTRO aparelho.
        await respostaNoServidor(p, "accepted", "dev-outro-aparelho");
        const { ctx, page } = await abrir(browser, p, { permissao: "concedida", concedeAoPedir: true });
        await teste("E1 aceite de OUTRO aparelho não vale para este: o termo aparece e nada liga", async () => {
          await page.waitForSelector("#consent:not([hidden])", { timeout: 10000 });
          await confirmarSaida(page);
          await pausa(1500);
          assert.deepEqual(await chamadasDe(page, "recordTermAcknowledgement"), []);
          assert.deepEqual(await chamadasDe(page, "startTripCapture"), []);
        });
        await ctx.close();
      } finally {
        derrubar(p);
      }
    }
    {
      const p = await subirPiloto({ flagGps: true, termoPublicavel: true });
      try {
        await montarViagem(p, "T-DE-OUTRO", "rid-outro");
        await respostaNoServidor(p, "accepted");
        const { ctx, page } = await abrir(browser, p, { permissao: "concedida", concedeAoPedir: true });
        await teste("E2 viagem de OUTRO motoboy: saída confirmada, e mesmo assim nada liga neste aparelho", async () => {
          await esperarChamada(page, "recordTermAcknowledgement");
          await confirmarSaida(page);
          for (let i = 0; i < 30 && (await estadoDaViagem(p, "T-DE-OUTRO")) !== "em_rota"; i++) await pausa(100);
          assert.equal(await estadoDaViagem(p, "T-DE-OUTRO"), "em_rota");
          await pausa(1000);
          assert.deepEqual(await chamadasDe(page, "startTripCapture"), []);
          await page.waitForFunction(() => (document.getElementById("gpsStatus")?.textContent || "").includes("VIAGEM DE OUTRO MOTOBOY"), null, { timeout: 5000 });
        });
        await ctx.close();
      } finally {
        derrubar(p);
      }
    }
    {
      const p = await subirPiloto({ flagGps: true, termoPublicavel: true });
      try {
        await montarViagem(p, "T-ENCERRADA");
        await respostaNoServidor(p, "accepted");
        const { ctx: c1, page: p1 } = await abrir(browser, p, { permissao: "concedida", concedeAoPedir: true });
        await confirmarSaida(p1);
        await esperarChamada(p1, "startTripCapture");
        await c1.close();
        // A página fechou com a captura ligada; o console encerra a viagem.
        await encerrarViagem(p, "T-ENCERRADA");
        const { ctx, page } = await abrir(browser, p, { permissao: "concedida", concedeAoPedir: true, viagemNativa: "T-ENCERRADA" });
        await teste("E3 reabrir com o serviço nativo preso a viagem ENCERRADA -> a página desliga, sem religar", async () => {
          await esperarChamada(page, "stopTripCapture");
          await pausa(800);
          assert.deepEqual(await chamadasDe(page, "startTripCapture"), []);
        });
        await ctx.close();
      } finally {
        derrubar(p);
      }
    }
    {
      const p = await subirPiloto({ flagGps: true, termoPublicavel: true });
      try {
        await montarViagem(p, "T-EM-ROTA");
        await respostaNoServidor(p, "accepted");
        const { ctx: c1, page: p1 } = await abrir(browser, p, { permissao: "concedida", concedeAoPedir: true });
        await confirmarSaida(p1);
        await esperarChamada(p1, "startTripCapture");
        await c1.close();
        const { ctx, page } = await abrir(browser, p, { permissao: "concedida", concedeAoPedir: true, viagemNativa: "T-EM-ROTA" });
        await teste("E4 reabrir no meio da viagem -> reafirma a MESMA viagem uma vez, sem desligar", async () => {
          await esperarChamada(page, "startTripCapture");
          await pausa(800);
          assert.deepEqual(await chamadasDe(page, "startTripCapture"), ["T-EM-ROTA"]);
          assert.deepEqual(await chamadasDe(page, "stopTripCapture"), []);
          await page.waitForFunction(() => (document.getElementById("gpsStatus")?.textContent || "").includes("GPS ATIVO"), null, { timeout: 5000 });
        });
        await ctx.close();
      } finally {
        derrubar(p);
      }
    }
    {
      const p = await subirPiloto({ flagGps: true, termoPublicavel: true });
      try {
        await montarViagem(p, "T-RECUSA-FIRME");
        await respostaNoServidor(p, "declined");
        const { ctx, page, erros } = await abrir(browser, p, { permissao: "concedida", concedeAoPedir: true });
        await teste("E5 recusa registrada: reabrir não oferece o termo de novo, e a captura segue desligada", async () => {
          await esperarChamada(page, "recordTermAcknowledgement");
          const ack = (await chamadasDe(page, "recordTermAcknowledgement"))[0] as Record<string, string>;
          assert.equal(ack.status, "declined");
          await confirmarSaida(page);
          await pausa(1500);
          assert.equal(await page.isHidden("#consent"), true);
          assert.deepEqual(await chamadasDe(page, "requestLocationPermission"), []);
          assert.deepEqual(await chamadasDe(page, "startTripCapture"), []);
          await page.waitForFunction(() => (document.getElementById("gpsStatus")?.textContent || "").includes("TERMO NÃO ACEITO"), null, { timeout: 5000 });
          assert.deepEqual(erros, []);
        });
        await ctx.close();
      } finally {
        derrubar(p);
      }
    }
  } finally {
    await browser.close();
  }

  console.log(`\n${passou}/${passou + falhas.length} provas da ponte`);
  if (falhas.length) {
    console.log("\nRIDER_BRIDGE_RED");
    process.exit(1);
  }
  console.log("\nRIDER_BRIDGE_GREEN");
}

void main().catch((e) => {
  console.error("falha ao executar a suíte:", e);
  process.exit(1);
});
