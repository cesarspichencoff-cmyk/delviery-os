/**
 * Auditoria visual independente — células operacionais Copiloto V1
 * NÃO altera app/código. Só captura + carimbo externo + evidência DOM.
 * Requer: servidor em http://127.0.0.1:5186/ e playwright disponível.
 */
import { execSync } from "node:child_process";
import {
  mkdirSync,
  writeFileSync,
  existsSync,
  rmSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..", "..");
const OUT = __dirname;
const BASE = process.env.AUDIT_BASE || "http://127.0.0.1:5186";
const COMMIT_EXPECTED = "82d300cc9d2ed49fcd83ba0e2fe7cf773ae5594c";

function git(cmd) {
  return execSync(cmd, { cwd: ROOT, encoding: "utf8" }).trim();
}

const COMMIT_FULL = git("git rev-parse HEAD");
const COMMIT = COMMIT_FULL.slice(0, 7);
const BRANCH = git("git branch --show-current");

if (COMMIT_FULL !== COMMIT_EXPECTED) {
  console.error("HEAD não é o commit auditado:", COMMIT_FULL, "esperado", COMMIT_EXPECTED);
  process.exit(2);
}

const require = createRequire(import.meta.url);
const { chromium: browserApi } = require(
  "C:/Users/italo/Desktop/Claude/deliveryos-entregas-v1/node_modules/playwright",
);

const capDir = join(OUT, "capturas");
if (existsSync(capDir)) rmSync(capDir, { recursive: true, force: true });
mkdirSync(capDir, { recursive: true });

const index = [];
const domLog = [];

function pngSize(buf) {
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function shot(browser, page, file, meta) {
  await page.evaluate(() => {
    document.getElementById("capture-stamp")?.remove();
  }).catch(() => {});

  // Pause replay if possible
  await page.evaluate(() => {
    const bt = document.getElementById("btPlay");
    // if playing, click to pause
    if (bt && /pause|pausar|‖|❚❚/i.test(bt.textContent || bt.getAttribute("aria-label") || "")) {
      bt.click();
    }
  }).catch(() => {});
  await page.waitForTimeout(200);

  const png = await page.screenshot({ fullPage: true, type: "png", timeout: 60000 });
  const { w, h } = pngSize(png);
  const stampLine = [
    `commit ${COMMIT}`,
    `branch ${BRANCH}`,
    meta.scenario,
    meta.viewport,
    meta.replay != null ? `replay≈${meta.replay}` : "replay n/a",
  ].join(" · ");

  const stampPage = await browser.newPage({
    viewport: { width: Math.min(w, 1440), height: 900 },
  });
  await stampPage.setContent(
    `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#0f1e16}
img{display:block;width:${w}px;max-width:100%;height:auto}
.tech-stamp{width:${w}px;max-width:100%;min-height:52px;padding:12px 14px;
  font:12px/1.45 ui-monospace,Consolas,monospace;color:#f6f1e7;background:#0f1e16;
  border-top:2px solid #22563c;word-break:break-word}
</style></head><body>
<img alt="" width="${w}" height="${h}" src="data:image/png;base64,${png.toString("base64")}"/>
<footer class="tech-stamp">${escapeHtml(stampLine)}</footer>
</body></html>`,
    { waitUntil: "load" },
  );
  await stampPage.waitForTimeout(60);
  const path = join(capDir, file);
  await stampPage.screenshot({ path, fullPage: true, type: "png", timeout: 30000 });
  await stampPage.close();

  index.push({
    file,
    commit: COMMIT,
    commit_full: COMMIT_FULL,
    branch: BRANCH,
    scenario: meta.scenario,
    viewport: meta.viewport,
    replay: meta.replay ?? null,
    stamp: stampLine,
  });
  console.log("  CAP", file, meta.scenario);
}

async function readCells(page) {
  return page.evaluate(() => {
    const cells = [...document.querySelectorAll(".cell")].map((n) => ({
      nome: n.querySelector(".cell-nome")?.textContent?.trim() || "",
      estado: n.querySelector(".cell-estado")?.textContent?.trim() || "",
      info: n.querySelector(".cell-info")?.textContent?.trim() || "",
      title: n.getAttribute("title") || "",
      classes: n.className,
    }));
    const dims = {
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      scrollHeight: document.documentElement.scrollHeight,
      clientHeight: document.documentElement.clientHeight,
      overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    };
    const linha = document.getElementById("linha");
    const replay = linha
      ? { value: linha.value, max: linha.max, min: linha.min }
      : null;
    const relogio = document.getElementById("relogio")?.textContent || "";
    return { cells, dims, replay, relogio, bodyMode: document.body.dataset.mode || "" };
  });
}

async function seekReplay(page, fraction) {
  // fraction 0..1 of timeline
  await page.evaluate((f) => {
    const linha = document.getElementById("linha");
    if (!linha) return;
    const max = Number(linha.max) || 0;
    const v = Math.round(max * f);
    linha.value = String(v);
    linha.dispatchEvent(new Event("input", { bubbles: true }));
    linha.dispatchEvent(new Event("change", { bubbles: true }));
  }, fraction);
  await page.waitForTimeout(350);
}

async function setVelSlow(page) {
  // click velocity until low
  for (let i = 0; i < 6; i++) {
    await page.evaluate(() => {
      const b = document.getElementById("btVel");
      if (b) b.click();
    }).catch(() => {});
    await page.waitForTimeout(80);
  }
}

async function waitBoot(page) {
  await page.goto(BASE + "/", { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForSelector(".cell", { timeout: 30000 });
  // ensure timeline ready
  await page.waitForFunction(() => {
    const l = document.getElementById("linha");
    return l && Number(l.max) > 10;
  }, { timeout: 45000 }).catch(() => {});
  await setVelSlow(page);
  // pause play
  await page.evaluate(() => {
    const bt = document.getElementById("btPlay");
    if (bt) {
      // try ensure paused: if label suggests playing, click
      const lab = (bt.getAttribute("aria-label") || bt.textContent || "").toLowerCase();
      if (lab.includes("pause") || lab.includes("pausar") || lab.includes("‖")) bt.click();
    }
  }).catch(() => {});
  await page.waitForTimeout(400);
}

function findCell(cells, nameRe) {
  return cells.find((c) => nameRe.test(c.nome));
}

(async () => {
  console.log("\n=== Auditoria capturas Copiloto células ===");
  console.log("  HEAD", COMMIT_FULL, BRANCH);
  console.log("  BASE", BASE);

  const browser = await browserApi.launch({ headless: true });
  try {
    // Desktop bootstrap
    {
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
      await waitBoot(page);

      // Scan timeline for interesting states
      const samples = [];
      for (let f = 0; f <= 1.001; f += 0.05) {
        await seekReplay(page, Math.min(1, f));
        const snap = await readCells(page);
        const caixa = findCell(snap.cells, /caixa/i);
        const sushi = findCell(snap.cells, /sushi/i);
        const quentes = findCell(snap.cells, /quentes/i);
        const cozinha = findCell(snap.cells, /cozinha/i);
        samples.push({
          f: Math.min(1, f),
          replay: snap.replay,
          relogio: snap.relogio,
          caixa: caixa && { estado: caixa.estado, info: caixa.info, title: caixa.title },
          sushi: sushi && { estado: sushi.estado, info: sushi.info, title: sushi.title, classes: sushi.classes },
          quentes: quentes && { estado: quentes.estado, info: quentes.info, title: quentes.title },
          cozinha: cozinha && { estado: cozinha.estado, info: cozinha.info, title: cozinha.title },
          conf: findCell(snap.cells, /confer/i),
          entregas: findCell(snap.cells, /entrega/i),
        });
      }
      writeFileSync(join(OUT, "scan-timeline.json"), JSON.stringify(samples, null, 2));

      const pick = (pred) => samples.find(pred) || null;
      const sCaixaCalmo = pick((s) => /calmo/i.test(s.caixa?.estado || ""));
      const sCaixaMov = pick((s) => /movimento/i.test(s.caixa?.estado || ""));
      const sCaixaAten = pick((s) => /aten/i.test(s.caixa?.estado || ""));
      const sSushiOk = pick((s) => /estável|ritmo|calmo|verde|no ritmo|fluindo/i.test(s.sushi?.estado || "") || (!/aten|press|crít|vermelho/i.test(s.sushi?.estado || "") && s.sushi));
      const sSushiAten = pick((s) => /aten|press|acumul|cresc/i.test(s.sushi?.estado || "") || /concentra/i.test(s.sushi?.title || ""));
      const sQCdiff = pick((s) => {
        if (!s.quentes || !s.cozinha) return false;
        return (s.quentes.estado || "") !== (s.cozinha.estado || "") ||
          /concentra|aten|press|crít|cresc/i.test(s.cozinha.title || s.cozinha.estado || "") &&
          !/concentra|aten|press|crít|cresc/i.test(s.quentes.title || s.quentes.estado || "");
      });

      // 1 Sushi estável
      {
        const s = sSushiOk || samples[0];
        await seekReplay(page, s.f);
        const dom = await readCells(page);
        domLog.push({ scenario: "01_sushi_estavel", ...dom });
        await shot(browser, page, "01_sushi_estavel.png", {
          scenario: "sushi_estavel",
          viewport: "1280x800",
          replay: s.replay?.value ?? s.f,
        });
      }

      // 2 Sushi atenção
      {
        const s = sSushiAten || samples[Math.floor(samples.length * 0.4)];
        await seekReplay(page, s.f);
        const dom = await readCells(page);
        domLog.push({ scenario: "02_sushi_atencao", ...dom });
        await shot(browser, page, "02_sushi_atencao.png", {
          scenario: "sushi_atencao_praca",
          viewport: "1280x800",
          replay: s.replay?.value ?? s.f,
        });
      }

      // 3 Quentes vs Cozinha
      {
        const s = sQCdiff || samples[Math.floor(samples.length * 0.55)];
        await seekReplay(page, s.f);
        const dom = await readCells(page);
        domLog.push({ scenario: "03_quentes_cozinha_diferentes", ...dom });
        await shot(browser, page, "03_quentes_cozinha_diferentes.png", {
          scenario: "quentes_cozinha_estados_diferentes",
          viewport: "1280x800",
          replay: s.replay?.value ?? s.f,
        });
      }

      // 4 Caixa calmo
      {
        const s = sCaixaCalmo || samples[0];
        await seekReplay(page, s.f);
        const dom = await readCells(page);
        domLog.push({ scenario: "04_caixa_calmo", ...dom });
        await shot(browser, page, "04_caixa_calmo.png", {
          scenario: "caixa_calmo",
          viewport: "1280x800",
          replay: s.replay?.value ?? s.f,
        });
      }

      // 5 Caixa movimento
      {
        const s = sCaixaMov || samples[Math.floor(samples.length * 0.35)];
        await seekReplay(page, s.f);
        const dom = await readCells(page);
        domLog.push({ scenario: "05_caixa_movimento", ...dom });
        await shot(browser, page, "05_caixa_movimento.png", {
          scenario: "caixa_em_movimento",
          viewport: "1280x800",
          replay: s.replay?.value ?? s.f,
        });
      }

      // 6 Caixa atenção (+ try ~70%)
      {
        let s = sCaixaAten;
        if (!s) {
          await seekReplay(page, 0.7);
          const d = await readCells(page);
          s = { f: 0.7, replay: d.replay };
        } else {
          await seekReplay(page, s.f);
        }
        // also force 0.7 for Claude parity attempt
        await seekReplay(page, 0.7);
        const dom70 = await readCells(page);
        domLog.push({ scenario: "06_caixa_atencao_pos70", ...dom70 });
        await shot(browser, page, "06_caixa_atencao.png", {
          scenario: "caixa_atencao",
          viewport: "1280x800",
          replay: dom70.replay?.value ?? "0.70",
        });
      }

      // 7 Caixa leitura parcial (always in title/motivo)
      {
        await seekReplay(page, 0.5);
        const dom = await readCells(page);
        domLog.push({ scenario: "07_caixa_leitura_parcial", ...dom });
        await shot(browser, page, "07_caixa_leitura_parcial.png", {
          scenario: "caixa_leitura_parcial",
          viewport: "1280x800",
          replay: dom.replay?.value ?? "0.50",
        });
      }

      // 8 Conferência
      {
        await seekReplay(page, 0.3);
        const dom = await readCells(page);
        domLog.push({ scenario: "08_conferencia", ...dom });
        await shot(browser, page, "08_conferencia.png", {
          scenario: "conferencia_sem_leitura",
          viewport: "1280x800",
          replay: dom.replay?.value ?? "0.30",
        });
      }

      // 9 Entregas
      {
        await seekReplay(page, 0.3);
        const dom = await readCells(page);
        domLog.push({ scenario: "09_entregas", ...dom });
        await shot(browser, page, "09_entregas.png", {
          scenario: "entregas_aguardando_integracao",
          viewport: "1280x800",
          replay: dom.replay?.value ?? "0.30",
        });
      }

      // 11 Desktop full
      {
        await seekReplay(page, 0.45);
        const dom = await readCells(page);
        domLog.push({ scenario: "11_desktop_completa", ...dom });
        await shot(browser, page, "11_desktop_completa.png", {
          scenario: "desktop_completa",
          viewport: "1280x800",
          replay: dom.replay?.value ?? "0.45",
        });
      }

      await page.close();
    }

    // 10 — 360px
    {
      const page = await browser.newPage({ viewport: { width: 360, height: 740 } });
      await waitBoot(page);
      await seekReplay(page, 0.5);
      await page.waitForTimeout(400);
      const dom = await readCells(page);
      domLog.push({ scenario: "10_viewport_360", ...dom });
      await shot(browser, page, "10_viewport_360.png", {
        scenario: "viewport_360",
        viewport: "360x740",
        replay: dom.replay?.value ?? "0.50",
      });
      await page.close();
    }
  } finally {
    await browser.close();
  }

  writeFileSync(join(OUT, "dom-evidence.json"), JSON.stringify(domLog, null, 2));
  writeFileSync(
    join(OUT, "index.json"),
    JSON.stringify(
      {
        audit: "copiloto-celulas-operacionais-v1",
        commit: COMMIT,
        commit_full: COMMIT_FULL,
        branch: BRANCH,
        base_url: BASE,
        stamp_policy: "faixa técnica anexada após screenshot — não DOM da app",
        captures: index,
      },
      null,
      2,
    ),
  );
  writeFileSync(
    join(OUT, "README.md"),
    [
      "# Evidências — auditoria células operacionais Copiloto V1",
      "",
      `- Commit auditado: \`${COMMIT_FULL}\``,
      `- Branch auditoria: \`${BRANCH}\``,
      `- Base: \`${BASE}\``,
      `- Carimbo: externo (faixa anexada), não no DOM do produto`,
      "",
      "| Arquivo | Cenário | Viewport | Replay |",
      "|---------|---------|----------|--------|",
      ...index.map(
        (e) =>
          `| ${e.file} | ${e.scenario} | ${e.viewport} | ${e.replay ?? "—"} |`,
      ),
      "",
    ].join("\n"),
  );

  console.log("\n=== OK capturas →", capDir);
  console.log("DOM samples:", domLog.length);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
