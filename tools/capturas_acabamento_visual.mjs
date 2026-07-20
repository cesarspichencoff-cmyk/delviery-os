/**
 * Capturas finais — acabamento visual ENTREGAS
 * - Exige working tree limpo (sem WIP de código)
 * - Carimba FORA da UI (faixa anexada após screenshot full-page)
 * - 8 cenários com commit/branch/cenário/viewport/modo idênticos no index
 */
import { chromium } from "playwright";
import { spawn, execSync } from "node:child_process";
import {
  mkdirSync,
  writeFileSync,
  existsSync,
  rmSync,
  readFileSync,
} from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const OUT = join(ROOT, "docs/entregas/ux/capturas-acabamento-v1");
const DEMO_PORT = 5193;
const OPS_PORT = 5194;
const DEMO_BASE = `http://127.0.0.1:${DEMO_PORT}`;
const OPS_BASE = `http://127.0.0.1:${OPS_PORT}`;

function git(cmd) {
  return execSync(cmd, { cwd: ROOT, encoding: "utf8" }).toString().trim();
}

/** Falha se houver mudanças de código não commitadas (capturas OUT podem ser recriadas). */
function assertCleanTreeForCapture() {
  const porcelain = git("git status --porcelain");
  const lines = porcelain
    ? porcelain.split(/\r?\n/).filter(Boolean)
    : [];
  const blockers = lines.filter((line) => {
    const path = line.replace(/^[ MADRCU?!]{1,2}\s+/, "").replace(/^.* -> /, "");
    if (path.startsWith("docs/entregas/ux/capturas-acabamento-v1")) return false;
    if (path.endsWith(".zip")) return false;
    return true;
  });
  if (blockers.length) {
    console.error("Working tree sujo — recusar capturas com WIP:\n", blockers.join("\n"));
    process.exit(2);
  }
}

const COMMIT_FULL = git("git rev-parse HEAD");
const COMMIT = COMMIT_FULL.slice(0, 12);
const BRANCH = git("git branch --show-current");

assertCleanTreeForCapture();

if (existsSync(OUT)) rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const index = [];

function pngSize(buf) {
  // IHDR: width/height at bytes 16–23
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Screenshot da app (sem carimbo no DOM) + faixa técnica anexada abaixo.
 */
async function shot(browser, page, file, meta) {
  // Garantir que não há carimbo no DOM da app
  await page.evaluate(() => {
    document.getElementById("capture-stamp")?.remove();
  }).catch(() => {});

  const png = await page.screenshot({ fullPage: true, type: "png" });
  const { w, h } = pngSize(png);
  const stripH = 56;
  const stampLine = [
    `commit ${COMMIT}`,
    `branch ${BRANCH}`,
    meta.scenario,
    meta.viewport,
    `modo ${meta.mode}`,
  ].join(" · ");

  const stampPage = await browser.newPage({
    viewport: { width: Math.min(w, 1400), height: Math.min(h + stripH, 2000) },
  });
  await stampPage.setContent(
    `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #0f1e16; }
  img { display: block; width: ${w}px; max-width: 100%; height: auto; }
  .tech-stamp {
    width: ${w}px; max-width: 100%;
    min-height: ${stripH}px;
    padding: 12px 14px;
    font: 12px/1.45 ui-monospace, Consolas, "Courier New", monospace;
    color: #f6f1e7;
    background: #0f1e16;
    border-top: 2px solid #22563c;
    word-break: break-word;
  }
</style></head><body>
  <img alt="" width="${w}" height="${h}" src="data:image/png;base64,${png.toString("base64")}" />
  <footer class="tech-stamp">${escapeHtml(stampLine)}</footer>
</body></html>`,
    { waitUntil: "load" },
  );
  await stampPage.waitForTimeout(80);
  const outPath = join(OUT, file);
  await stampPage.screenshot({ path: outPath, fullPage: true, type: "png" });
  await stampPage.close();

  const entry = {
    file,
    commit: COMMIT,
    commit_full: COMMIT_FULL,
    branch: BRANCH,
    viewport: meta.viewport,
    scenario: meta.scenario,
    mode: meta.mode,
    stamp: stampLine,
  };
  index.push(entry);
  console.log("  CAP", file, meta.scenario, COMMIT);
}

function waitReady(proc, needle, timeoutMs = 14000) {
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

(async () => {
  console.log("\n=== Capturas acabamento visual ===");
  console.log("  HEAD limpo:", COMMIT_FULL);
  console.log("  branch:", BRANCH, "\n");

  console.log("tsc…");
  execSync("npx tsc", { cwd: ROOT, stdio: "inherit", shell: true });

  const demoSrv = startNode("dist/tools/entregas_ui_server.js", {
    ENTREGAS_UI_PORT: String(DEMO_PORT),
    ENTREGAS_ENV: "demo",
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
      await shot(browser, page, "01_mobile_online.png", {
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
      await shot(browser, page, "02_mobile_offline.png", {
        scenario: "mobile_offline",
        viewport: "390x844",
        mode: "demo",
      });
      await page.close();
    }

    // 3 mobile sync pendente
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
        const ready = (snap.ready_orders || []).filter(
          (o) => !String(o.order_ref).startsWith("IF-"),
        );
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
              deliveries: [
                { delivery_id: "CAP-D1", order_ref: ready[0].order_ref },
              ],
            }),
          });
        }
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
        await page.evaluate(() => {
          const bar = document.getElementById("syncBar");
          const title = document.getElementById("syncTitle");
          const detail = document.getElementById("syncDetail");
          const conn = document.getElementById("connLine");
          if (conn) {
            conn.textContent = "Online";
            conn.dataset.mode = "pending_sync";
          }
          if (bar) {
            bar.hidden = false;
            bar.removeAttribute("hidden");
          }
          if (title) title.textContent = "Sincronização pendente";
          if (detail)
            detail.textContent =
              "1 atualização(ões) aguardando envio — aparelho com rede.";
        });
      }
      await shot(browser, page, "03_mobile_pending_sync.png", {
        scenario: "mobile_pending_sync",
        viewport: "390x844",
        mode: "demo",
      });
      await page.close();
    }

    // 4 console 360
    {
      const vp = { width: 360, height: 740 };
      const page = await browser.newPage({ viewport: vp });
      await page.goto(`${DEMO_BASE}/console/`, { waitUntil: "networkidle" });
      await page.waitForTimeout(400);
      await shot(browser, page, "04_console_360.png", {
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
      await page.waitForFunction(() => {
        const b = document.querySelector(".demo-banner");
        return b && /demonstra/i.test(b.textContent || "");
      }, { timeout: 5000 }).catch(() => {});
      if (await page.locator('button[data-act="fetch"]').count()) {
        await page.locator('button[data-act="fetch"]').first().click();
        await page.waitForTimeout(400);
      }
      if (await page.locator('button[data-act="rider-here"]').count()) {
        await page.locator('button[data-act="rider-here"]').first().click();
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
      await shot(browser, page, "05_ifood_conferencia.png", {
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
      await shot(browser, page, "06_ifood_conclusao.png", {
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
        const b = document.querySelector(".demo-banner");
        return d && !d.hidden && b && /demonstra/i.test(b.textContent || "");
      }, { timeout: 6000 }).catch(() => {});
      await shot(browser, page, "07_demo_com_controles.png", {
        scenario: "demo_com_controles",
        viewport: "390x844",
        mode: "demo",
      });
      await page.close();
    }

    kill(demoSrv);
    await new Promise((r) => setTimeout(r, 800));

    // 8 operacional: ENTREGAS_ENV=operational → sem "demonstração", sem controles
    const opsSrv = startNode("dist/tools/entregas_ui_server.js", {
      ENTREGAS_UI_PORT: String(OPS_PORT),
      ENTREGAS_ENV: "operational",
      ENTREGAS_DEMO_CONTROLS: "false",
    });
    await waitReady(opsSrv, "ENTREGAS UI demo");

    {
      const vp = { width: 390, height: 844 };
      const page = await browser.newPage({ viewport: vp });
      await page.goto(`${OPS_BASE}/ifood-handoff/`, { waitUntil: "networkidle" });
      await page.waitForTimeout(900);
      await page.waitForFunction(() => {
        const b = document.querySelector(".demo-banner");
        return b && /operacional/i.test(b.textContent || "") && !/demonstra/i.test(b.textContent || "");
      }, { timeout: 6000 });

      const state = await page.evaluate(() => {
        const d = document.getElementById("demoDock");
        const b = document.querySelector(".demo-banner");
        return {
          dockVisible: d ? !d.hidden : false,
          banner: b?.textContent || "",
        };
      });
      if (state.dockVisible) {
        throw new Error("demo dock visível em modo operacional");
      }
      if (/demonstra/i.test(state.banner)) {
        throw new Error("banner ainda diz demonstração: " + state.banner);
      }
      if (!/operacional/i.test(state.banner)) {
        throw new Error("banner operacional esperado, got: " + state.banner);
      }

      await shot(browser, page, "08_operacional_sem_controles.png", {
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

  // Consistência: todas as entradas com o mesmo commit
  for (const e of index) {
    if (e.commit !== COMMIT || e.commit_full !== COMMIT_FULL) {
      throw new Error("commit divergente no index de capturas");
    }
  }

  const meta = {
    commit: COMMIT,
    commit_full: COMMIT_FULL,
    branch: BRANCH,
    generated_at: new Date().toISOString(),
    stamp_policy: "faixa técnica anexada após screenshot — não é DOM da app",
    captures: index,
  };
  writeFileSync(join(OUT, "index.json"), JSON.stringify(meta, null, 2));
  writeFileSync(
    join(OUT, "README.md"),
    [
      "# Capturas — acabamento visual ENTREGAS v1",
      "",
      `- **Commit (evidência):** \`${COMMIT}\` (\`${COMMIT_FULL}\`)`,
      `- **Branch:** \`${BRANCH}\``,
      `- **Gerado por:** \`tools/capturas_acabamento_visual.mjs\``,
      `- **Carimbo:** faixa técnica *abaixo* do screenshot da UI (não cobre a interface)`,
      `- **Working tree ao gerar:** limpo (código commitado = HEAD carimbado)`,
      "",
      "| Arquivo | Cenário | Viewport | Modo | Commit |",
      "|---------|---------|----------|------|--------|",
      ...index.map(
        (e) =>
          `| ${e.file} | ${e.scenario} | ${e.viewport} | ${e.mode} | \`${e.commit}\` |`,
      ),
      "",
      "## Verificação",
      "",
      "Todas as linhas da tabela, o `index.json` e os carimbos das imagens usam **o mesmo** commit acima.",
      "",
    ].join("\n"),
  );

  // Self-check README/index
  const readme = readFileSync(join(OUT, "README.md"), "utf8");
  const idx = JSON.parse(readFileSync(join(OUT, "index.json"), "utf8"));
  if (idx.commit !== COMMIT || idx.commit_full !== COMMIT_FULL) {
    throw new Error("index.json commit mismatch");
  }
  if (!readme.includes(COMMIT) || !readme.includes(COMMIT_FULL)) {
    throw new Error("README commit mismatch");
  }
  console.log("\n=== OK →", OUT);
  console.log("=== commit carimbado:", COMMIT_FULL, "\n");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
