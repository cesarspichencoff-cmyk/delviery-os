/**
 * Bancada Q-018 — o motoboy na rider-mobile, pelo caminho do emulador.
 *
 * Chamado por tools/bancada_q018_cadeia.sh, que sobe a topologia (crítico
 * simulated, assíncrono, PostgreSQL, piloto com HTTPS nativo, termo sintético
 * de laboratório, relays em 10.0.2.2). Aqui:
 *
 *  - o Chromium abre https://10.0.2.2:<piloto>/rider-mobile/ confiando SÓ no
 *    certificado da bancada (pino de SPKI, sem trust-all, sem proxy);
 *  - a sessão do motoboy entra como `entregasPilotLogin` a poria;
 *  - o termo sintético é ACEITO PELA INTERFACE (checkbox + CONCORDAR), a
 *    permissão é concedida quando a página pede, e a saída é confirmada pelo
 *    botão — o domínio decide;
 *  - `EntregasNative` é uma PONTE DE BANCADA: o portão do Kotlin (flag, termo
 *    publicável e aceito pelo hash, permissão) dentro da página, e o lado
 *    nativo de rede FEITO DE VERDADE pelo Node, no formato exato de
 *    DeviceSession.autenticar e do lote do SyncWorker, contra o crítico, pelo
 *    TLS de bancada (confiando só na CA de laboratório).
 *
 * O que isto NÃO é: o Kotlin. Room, TripLocationService, Fused e WorkManager
 * não rodam aqui — isso é o Foxxy. Nunca imprime token nem segredo.
 *
 * Uso: npx tsx tools/bancada_q018_rider.ts <piloto> <critico> <ca.pem> <spki> <device_id> <saida.json>
 * Termina com RIDER_Q018_GREEN, ou RIDER_Q018_RED e exit 1.
 */

import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import https from "node:https";
import { chromium, type Page } from "playwright";

const [PILOTO, CRITICO, CA_PEM, SPKI, DEVICE, SAIDA] = process.argv.slice(2);
if (!SAIDA) {
  console.error("uso: bancada_q018_rider.ts <piloto> <critico> <ca.pem> <spki> <device_id> <saida.json>");
  process.exit(2);
}
const CA = readFileSync(CA_PEM);
const TOKEN_MOTOBOY = "CHANGE_ME_RIDER_TOKEN"; // do arquivo de EXEMPLO do piloto — só laboratório
const TOKEN_CONSOLE = "CHANGE_ME_OPS_TOKEN";
const TOKEN_GERENTE = "CHANGE_ME_ADMIN_TOKEN";
const MARCA = "SEM VALOR LEGAL — APENAS TESTE SIMULADO";
const VIAGEM = `T-Q018-${Date.now().toString(36)}`;

let falhas = 0;
function checa(ok: boolean, texto: string): void {
  console.log(`${ok ? "  ok  " : "  XX  "}${texto}`);
  if (!ok) falhas += 1;
}

/** HTTPS confiando só na CA de laboratório, sem proxy. */
function pedir(url: string, metodo: string, corpo?: unknown, token?: string): Promise<{ status: number; json: Record<string, unknown> }> {
  return new Promise((ok, erro) => {
    const u = new URL(url);
    const dados = corpo === undefined ? undefined : Buffer.from(JSON.stringify(corpo));
    const req = https.request(
      {
        host: u.hostname,
        port: u.port,
        path: u.pathname + u.search,
        method: metodo,
        ca: CA,
        agent: false,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "X-Entregas-Client": "android-client@1.0.0",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(dados ? { "Content-Length": String(dados.length) } : {}),
        },
      },
      (res) => {
        const partes: Buffer[] = [];
        res.on("data", (c: Buffer) => partes.push(c));
        res.on("end", () => {
          const texto = Buffer.concat(partes).toString("utf8");
          let json: Record<string, unknown> = {};
          try {
            json = texto ? (JSON.parse(texto) as Record<string, unknown>) : {};
          } catch {
            json = { _texto: texto.slice(0, 200) };
          }
          ok({ status: res.statusCode ?? 0, json });
        });
      },
    );
    req.on("error", erro);
    if (dados) req.write(dados);
    req.end();
  });
}

/* ---------- o lado nativo de rede, no formato do app ---------- */
const segredo = randomBytes(16).toString("hex"); // como DeviceSession gera; nunca impresso
let sequencia = 0;
const capturas: Record<string, unknown>[] = [];

/** DeviceSession.autenticar + o lote do SyncWorker, contra o crítico. */
async function capturarESincronizar(tripId: string): Promise<Record<string, unknown>> {
  const sessao = await pedir(`${CRITICO}/api/device/session`, "POST", {
    device_id: DEVICE,
    device_secret: segredo,
    app_version: "1.0.0-debug",
    client: "android-client@1.0.0",
  });
  const token = typeof sessao.json.device_token === "string" ? sessao.json.device_token : "";
  sequencia += 1;
  const instante = new Date(Date.now() - 2000).toISOString();
  const ponto = {
    point_id: `pt-q018-${sequencia}`,
    idempotency_key: `gps:${DEVICE}:${tripId}:${instante}`,
    trip_id: tripId,
    device_id: DEVICE,
    latitude: -23.5838, // sintética
    longitude: -46.6773,
    accuracy_m: 8.5,
    occurred_at: instante,
    elapsed_realtime_ns: 123456789,
    provider: "gps",
    is_mock: false,
    captured_offline: false,
    sequence_local: sequencia,
    source: "device",
  };
  const lote = await pedir(
    `${CRITICO}/api/gps/batch`,
    "POST",
    { schema_version: "android-client@1.0.0", correlation_id: `sync-q018-${sequencia}`, points: [ponto] },
    token,
  );
  const r = {
    trip_id: tripId,
    sessao_status: sessao.status,
    token_presente: token.length > 0,
    lote_status: lote.status,
    aceitos: lote.json.accepted,
    classe: lote.json.classe,
  };
  capturas.push(r);
  return r;
}

/* ---------- a ponte de bancada, na página ---------- */
function scriptDaPonte(): string {
  return `
  localStorage.setItem("entregas_pilot_token", ${JSON.stringify(TOKEN_MOTOBOY)});
  (() => {
    const chamadas = (window.__nativeCalls = []);
    const estado = { permissao: "missing", acks: [], politicas: null, viagem: null, deviceId: ${JSON.stringify(DEVICE)} };
    const chamar = (n, a) => chamadas.push([n, a === undefined ? null : a]);
    const postar = (m) => setTimeout(() => window.__entregasNativeMessage && window.__entregasNativeMessage(JSON.stringify(m)), 0);
    // O portão do Kotlin (CaptureGate), com a mesma ordem de bloqueios.
    function bloqueios() {
      const b = [];
      if (!estado.politicas || !estado.politicas.flags || estado.politicas.flags.gps_capture_enabled !== true) b.push("capture_disabled");
      const termo = estado.politicas && estado.politicas.term;
      if (!termo || !termo.publishable) b.push("term_not_publishable");
      else {
        const doHash = estado.acks.filter((a) => a.term_hash === termo.hash);
        if (!doHash.length) b.push("term_not_acknowledged");
        else if (doHash[doHash.length - 1].status !== "accepted") b.push("term_declined");
      }
      if (estado.permissao !== "granted") b.push("permission_missing");
      return b;
    }
    window.EntregasNative = {
      version: () => "android-bridge@1.0.0",
      capabilities: () => JSON.stringify({ runtime: "android", app_version: "1.0.0-debug", foreground_service: true,
        native_geofencing: true, activity_recognition: false, sdk_int: 34, device_id: estado.deviceId }),
      status: () => { const b = bloqueios(); return JSON.stringify({ active_trip_id: estado.viagem, allowed: b.length === 0,
        message: b[0] || "", blocks: b.join(","), approximate_only: false, term_ok: !b.some((x) => x.startsWith("term_")), pending_points: 0, pending_events: 0 }); },
      applyServerPolicies: (json) => { chamar("applyServerPolicies", JSON.parse(json)); estado.politicas = JSON.parse(json); return JSON.stringify({ ok: true }); },
      recordTermAcknowledgement: (json) => { const o = JSON.parse(json); chamar("recordTermAcknowledgement", o);
        if (o.device_id !== estado.deviceId) return JSON.stringify({ ok: false, error: "aparelho_divergente" });
        estado.acks.push(o); return JSON.stringify({ ok: true, acknowledgement_id: o.acknowledgement_id }); },
      receipt: (id) => { chamar("receipt", id); return JSON.stringify({ ok: false }); },
      requestLocationPermission: () => { chamar("requestLocationPermission");
        // O motoboy toca em "Permitir" no diálogo do Android.
        setTimeout(() => { estado.permissao = "granted";
          postar({ type: "service_state", foreground_service_running: false, notification_visible: false, bound_trip_id: null,
            permission_state: "granted_precise", location_services_enabled: true }); }, 50); },
      openAppSettings: () => chamar("openAppSettings"),
      startTripCapture: (tripId) => { chamar("startTripCapture", tripId);
        const b = bloqueios();
        if (b.length) { postar({ type: "error", error: "not_supported", detail: "bloqueado: " + b[0], block: b[0] }); return; }
        estado.viagem = tripId;
        postar({ type: "service_state", foreground_service_running: true, notification_visible: true, bound_trip_id: tripId });
        window.__bancadaNativo(tripId).then(() =>
          postar({ type: "location", latitude: -23.5838, longitude: -46.6773, accuracy_m: 8.5, time_ms: Date.now(), provider: "gps" })); },
      stopTripCapture: () => { chamar("stopTripCapture"); estado.viagem = null;
        postar({ type: "service_state", foreground_service_running: false, notification_visible: false, bound_trip_id: null, stop_reason: "encerramento solicitado" }); },
      syncNow: () => chamar("syncNow"),
    };
  })();`;
}

async function esperarChamada(page: Page, nome: string, ms: number): Promise<void> {
  await page.waitForFunction(
    (n) => ((window as unknown as { __nativeCalls?: [string, unknown][] }).__nativeCalls ?? []).some((c) => c[0] === n),
    nome,
    { timeout: ms },
  );
}
async function chamadasDe(page: Page, nome: string): Promise<unknown[]> {
  return page.evaluate(
    (n) => ((window as unknown as { __nativeCalls?: [string, unknown][] }).__nativeCalls ?? []).filter((c) => c[0] === n).map((c) => c[1]),
    nome,
  );
}
const textoGps = (page: Page) => page.evaluate(() => document.getElementById("gpsStatus")?.textContent || "");

async function main(): Promise<void> {
  console.log(`== a rider-mobile pelo caminho do emulador (${PILOTO})`);
  const saude = await pedir(`${PILOTO}/api/health`, "GET");
  checa(saude.json.term_synthetic === true && saude.json.term_publishable === true,
    `piloto de laboratório: termo sintético publicável (term_synthetic=${saude.json.term_synthetic}, term_publishable=${saude.json.term_publishable})`);
  checa(saude.json.gps_production === true, `flag de GPS ligada no piloto (gps_production=${saude.json.gps_production})`);

  // A viagem, como o console montaria: pedido pronto + CreateTrip para o motoboy da sessão.
  await pedir(`${PILOTO}/api/ready-order`, "POST", { order_ref: `P-${VIAGEM}`, label: `Bancada · Rua do Laboratório, 1` }, TOKEN_CONSOLE);
  const criada = await pedir(`${PILOTO}/api/command`, "POST", {
    type: "CreateTrip", command_id: `ct-${VIAGEM}`, occurred_at: new Date().toISOString(), unit_id: "demo-unit",
    trip_id: VIAGEM, courier_actor_id: "rid-1", deliveries: [{ delivery_id: `D-${VIAGEM}`, order_ref: `P-${VIAGEM}` }],
    actor: { actor_id: "ops-console-1", role: "operador_expedicao" },
  }, TOKEN_CONSOLE);
  checa((criada.json.result as { ok?: boolean } | undefined)?.ok === true, `viagem ${VIAGEM} montada no console para rid-1`);

  // N1/N2 — a confiança vem do pino e da CA de laboratório, não de algo frouxo:
  // sem eles, o navegador e o cliente do Node RECUSAM o certificado da bancada.
  const semPino = await chromium.launch({ args: ["--no-proxy-server"] });
  try {
    const p = await (await semPino.newContext()).newPage();
    const erro = await p.goto(`${PILOTO}/rider-mobile/`).then(() => "", (e: Error) => e.message);
    checa(/ERR_CERT/.test(erro), `N1 sem o pino, o Chromium recusa o certificado da bancada (${(erro.match(/ERR_CERT_\w+/) ?? ["aceitou!"])[0]})`);
  } finally {
    await semPino.close();
  }
  const semCa = await new Promise<string>((ok) => {
    const u = new URL(`${PILOTO}/api/health`);
    https.get({ host: u.hostname, port: u.port, path: u.pathname, agent: false }, () => ok("")).on("error", (e) => ok(e.message));
  });
  checa(/certificate|self.signed|issuer/i.test(semCa), `N2 sem a CA de laboratório, o Node recusa o TLS (${semCa.slice(0, 60) || "aceitou!"})`);

  const browser = await chromium.launch({ args: ["--no-proxy-server", `--ignore-certificate-errors-spki-list=${SPKI}`] });
  try {
    const ctx = await browser.newContext();
    await ctx.exposeFunction("__bancadaNativo", (tripId: string) => capturarESincronizar(tripId));
    await ctx.addInitScript({ content: scriptDaPonte() });
    const page = await ctx.newPage();
    const erros: string[] = [];
    page.on("pageerror", (e) => erros.push(String(e)));
    page.on("dialog", (d) => void d.accept());
    await page.goto(`${PILOTO}/rider-mobile/`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => { const t = document.getElementById("stopTitle")?.textContent || ""; return t && t !== "Carregando…"; }, null, { timeout: 20000 });
    checa(true, "a página carregou pelo HTTPS de bancada, confiando só no certificado da bancada");

    await esperarChamada(page, "applyServerPolicies", 10000);
    const pol = (await chamadasDe(page, "applyServerPolicies")).at(-1) as { flags?: { gps_capture_enabled?: boolean }; term?: { hash?: string; publishable?: boolean } };
    checa(pol?.flags?.gps_capture_enabled === true && pol?.term?.publishable === true && typeof pol?.term?.hash === "string",
      "as políticas do servidor chegaram à ponte (flag ligada, termo publicável com hash)");

    await page.waitForSelector("#consent:not([hidden])", { timeout: 10000 });
    const textoTermo = (await page.textContent("#consentText")) || "";
    checa(textoTermo.includes(MARCA), `a tela do termo mostra "${MARCA}"`);
    checa((await chamadasDe(page, "requestLocationPermission")).length === 0, "nada pediu permissão antes do termo");

    await page.check("#consentCheck");
    await page.click("#btnConsentAccept");
    await esperarChamada(page, "recordTermAcknowledgement", 10000);
    const ack = (await chamadasDe(page, "recordTermAcknowledgement"))[0] as Record<string, string>;
    checa(ack?.status === "accepted" && ack?.device_id === DEVICE && ack?.rider_id === "rid-1" && ack?.term_hash === pol?.term?.hash,
      "aceite PELA INTERFACE: montado pelo servidor (rid-1, este aparelho, hash do termo sintético) e gravado na ponte");
    await esperarChamada(page, "requestLocationPermission", 10000);
    checa(true, "só depois do aceite a página pediu a permissão; o motoboy concedeu");

    await page.waitForTimeout(800);
    checa((await chamadasDe(page, "startTripCapture")).length === 0, "viagem ainda em preparo: nada ligou");

    await page.waitForFunction(() => { const b = document.getElementById("btnPrimary"); return !!b && !b.hidden && (b.textContent || "").includes("Confirmar saída"); }, null, { timeout: 10000 });
    await page.click("#btnPrimary");
    await esperarChamada(page, "startTripCapture", 15000);
    const ligadas = await chamadasDe(page, "startTripCapture");
    checa(JSON.stringify(ligadas) === JSON.stringify([VIAGEM]), `saída confirmada pelo domínio -> startTripCapture("${VIAGEM}"), uma vez`);

    for (let i = 0; i < 60 && capturas.length === 0; i++) await page.waitForTimeout(250);
    const c = capturas[0] ?? {};
    checa(c.sessao_status === 200 && c.token_presente === true, `sessão do aparelho no crítico pelo TLS de bancada -> ${String(c.sessao_status)}, token ${c.token_presente ? "presente" : "AUSENTE"}`);
    checa(c.lote_status === 200 && c.aceitos === 1 && c.trip_id === VIAGEM, `lote no formato do SyncWorker, com a viagem da página -> ${String(c.lote_status)}, aceitos=${String(c.aceitos)}`);
    await page.waitForFunction(() => (document.getElementById("gpsStatus")?.textContent || "").includes("GPS ATIVO"), null, { timeout: 10000 });
    checa(true, `o indicador existente diz: ${(await textoGps(page)).slice(0, 60)}…`);

    // O console encerra a viagem; a página relê a cada 15 s e desliga (L6).
    const fechada = await pedir(`${PILOTO}/api/command`, "POST", {
      type: "CloseTripManually", command_id: `cls-${VIAGEM}`, occurred_at: new Date().toISOString(), unit_id: "demo-unit",
      trip_id: VIAGEM, reason: "Encerramento na bancada", actor: { actor_id: "admin-1", role: "gerente" },
    }, TOKEN_GERENTE);
    checa((fechada.json.result as { ok?: boolean } | undefined)?.ok === true, "o console encerrou a viagem");
    await esperarChamada(page, "stopTripCapture", 30000);
    await page.waitForFunction(() => (document.getElementById("gpsStatus")?.textContent || "").includes("GPS DESLIGADO"), null, { timeout: 10000 });
    checa(true, "viagem encerrada -> stopTripCapture e GPS DESLIGADO (só durante viagem ativa)");
    checa(erros.length === 0, `sem erro de script${erros.length ? ": " + erros.join(" | ").slice(0, 200) : ""}`);

    writeFileSync(SAIDA, JSON.stringify({ trip_id: VIAGEM, device_id: DEVICE, acknowledgement_id: ack?.acknowledgement_id ?? null, term_hash: pol?.term?.hash ?? null, capturas }, null, 1));
    await ctx.close();
  } finally {
    await browser.close();
  }
  console.log(falhas === 0 ? "RIDER_Q018_GREEN" : `RIDER_Q018_RED (${falhas})`);
  process.exit(falhas === 0 ? 0 : 1);
}

void main().catch((e) => {
  console.error("falha na bancada da rider-mobile:", e instanceof Error ? e.message : e);
  console.log("RIDER_Q018_RED");
  process.exit(1);
});
