/**
 * Auditoria visual — redesign ENTREGAS (composições aprovadas)
 * Playwright + Chrome · PNGs reais · sem alterar domínio
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
import { execSync } from "node:child_process";

const ROOT = process.cwd();
const OUT = join(ROOT, "docs/entregas/ux/capturas-redesign");
const BASE = "http://127.0.0.1:5193";
const DATE = new Date().toISOString();
let COMMIT = "unknown";
try {
  COMMIT = execSync("git rev-parse HEAD", { cwd: ROOT }).toString().trim();
} catch {
  /* ignore */
}

if (existsSync(OUT)) rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const index = [];
const consoleErrors = [];
const networkFails = [];

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
      }, 8000);
    });
  });
}

async function api(page, path, opts = {}) {
  return page.evaluate(
    async ({ path, opts }) => {
      const res = await fetch(path, {
        headers: { "Content-Type": "application/json" },
        ...opts,
      });
      return res.json();
    },
    { path, opts },
  );
}

(async () => {
  const srv = await startServer();
  const browser = await chromium.launch({ headless: true });
  try {
    // —— Console idle ——
    {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      page.on("console", (m) => {
        if (m.type() === "error") consoleErrors.push(m.text());
      });
      page.on("pageerror", (e) => consoleErrors.push(String(e)));
      page.on("requestfailed", (r) =>
        networkFails.push({ url: r.url(), err: r.failure()?.errorText }),
      );
      await page.goto(`${BASE}/console/`, { waitUntil: "networkidle" });
      await page.waitForSelector(".demo-banner");
      await shot(page, "01_console_idle_1440.png", {
        route: "/console/",
        viewport: "1440x900",
        scenario: "console_idle_sem_viagem",
      });
      await page.close();
    }

    // —— Console montagem + saída ——
    {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      await page.goto(`${BASE}/console/`, { waitUntil: "networkidle" });
      await page.waitForSelector("#readyList");
      // select first two orders
      const checks = page.locator('#readyList input[type=checkbox]');
      const n = await checks.count();
      for (let i = 0; i < Math.min(2, n); i++) await checks.nth(i).check();
      await page.click("#btnCreateTrip");
      await page.waitForTimeout(400);
      await shot(page, "02_console_montagem_1440.png", {
        route: "/console/",
        viewport: "1440x900",
        scenario: "console_montagem_enderecos",
      });
      await page.click('button[data-act=depart]');
      await page.waitForTimeout(400);
      await shot(page, "03_console_em_rota_sem_gps_1440.png", {
        route: "/console/",
        viewport: "1440x900",
        scenario: "console_em_rota_sequencia_enderecos",
      });
      await page.close();
    }

    // —— Mobile a caminho ——
    {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
      // seed trip via API on console first
      await page.goto(`${BASE}/console/`, { waitUntil: "networkidle" });
      await page.evaluate(async () => {
        const now = () => new Date().toISOString();
        await fetch("/api/command", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "CreateTrip",
            command_id: "aud-1",
            occurred_at: now(),
            unit_id: "demo-unit",
            trip_id: "AUD-T1",
            courier_actor_id: "rid-demo",
            deliveries: [
              { delivery_id: "AUD-D1", order_ref: "P-101" },
              { delivery_id: "AUD-D2", order_ref: "P-102" },
            ],
          }),
        });
        await fetch("/api/command", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "ConfirmTripDeparture",
            command_id: "aud-2",
            occurred_at: now(),
            unit_id: "demo-unit",
            trip_id: "AUD-T1",
            actor: { actor_id: "rid-demo", role: "motoboy_interno" },
          }),
        });
      });
      await page.goto(`${BASE}/rider-mobile/`, { waitUntil: "networkidle" });
      await page.waitForSelector("#btnPrimary");
      await shot(page, "04_mobile_a_caminho_390.png", {
        route: "/rider-mobile/",
        viewport: "390x844",
        scenario: "mobile_a_caminho_abrir_rota",
      });
      // ensure not found hidden
      const nfHidden = await page.locator("#btnNotFound").isHidden();
      if (!nfHidden) {
        consoleErrors.push("FAIL: Cliente não encontrado visível em a caminho");
      }
      // Cheguei
      await page.click("#btnSecondary");
      await page.waitForTimeout(400);
      await shot(page, "05_mobile_chegada_390.png", {
        route: "/rider-mobile/",
        viewport: "390x844",
        scenario: "mobile_chegada_confirmar_entrega",
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
      await page.waitForTimeout(300);
      await shot(page, "06_mobile_offline_390.png", {
        route: "/rider-mobile/",
        viewport: "390x844",
        scenario: "mobile_offline_sync_auto",
      });
      await page.close();
    }

    // —— Expedição iFood ——
    {
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      await page.goto(`${BASE}/ifood-handoff/`, { waitUntil: "networkidle" });
      await page.waitForSelector("#btnConfirm");
      await shot(page, "07_expedicao_bloqueada_1280.png", {
        route: "/ifood-handoff/",
        viewport: "1280x900",
        scenario: "expedicao_liberar_desabilitado",
      });
      const disabled = await page.locator("#btnConfirm").isDisabled();
      if (!disabled) consoleErrors.push("FAIL: Liberar pedido deveria estar desabilitado");
      await page.click("#btnStart");
      await page.waitForTimeout(300);
      await page.check("#orderOk");
      await page.check("#verified");
      await page.selectOption("#method", "codigo_app_plataforma");
      await page.fill("#volDel", "2");
      await page.check("#physicalOk");
      await page.waitForTimeout(200);
      await shot(page, "08_expedicao_pronta_1280.png", {
        route: "/ifood-handoff/",
        viewport: "1280x900",
        scenario: "expedicao_pronta_para_liberar",
      });
      await page.click("#btnConfirm");
      await page.waitForTimeout(400);
      await shot(page, "09_expedicao_concluida_1280.png", {
        route: "/ifood-handoff/",
        viewport: "1280x900",
        scenario: "expedicao_copy_concluida",
      });
      await page.close();
    }

    // —— Map POC experimental ——
    {
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
      await page.goto(`${BASE}/map-poc/`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForTimeout(1500);
      await shot(page, "10_maplibre_experimental_1280.png", {
        route: "/map-poc/",
        viewport: "1280x800",
        scenario: "maplibre_experimental",
      });
      await page.close();
    }

    // —— Responsividade console ——
    for (const vp of [
      { w: 768, h: 1024, name: "768" },
      { w: 360, h: 800, name: "360" },
    ]) {
      const page = await browser.newPage({ viewport: { width: vp.w, height: vp.h } });
      await page.goto(`${BASE}/console/`, { waitUntil: "networkidle" });
      await shot(page, `11_console_resp_${vp.name}.png`, {
        route: "/console/",
        viewport: `${vp.w}x${vp.h}`,
        scenario: "console_responsivo",
      });
      await page.close();
    }

    writeFileSync(join(OUT, "INDEX.json"), JSON.stringify(index, null, 2));
    writeFileSync(
      join(OUT, "ERROS.json"),
      JSON.stringify({ consoleErrors, networkFails }, null, 2),
    );
    console.log("\nCapturas:", index.length, "→", OUT);
    if (consoleErrors.length) {
      console.log("Console errors:", consoleErrors);
    }
  } finally {
    await browser.close();
    srv.kill();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
