/**
 * Capturas da Expedição iFood reconstruída (antes/depois + estados)
 */
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";

const ROOT = process.cwd();
const OUT = join(ROOT, "docs/entregas/ux/capturas-ifood-final");
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
  index.push({ file, scenario, commit: COMMIT, route: "/ifood-handoff/" });
  console.log("  CAP", file, scenario);
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
    const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
    await page.goto(`${BASE}/ifood-handoff/`, { waitUntil: "networkidle" });
    await page.waitForSelector(".home-count, .empty-focus, .title-sov");
    // Home: aviso temporário (novo) + ação no mais antigo (FIFO)
    await shot(page, "01_home_fifo_e_aviso.png", "home_fifo_aviso_temporario");

    await page.click("#btnDemoEmpty");
    await page.waitForTimeout(250);
    await shot(page, "02_home_sem_prontos.png", "home_vazio");

    await page.click("#btnDemoReset");
    await page.waitForTimeout(200);
    await page.click("#btnDemoReady");
    await page.waitForTimeout(350);
    await shot(page, "03_home_novo_pronto_temporario.png", "aviso_novo_pedido");

    await page.click("#btnDemoReset");
    await page.waitForTimeout(250);
    // Buscar = pedido mais antigo da fila (8635)
    await page.click('button[data-act=fetch]');
    await page.waitForTimeout(400);
    await shot(page, "04_em_maos_aguardando.png", "pedido_em_maos");

    if (await page.locator('button[data-act="rider-here"]').count()) {
      await page.click('button[data-act="rider-here"]');
      await page.waitForTimeout(250);
      // botão deve estar disabled de verdade
      const disabled = await page.locator("#btnDeliver").isDisabled();
      if (!disabled) console.error("FAIL: btnDeliver deveria estar disabled");
      await shot(page, "05_conferencia_bloqueada.png", "conferencia_acessivel_bloqueada");
      // checkboxes reais for=
      await page.check("#chkBags");
      await page.check("#chkName");
      await page.check("#chkIfood");
      await page.waitForTimeout(150);
      const enabled = !(await page.locator("#btnDeliver").isDisabled());
      if (!enabled) console.error("FAIL: btnDeliver deveria habilitar");
      await shot(page, "06_conferencia_pronta.png", "conferencia_habilitada");
      await page.click("#btnDeliver");
      await page.waitForTimeout(400);
      await shot(page, "07_conclusao.png", "expedicao_concluida");
    }

    // nome indisponível: 8638
    await page.click("#btnDemoReset");
    await page.waitForTimeout(200);
    await page.click('button[data-id="o-8638"]').catch(async () => {
      await page.locator("text=#8638").first().click();
    });
    await page.waitForTimeout(200);
    if (await page.locator('button[data-act=fetch]').count()) {
      await page.click('button[data-act=fetch]');
      await page.waitForTimeout(300);
      await page.click('button[data-act="rider-here"]');
      await page.waitForTimeout(200);
      await shot(page, "08_nome_indisponivel.png", "entregador_sem_nome");
    }

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.click("#btnDemoReset");
    await page.waitForTimeout(250);
    await shot(page, "09_home_desktop.png", "home_desktop");

    writeFileSync(join(OUT, "INDEX.json"), JSON.stringify(index, null, 2));
    console.log("\nOK", index.length, "→", OUT);
  } finally {
    await browser.close();
    srv.kill();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
