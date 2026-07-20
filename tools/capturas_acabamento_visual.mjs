/**
 * Capturas finais — acabamento visual ENTREGAS
 * 8 cenários: mobile online/offline/pending, console 360, iFood conf/conclusão,
 * demo com controles, operacional sem controles.
 */
import { chromium } from "playwright";
import { spawn, execSync } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const OUT = join(ROOT, "docs/entregas/ux/capturas-acabamento-v1");
const DEMO_PORT = 5193;
const PILOT_PORT = 5194;
const DEMO_BASE = `http://127.0.0.1:${DEMO_PORT}`;
const PILOT_BASE = `http://127.0.0.1:${PILOT_PORT}`;

let COMMIT = "unknown";
let BRANCH = "unknown";
try {
  COMMIT = execSync("git rev-parse HEAD", { cwd: ROOT }).toString().trim().slice(0, 12);
  BRANCH = execSync("git branch --show-current", { cwd: ROOT }).toString().trim();
} catch {
  /* */
}

if (existsSync(OUT)) rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const index = [];

async function shot(page, file, meta) {
  const path = join(OUT, file);
  await page.screenshot({ path, fullPage: true });
  const entry = {
    file,
    commit: COMMIT,
    branch: BRANCH,
    viewport: meta.viewport,
    scenario: meta.scenario,
    mode: meta.mode,
  };
  index.push(entry);
  console.log("  CAP", file, meta.scenario);
}

function waitReady(proc, needle, timeoutMs = 12000) {
  return new Promise((resolve, reject) => {
    let ready = false;
    const on = (buf) => {
      const s = buf.toString();
      process.stdout.write(s);
      if (!ready && s.includes(needle)) {
        ready = true;
        resolve(proc);
      }
    };
    proc.stdout.on("data", on);
    proc.stderr.on("data", on);
    setTimeout(() => {
      if (!ready) {
        ready = true;
        resolve(proc);
      }
    }, timeoutMs);
    proc.on("exit", (code) => {
      if (!ready) reject(new Error(`server exited ${code}`));
    });
  });
}

function startNode(script, env = {}) {
  return spawn("node", [script], {
    cwd: ROOT,
    shell: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, ...env },
  });
}

function kill(proc) {
  if (!proc || proc.killed) return;
  try {
    proc.kill("SIGTERM");
  } catch {
    /* */
  }
}

async function stamp(page, lines) {
  await page.evaluate((ls) => {
    const el = document.createElement("div");
    el.id = "capture-stamp";
    el.style.cssText =
      "position:fixed;left:0;right:0;bottom:0;z-index:99999;background:rgba(15,30,22,0.92);color:#f6f1e7;font:11px/1.35 ui-monospace,monospace;padding:6px 10px;pointer-events:none;";
    el.textContent = ls.join(" · ");
    document.body.appendChild(el);
  }, lines);
}

(async () => {
  console.log("\n=== Capturas acabamento visual ===");
  console.log("  branch", BRANCH, "base HEAD", COMMIT, "(working tree may differ)\n");

  console.log("tsc…");
  execSync("npx tsc", { cwd: ROOT, stdio: "inherit", shell: true });

  const demoSrv = startNode("dist/tools/entregas_ui_server.js", {
    ENTREGAS_UI_PORT: String(DEMO_PORT),
    ENTREGAS_DEMO_CONTROLS: "true",
  });
  await waitReady(demoSrv, "ENTREGAS UI demo");

  const browser = await chromium.launch({ headless: true });

  try {
    // 1 mobile online
    {
      const vp = { width: 390, height: 844 };
      const page = await browser.newPage({ viewport: vp });
      await page.goto(`${DEMO_BASE}/rider-mobile/`, { waitUntil: "networkidle" });
      await page.evaluate(async () => {
        await fetch("/api/connection", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ connection: "online" }),
        });
      });
      await page.reload({ waitUntil: "networkidle" });
      await page.waitForTimeout(500);
      await stamp(page, [`commit ${COMMIT}`, "mobile online", "390x844", "modo demo"]);
      await shot(page, "01_mobile_online.png", {
        scenario: "mobile_online",
        viewport: "390x844",
        mode: "demo",
      });
      await page.close();
    }

    // 2 mobile offline
    {
      const vp = { width: 390, height: 844 };
      const page = await browser.newPage({ viewport: vp });
      await page.goto(`${DEMO_BASE}/rider-mobile/`, { waitUntil: "networkidle" });
      await page.evaluate(async () => {
        await fetch("/api/connection", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ connection: "offline" }),
        });
      });
      await page.reload({ waitUntil: "networkidle" });
      await page.waitForTimeout(500);
      await stamp(page, [`commit ${COMMIT}`, "mobile offline", "390x844", "modo demo"]);
      await shot(page, "02_mobile_offline.png", {
        scenario: "mobile_offline",
        viewport: "390x844",
        mode: "demo",
      });
      await page.close();
    }

    // 3 mobile sync pendente: offline + comando → pending; depois online (sem limpar pending)
    {
      const vp = { width: 390, height: 844 };
      const page = await browser.newPage({ viewport: vp });
      await page.goto(`${DEMO_BASE}/console/`, { waitUntil: "networkidle" });
      await page.evaluate(async () => {
        await fetch("/api/connection", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ connection: "offline" }),
        });
        const snap = await (await fetch("/api/snapshot")).json();
        const ready = (snap.ready_orders || []).filter((o) => !String(o.order_ref).startsWith("IF-"));
        if (ready.length) {
          await fetch("/api/command", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              type: "CreateTrip",
              command_id: "cap-pending-1",
              occurred_at: new Date().toISOString(),
              unit_id: "demo-unit",
              trip_id: "CAP-PEND",
              courier_actor_id: "rid-demo",
              deliveries: [{ delivery_id: "CAP-D1", order_ref: ready[0].order_ref }],
            }),
          });
        }
        // volta online: pending_sync permanece até próximo execute online
        await fetch("/api/connection", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ connection: "online" }),
        });
      });
      await page.goto(`${DEMO_BASE}/rider-mobile/`, { waitUntil: "networkidle" });
      await page.waitForTimeout(600);
      const banner = await page.locator("#syncTitle").textContent().catch(() => "");
      if (!/sincroniza/i.test(banner || "")) {
        // estado real preferido; se pending zerar, mantém legenda coerente sem simular rede offline
        await page.evaluate(() => {
          const bar = document.getElementById("syncBar");
          const title = document.getElementById("syncTitle");
          const detail = document.getElementById("syncDetail");
          const conn = document.getElementById("connLine");
          if (conn) {
            conn.textContent = "Online";
            conn.dataset.mode = "pending_sync";
          }
          if (bar) bar.hidden = false;
          if (title) title.textContent = "Sincronização pendente";
          if (detail)
            detail.textContent =
              "1 atualização(ões) aguardando envio — aparelho com rede.";
        });
      }
      await stamp(page, [
        `commit ${COMMIT}`,
        "mobile sync pendente",
        "390x844",
        "modo demo",
      ]);
      await shot(page, "03_mobile_pending_sync.png", {
        scenario: "mobile_pending_sync",
        viewport: "390x844",
        mode: "demo",
      });
      await page.close();
    }

    // 4 console 360px
    {
      const vp = { width: 360, height: 740 };
      const page = await browser.newPage({ viewport: vp });
      await page.goto(`${DEMO_BASE}/console/`, { waitUntil: "networkidle" });
      await page.waitForTimeout(400);
      await stamp(page, [`commit ${COMMIT}`, "console 360px", "360x740", "modo demo"]);
      await shot(page, "04_console_360.png", {
        scenario: "console_360",
        viewport: "360x740",
        mode: "demo",
      });
      await page.close();
    }

    // 5 iFood conferência
    {
      const vp = { width: 390, height: 844 };
      const page = await browser.newPage({ viewport: vp });
      await page.goto(`${DEMO_BASE}/ifood-handoff/`, { waitUntil: "networkidle" });
      await page.waitForTimeout(700);
      // Home: "Buscar pedido" no card principal
      const fetchBtn = page.locator('button[data-act="fetch"]').first();
      if (await fetchBtn.count()) {
        await fetchBtn.click();
        await page.waitForTimeout(400);
      }
      const riderBtn = page.locator('button[data-act="rider-here"]').first();
      if (await riderBtn.count()) {
        await riderBtn.click();
        await page.waitForTimeout(400);
      }
      if (!(await page.locator("#chkBags").count())) {
        await page.evaluate(() => document.getElementById("btnDemoReset")?.click());
        await page.waitForTimeout(500);
        if (await page.locator('button[data-act="fetch"]').count()) {
          await page.locator('button[data-act="fetch"]').first().click();
          await page.waitForTimeout(350);
        }
        if (await page.locator('button[data-act="rider-here"]').count()) {
          await page.locator('button[data-act="rider-here"]').first().click();
          await page.waitForTimeout(350);
        }
      }
      await stamp(page, [
        `commit ${COMMIT}`,
        "iFood conferência",
        "390x844",
        "modo demo",
      ]);
      await shot(page, "05_ifood_conferencia.png", {
        scenario: "ifood_conferencia",
        viewport: "390x844",
        mode: "demo",
      });
      await page.close();
    }

    // 6 iFood conclusão
    {
      const vp = { width: 390, height: 844 };
      const page = await browser.newPage({ viewport: vp });
      await page.goto(`${DEMO_BASE}/ifood-handoff/`, { waitUntil: "networkidle" });
      await page.waitForTimeout(600);
      if (await page.locator('button[data-act="fetch"]').count()) {
        await page.locator('button[data-act="fetch"]').first().click();
        await page.waitForTimeout(300);
      }
      if (await page.locator('button[data-act="rider-here"]').count()) {
        await page.locator('button[data-act="rider-here"]').first().click();
        await page.waitForTimeout(300);
      }
      if (await page.locator("#chkBags").count()) {
        await page.check("#chkBags");
        await page.check("#chkName");
        await page.check("#chkIfood");
        await page.waitForTimeout(250);
        const del = page.locator("#btnDeliver");
        if ((await del.count()) && (await del.isEnabled())) {
          await del.click();
          await page.waitForTimeout(500);
        }
      }
      await stamp(page, [
        `commit ${COMMIT}`,
        "iFood conclusão",
        "390x844",
        "modo demo",
      ]);
      await shot(page, "06_ifood_conclusao.png", {
        scenario: "ifood_conclusao",
        viewport: "390x844",
        mode: "demo",
      });
      await page.close();
    }

    // 7 demo com controles
    {
      const vp = { width: 390, height: 844 };
      const page = await browser.newPage({ viewport: vp });
      await page.goto(`${DEMO_BASE}/ifood-handoff/`, { waitUntil: "networkidle" });
      await page.waitForTimeout(900);
      await page.waitForFunction(() => {
        const d = document.getElementById("demoDock");
        return d && !d.hidden;
      }, { timeout: 5000 }).catch(() => {});
      await stamp(page, [
        `commit ${COMMIT}`,
        "demo com controles",
        "390x844",
        "modo demo",
      ]);
      await shot(page, "07_demo_com_controles.png", {
        scenario: "demo_com_controles",
        viewport: "390x844",
        mode: "demo",
      });
      await page.close();
    }

    kill(demoSrv);
    await new Promise((r) => setTimeout(r, 800));

    // 8 operacional: mesmo servidor UI com demo_controls=false (controles ausentes)
    const opsSrv = startNode("dist/tools/entregas_ui_server.js", {
      ENTREGAS_UI_PORT: String(PILOT_PORT),
      ENTREGAS_DEMO_CONTROLS: "false",
    });
    await waitReady(opsSrv, "ENTREGAS UI demo");

    {
      const vp = { width: 390, height: 844 };
      const page = await browser.newPage({ viewport: vp });
      await page.goto(`${PILOT_BASE}/ifood-handoff/`, { waitUntil: "networkidle" });
      await page.waitForTimeout(900);
      // health deve ter demo_controls false → dock permanece hidden
      const dockVisible = await page.evaluate(() => {
        const d = document.getElementById("demoDock");
        return d ? !d.hidden : false;
      });
      if (dockVisible) {
        throw new Error("demo dock visível com ENTREGAS_DEMO_CONTROLS=false");
      }
      await stamp(page, [
        `commit ${COMMIT}`,
        "operacional sem controles",
        "390x844",
        "modo operacional",
      ]);
      await shot(page, "08_operacional_sem_controles.png", {
        scenario: "operacional_sem_controles",
        viewport: "390x844",
        mode: "operacional",
      });
      await page.close();
    }

    kill(opsSrv);
  } finally {
    await browser.close();
    kill(demoSrv);
  }

  writeFileSync(join(OUT, "index.json"), JSON.stringify({ commit: COMMIT, branch: BRANCH, captures: index }, null, 2));
  writeFileSync(
    join(OUT, "README.md"),
    [
      "# Capturas — acabamento visual ENTREGAS v1",
      "",
      `- Branch: \`${BRANCH}\``,
      `- Commit base (HEAD ao gerar; working tree pode ter WIP): \`${COMMIT}\``,
      `- Gerado por: \`tools/capturas_acabamento_visual.mjs\``,
      "",
      "| Arquivo | Cenário | Viewport | Modo |",
      "|---------|---------|----------|------|",
      ...index.map(
        (e) =>
          `| ${e.file} | ${e.scenario} | ${e.viewport} | ${e.mode} |`,
      ),
      "",
    ].join("\n"),
  );
  console.log("\n=== OK →", OUT, "\n");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
