/**
 * Auditoria visual REAL 3C.1A — Playwright + Chrome
 * Gera PNGs reais, log de console/rede, não usa SVG como prova.
 */
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import {
  mkdirSync,
  writeFileSync,
  existsSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const OUT = join(ROOT, "docs/entregas/ux/capturas-reais");
const COMMIT = "cb74303932a8dd2dfdd5fd0c110639d16e654d3e";
const BASE = "http://127.0.0.1:5193";
const DATE = new Date().toISOString();

const VIEWPORTS = [
  { name: "1366x768", width: 1366, height: 768 },
  { name: "1440x900", width: 1440, height: 900 },
  { name: "768x1024", width: 768, height: 1024 },
  { name: "390x844", width: 390, height: 844 },
  { name: "360x800", width: 360, height: 800 },
];

if (existsSync(OUT)) rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const index = [];
const consoleErrors = [];
const networkFails = [];
const findings = [];

function logCap(meta) {
  index.push(meta);
  console.log("  CAP", meta.file, meta.scenario);
}

async function shot(page, file, meta) {
  const path = join(OUT, file);
  await page.screenshot({ path, fullPage: true });
  logCap({
    file,
    route: meta.route,
    viewport: meta.viewport,
    scenario: meta.scenario,
    fonte: "AMBIENTE DE DEMONSTRAÇÃO",
    commit: COMMIT,
    data: DATE,
  });
}

function startServer() {
  return new Promise((resolve, reject) => {
    const child = spawn("npx", ["tsc"], {
      cwd: ROOT,
      shell: true,
      stdio: "inherit",
    });
    child.on("exit", (code) => {
      if (code !== 0) return reject(new Error("tsc failed"));
      const srv = spawn("node", ["dist/tools/entregas_ui_server.js"], {
        cwd: ROOT,
        shell: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
      let ready = false;
      const onData = (buf) => {
        const s = buf.toString();
        process.stdout.write(s);
        if (s.includes("ENTREGAS UI demo") && !ready) {
          ready = true;
          resolve(srv);
        }
      };
      srv.stdout.on("data", onData);
      srv.stderr.on("data", onData);
      setTimeout(() => {
        if (!ready) {
          ready = true;
          resolve(srv);
        }
      }, 4000);
    });
  });
}

async function waitApi() {
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(`${BASE}/api/health`);
      if (r.ok) return;
    } catch {
      /* */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("UI server not healthy");
}

async function cmd(page, body) {
  return page.evaluate(async (b) => {
    const res = await fetch("/api/command", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(b),
    });
    return res.json();
  }, body);
}

async function main() {
  console.log("=== 3C.1A visual audit ===");
  console.log("COMMIT", COMMIT);
  const srv = await startServer();
  await waitApi();

  const browser = await chromium.launch({
    channel: "chrome",
    headless: true,
  });

  try {
    // —— Desktop console flows ——
    const desktop = VIEWPORTS[1]; // 1440x900
    const context = await browser.newContext({
      viewport: { width: desktop.width, height: desktop.height },
    });
    const page = await context.newPage();
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push({
          route: page.url(),
          text: msg.text(),
        });
      }
    });
    page.on("pageerror", (err) => {
      consoleErrors.push({ route: page.url(), text: String(err) });
    });
    page.on("response", (res) => {
      if (res.status() >= 400) {
        networkFails.push({
          url: res.url(),
          status: res.status(),
          route: page.url(),
        });
      }
    });

    // 1 loading / normal empty-ish
    await page.goto(`${BASE}/console/`, { waitUntil: "networkidle" });
    await page.waitForSelector(".demo-banner");
    await shot(page, "console_01_operacao_normal_1440.png", {
      route: "/console/",
      viewport: desktop.name,
      scenario: "operacao_normal_inicial",
    });

    // pedidos prontos visible
    await shot(page, "console_02_pedidos_prontos_1440.png", {
      route: "/console/",
      viewport: desktop.name,
      scenario: "pedidos_prontos",
    });

    // select 2 orders and create trip
    const boxes = page.locator('input[type=checkbox][data-order]');
    const count = await boxes.count();
    if (count >= 2) {
      await boxes.nth(0).check();
      await boxes.nth(1).check();
    }
    await page.click("#btnCreateTrip");
    await page.waitForTimeout(400);
    await shot(page, "console_03_montagem_viagem_1440.png", {
      route: "/console/",
      viewport: desktop.name,
      scenario: "montagem_viagem",
    });

    // multi stop already 2
    await shot(page, "console_04_multiplas_paradas_1440.png", {
      route: "/console/",
      viewport: desktop.name,
      scenario: "viagem_multiplas_paradas",
    });

    // limit 6
    await page.evaluate(async () => {
      const orders = ["P-101", "P-102", "P-103", "P-104", "P-105", "P-106"];
      const body = {
        type: "CreateTrip",
        command_id: "lim-6",
        occurred_at: new Date().toISOString(),
        unit_id: "demo-unit",
        trip_id: "T-LIMIT6",
        courier_actor_id: "rid-demo",
        deliveries: orders.map((order_ref, i) => ({
          delivery_id: `DL-${i}`,
          order_ref,
        })),
        actor: { actor_id: "ops-demo", role: "operador_expedicao" },
      };
      await fetch("/api/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    });
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(300);
    // force error display by UI create with 6 - check error box after failed domain
    await shot(page, "console_05_limite_politica_1440.png", {
      route: "/console/",
      viewport: desktop.name,
      scenario: "limite_configuravel_6_paradas_api",
    });

    // depart trip
    const departBtn = page.locator('button[data-act="depart"]').first();
    if (await departBtn.count()) {
      await departBtn.click();
      await page.waitForTimeout(400);
    }
    await shot(page, "console_11_em_rota_1440.png", {
      route: "/console/",
      viewport: desktop.name,
      scenario: "viagem_em_rota",
    });

    // remove stop
    const rm = page.locator('button[data-act="remove"]').first();
    if (await rm.count()) {
      await rm.click();
      await page.waitForTimeout(400);
    }
    await shot(page, "console_06_pedido_removido_1440.png", {
      route: "/console/",
      viewport: desktop.name,
      scenario: "pedido_removido_preservado",
    });

    // pause rider
    const pause = page.locator("button[data-pause]").first();
    if (await pause.count()) {
      await pause.click();
      await page.waitForTimeout(300);
    }
    await shot(page, "console_08_motoboy_pausa_1440.png", {
      route: "/console/",
      viewport: desktop.name,
      scenario: "motoboy_pausa",
    });

    // support
    await page.evaluate(async () => {
      await fetch("/api/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "SetRiderSupport",
          command_id: "sup1",
          occurred_at: new Date().toISOString(),
          unit_id: "demo-unit",
          rider_id: "rid-demo",
          support: true,
          actor: { actor_id: "rid-demo", role: "motoboy_interno" },
        }),
      });
    });
    await page.reload({ waitUntil: "networkidle" });
    await shot(page, "console_09_motoboy_apoio_1440.png", {
      route: "/console/",
      viewport: desktop.name,
      scenario: "motoboy_apoio_expedicao",
    });

    // return
    const ret = page.locator('button[data-act="return"]').first();
    if (await ret.count()) {
      await ret.click();
      await page.waitForTimeout(400);
    }
    await shot(page, "console_12_retornando_1440.png", {
      route: "/console/",
      viewport: desktop.name,
      scenario: "viagem_retornando",
    });

    // occurrence
    await page.click("#btnOcc");
    await page.waitForTimeout(300);
    await shot(page, "console_16_ocorrencia_1440.png", {
      route: "/console/",
      viewport: desktop.name,
      scenario: "ocorrencia_aberta",
    });

    // empty filter
    await page.locator('.tabs button[data-filter="pendencias"]').click();
    await page.waitForTimeout(200);
    await shot(page, "console_19_vazio_filtro_1440.png", {
      route: "/console/",
      viewport: desktop.name,
      scenario: "estado_vazio_ou_sem_pendencias",
    });

    // role motoboy
    await page.selectOption("#role", "motoboy_interno");
    await page.waitForTimeout(200);
    await shot(page, "console_23_papel_motoboy_1440.png", {
      route: "/console/",
      viewport: desktop.name,
      scenario: "papel_motoboy_selecionado",
    });

    // multi viewport console
    for (const vp of VIEWPORTS) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(`${BASE}/console/`, { waitUntil: "networkidle" });
      await shot(page, `console_resp_${vp.name}.png`, {
        route: "/console/",
        viewport: vp.name,
        scenario: "responsivo_console",
      });
    }

    // —— Mobile ——
    const mob = VIEWPORTS[3];
    await page.setViewportSize({ width: mob.width, height: mob.height });
    await page.goto(`${BASE}/rider-mobile/`, { waitUntil: "networkidle" });
    await shot(page, "mobile_01_viagem_390.png", {
      route: "/rider-mobile/",
      viewport: mob.name,
      scenario: "viagem_atribuida_ou_vazia",
    });

    // ensure trip exists via API then refresh
    await page.evaluate(async () => {
      const now = new Date().toISOString();
      await fetch("/api/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "CreateTrip",
          command_id: "m1",
          occurred_at: now,
          unit_id: "demo-unit",
          trip_id: "T-MOB",
          courier_actor_id: "rid-demo",
          deliveries: [
            { delivery_id: "DM1", order_ref: "P-201" },
            { delivery_id: "DM2", order_ref: "P-202" },
          ],
          actor: { actor_id: "ops-demo", role: "operador_expedicao" },
        }),
      });
    });
    await page.reload({ waitUntil: "networkidle" });
    await shot(page, "mobile_02_preparacao_390.png", {
      route: "/rider-mobile/",
      viewport: mob.name,
      scenario: "preparando_saida",
    });

    page.on("dialog", async (d) => {
      try {
        await d.accept();
      } catch {
        /* already handled */
      }
    });
    await page.click("#btnDepart");
    await page.waitForTimeout(500);
    await shot(page, "mobile_03_saida_390.png", {
      route: "/rider-mobile/",
      viewport: mob.name,
      scenario: "apos_confirmar_saida",
    });

    await shot(page, "mobile_04_parada_atual_390.png", {
      route: "/rider-mobile/",
      viewport: mob.name,
      scenario: "parada_atual",
    });

    await page.click("#btnNav");
    await page.waitForTimeout(300);
    await shot(page, "mobile_05_nav_externa_contexto_390.png", {
      route: "/rider-mobile/",
      viewport: mob.name,
      scenario: "apos_abrir_rota_externa",
    });

    await page.click("#btnArrive");
    await page.waitForTimeout(400);
    await shot(page, "mobile_08_chegada_390.png", {
      route: "/rider-mobile/",
      viewport: mob.name,
      scenario: "cheguei",
    });

    await page.click("#btnConfirm");
    await page.waitForTimeout(400);
    await shot(page, "mobile_09_entrega_confirmada_390.png", {
      route: "/rider-mobile/",
      viewport: mob.name,
      scenario: "entrega_confirmada",
    });

    await page.click("#btnProblem");
    await page.waitForTimeout(400);
    await shot(page, "mobile_11_problema_390.png", {
      route: "/rider-mobile/",
      viewport: mob.name,
      scenario: "registrar_problema",
    });

    await page.click("#btnReturn");
    await page.waitForTimeout(400);
    await shot(page, "mobile_13_retorno_390.png", {
      route: "/rider-mobile/",
      viewport: mob.name,
      scenario: "iniciar_retorno",
    });

    // offline
    await page.evaluate(async () => {
      await fetch("/api/connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connection: "offline" }),
      });
    });
    await page.reload({ waitUntil: "networkidle" });
    await shot(page, "mobile_14_offline_390.png", {
      route: "/rider-mobile/",
      viewport: mob.name,
      scenario: "offline",
    });

    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto(`${BASE}/rider-mobile/`, { waitUntil: "networkidle" });
    await shot(page, "mobile_20_360x800.png", {
      route: "/rider-mobile/",
      viewport: "360x800",
      scenario: "tela_pequena",
    });

    // keyboard focus console
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${BASE}/console/`, { waitUntil: "networkidle" });
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await shot(page, "console_a11y_teclado_foco_1440.png", {
      route: "/console/",
      viewport: "1440x900",
      scenario: "teclado_foco",
    });

    // zoom 200%
    await page.evaluate(() => {
      document.body.style.zoom = "200%";
    });
    await shot(page, "console_a11y_zoom200_1440.png", {
      route: "/console/",
      viewport: "1440x900",
      scenario: "zoom_200",
    });
    await page.evaluate(() => {
      document.body.style.zoom = "100%";
    });

    // —— iFood ——
    await page.goto(`${BASE}/ifood-handoff/`, { waitUntil: "networkidle" });
    await shot(page, "ifood_01_inicial_1440.png", {
      route: "/ifood-handoff/",
      viewport: "1440x900",
      scenario: "expedicao_inicial",
    });
    await page.click("#btnStart");
    await page.waitForTimeout(300);
    await shot(page, "ifood_02_iniciado_1440.png", {
      route: "/ifood-handoff/",
      viewport: "1440x900",
      scenario: "handoff_iniciado_aguardando_verify",
    });
    // fail without verify
    await page.uncheck("#verified");
    await page.click("#btnConfirm");
    await page.waitForTimeout(300);
    await shot(page, "ifood_09_sem_verificacao_1440.png", {
      route: "/ifood-handoff/",
      viewport: "1440x900",
      scenario: "recusa_sem_courier_verified",
    });
    // fail volumes
    await page.check("#verified");
    await page.fill("#volDel", "1");
    await page.fill("#volExp", "3");
    await page.click("#btnConfirm");
    await page.waitForTimeout(300);
    await shot(page, "ifood_04_volumes_incompletos_1440.png", {
      route: "/ifood-handoff/",
      viewport: "1440x900",
      scenario: "recusa_volumes_incompletos",
    });
    await page.fill("#volDel", "3");
    await page.click("#btnConfirm");
    await page.waitForTimeout(300);
    await shot(page, "ifood_07_confirmado_1440.png", {
      route: "/ifood-handoff/",
      viewport: "1440x900",
      scenario: "handoff_confirmado",
    });

    // —— map poc ——
    await page.goto(`${BASE}/map-poc/`, { waitUntil: "networkidle" });
    await shot(page, "mapa_01_inicial_1440.png", {
      route: "/map-poc/",
      viewport: "1440x900",
      scenario: "mapa_inicial",
    });
    await page.click("#btnReady");
    await page.waitForTimeout(2500);
    await shot(page, "mapa_02_disponivel_1440.png", {
      route: "/map-poc/",
      viewport: "1440x900",
      scenario: "mapa_tiles_demo",
    });
    await page.click("#btnRoute");
    await page.waitForTimeout(800);
    await shot(page, "mapa_03_rota_simulada_1440.png", {
      route: "/map-poc/",
      viewport: "1440x900",
      scenario: "rota_simulada_identificada",
    });
    await page.click("#btnNoLoc");
    await page.waitForTimeout(200);
    await shot(page, "mapa_04_sem_localizacao_1440.png", {
      route: "/map-poc/",
      viewport: "1440x900",
      scenario: "localizacao_indisponivel",
    });
    await page.click("#btnDenied");
    await page.waitForTimeout(200);
    await shot(page, "mapa_05_permissao_negada_1440.png", {
      route: "/map-poc/",
      viewport: "1440x900",
      scenario: "permissao_negada",
    });
    await page.click("#btnOffline");
    await page.waitForTimeout(200);
    await shot(page, "mapa_06_offline_1440.png", {
      route: "/map-poc/",
      viewport: "1440x900",
      scenario: "tiles_offline",
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${BASE}/map-poc/`, { waitUntil: "networkidle" });
    await page.click("#btnReady");
    await page.waitForTimeout(2000);
    await shot(page, "mapa_mobile_390.png", {
      route: "/map-poc/",
      viewport: "390x844",
      scenario: "mapa_mobile",
    });

    // deep links
    for (const route of [
      "/console/",
      "/rider-mobile/",
      "/ifood-handoff/",
      "/map-poc/",
    ]) {
      const res = await page.goto(`${BASE}${route}`, {
        waitUntil: "networkidle",
      });
      if (!res || res.status() >= 400) {
        findings.push({ type: "deeplink", route, status: res?.status() });
      }
    }

    await context.close();
  } finally {
    await browser.close();
    srv.kill();
  }

  writeFileSync(
    join(OUT, "INDEX.json"),
    JSON.stringify({ commit: COMMIT, date: DATE, captures: index }, null, 2),
  );
  writeFileSync(
    join(OUT, "CONSOLE_ERRORS.json"),
    JSON.stringify(consoleErrors, null, 2),
  );
  writeFileSync(
    join(OUT, "NETWORK_FAILS.json"),
    JSON.stringify(networkFails, null, 2),
  );
  writeFileSync(
    join(OUT, "FINDINGS.json"),
    JSON.stringify(findings, null, 2),
  );

  console.log("\n=== SUMMARY ===");
  console.log("captures", index.length);
  console.log("console_errors", consoleErrors.length);
  console.log("network_fails", networkFails.length);
  console.log("OUT", OUT);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
