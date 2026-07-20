/**
 * Capturas — rebalanceamento cromático ENTREGAS
 */
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";

const ROOT = process.cwd();
const OUT = join(ROOT, "docs/entregas/ux/capturas-cromatico");
const BASE = "http://127.0.0.1:5193";
let COMMIT = "unknown";
try {
  COMMIT = execSync("git rev-parse HEAD", { cwd: ROOT }).toString().trim();
} catch {
  /* */
}

if (existsSync(OUT)) rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const index = [];

async function shot(page, file, scenario) {
  const path = join(OUT, file);
  await page.screenshot({ path, fullPage: true });
  index.push({ file, scenario, commit: COMMIT });
  console.log("  CAP", file);
}

function startServer() {
  return new Promise((resolve, reject) => {
    const tsc = spawn("npx", ["tsc"], { cwd: ROOT, shell: true, stdio: "inherit" });
    tsc.on("exit", (code) => {
      if (code !== 0) return reject(new Error("tsc failed"));
      const srv = spawn("node", ["dist/tools/entregas_ui_server.js"], {
        cwd: ROOT,
        shell: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
      let ready = false;
      const on = (buf) => {
        const s = buf.toString();
        process.stdout.write(s);
        if (s.includes("ENTREGAS UI demo") && !ready) {
          ready = true;
          resolve(srv);
        }
      };
      srv.stdout.on("data", on);
      srv.stderr.on("data", on);
      setTimeout(() => {
        if (!ready) {
          ready = true;
          resolve(srv);
        }
      }, 8000);
    });
  });
}

(async () => {
  const srv = await startServer();
  const browser = await chromium.launch({ headless: true });
  try {
    // 1 Console normal
    {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      await page.goto(`${BASE}/console/`, { waitUntil: "networkidle" });
      await page.waitForSelector(".demo-banner");
      await shot(page, "01_console_normal.png", "console_normal");
      // montar viagem
      const checks = page.locator("#readyList input[type=checkbox]");
      const n = await checks.count();
      for (let i = 0; i < Math.min(2, n); i++) await checks.nth(i).check();
      await page.click("#btnCreateTrip");
      await page.waitForTimeout(400);
      await page.click("button[data-act=depart]").catch(() => {});
      await page.waitForTimeout(300);
      // 2 atenção se houver — simular pendência via UI se possível; senão captura em rota
      await shot(page, "02_console_atencao_ou_rota.png", "console_atencao");
      await page.close();
    }

    // Mobile
    {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
      await page.goto(`${BASE}/console/`, { waitUntil: "networkidle" });
      await page.evaluate(async () => {
        const now = () => new Date().toISOString();
        await fetch("/api/command", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "CreateTrip",
            command_id: "ch-1",
            occurred_at: now(),
            unit_id: "demo-unit",
            trip_id: "CH-T1",
            courier_actor_id: "rid-demo",
            deliveries: [
              { delivery_id: "CH-D1", order_ref: "P-101" },
              { delivery_id: "CH-D2", order_ref: "P-102" },
            ],
          }),
        });
        await fetch("/api/command", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "ConfirmTripDeparture",
            command_id: "ch-2",
            occurred_at: now(),
            unit_id: "demo-unit",
            trip_id: "CH-T1",
            actor: { actor_id: "rid-demo", role: "motoboy_interno" },
          }),
        });
      });
      await page.goto(`${BASE}/rider-mobile/`, { waitUntil: "networkidle" });
      await page.waitForSelector("#btnPrimary");
      await shot(page, "03_mobile_a_caminho.png", "mobile_a_caminho");
      await page.click("#btnSecondary");
      await page.waitForTimeout(350);
      await shot(page, "04_mobile_chegada.png", "mobile_chegada");
      await page.evaluate(async () => {
        await fetch("/api/connection", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ connection: "offline" }),
        });
      });
      await page.reload({ waitUntil: "networkidle" });
      await page.waitForTimeout(300);
      await shot(page, "05_mobile_offline.png", "mobile_offline");
      await page.close();
    }

    // iFood
    {
      const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
      await page.goto(`${BASE}/ifood-handoff/`, { waitUntil: "networkidle" });
      await page.waitForSelector(".home-count, .empty-focus");
      await shot(page, "06_ifood_varios.png", "ifood_home");
      await page.click("button[data-act=fetch]");
      await page.waitForTimeout(400);
      await shot(page, "07_ifood_em_maos.png", "ifood_em_maos");
      await page.click('button[data-act="rider-here"]');
      await page.waitForTimeout(250);
      await shot(page, "08_ifood_conferencia.png", "ifood_conferencia");
      await page.check("#chkBags");
      await page.check("#chkName");
      await page.check("#chkIfood");
      await page.waitForTimeout(150);
      await page.click("#btnDeliver");
      await page.waitForTimeout(400);
      await shot(page, "09_ifood_conclusao.png", "ifood_conclusao");
      await page.close();
    }

    // 360
    {
      const page = await browser.newPage({ viewport: { width: 360, height: 800 } });
      await page.goto(`${BASE}/console/`, { waitUntil: "networkidle" });
      await shot(page, "10_console_360.png", "console_360");
      await page.close();
    }

    writeFileSync(join(OUT, "INDEX.json"), JSON.stringify(index, null, 2));
    writeFileSync(
      join(OUT, "COMPARACAO.md"),
      `# Comparação cromática\n\n## ANTES\nExcesso de creme e pouco contraste entre fundo, painéis e cartões.\n\n## DEPOIS\nVerde profundo estrutural (\`--brand-deep\`), branco quente predominante (\`--surface-work\` / elevated), creme só no rail secundário.\n\nCapturas em esta pasta.\n`,
    );
    console.log("OK", index.length, OUT);
  } finally {
    await browser.close();
    srv.kill();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
