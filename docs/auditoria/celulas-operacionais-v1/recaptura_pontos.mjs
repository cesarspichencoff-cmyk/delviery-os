/**
 * Recaptura pontual — varre a timeline completa e grava estados-alvo.
 * Só material de auditoria; não altera produto.
 */
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require(
  "C:/Users/italo/Desktop/Claude/deliveryos-entregas-v1/node_modules/playwright",
);
const CEL = require("../../../src/live/interface/celulas-operacionais.js");

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../../..");
const OUT = join(__dirname, "capturas");
const BASE = process.env.AUDIT_BASE || "http://127.0.0.1:5186";
const COMMIT = execSync("git rev-parse HEAD", { cwd: ROOT, encoding: "utf8" }).trim();
const BRANCH = execSync("git branch --show-current", { cwd: ROOT, encoding: "utf8" }).trim();

function pngSize(b) {
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}
function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function shot(browser, page, file, meta) {
  const png = await page.screenshot({ fullPage: true, type: "png", timeout: 60000 });
  const { w } = pngSize(png);
  const stamp = [
    `commit ${COMMIT.slice(0, 7)}`,
    `branch ${BRANCH}`,
    meta.scenario,
    meta.viewport,
    `replay≈${meta.replay}`,
  ].join(" · ");
  const sp = await browser.newPage({ viewport: { width: Math.min(w, 1440), height: 900 } });
  await sp.setContent(
    `<!doctype html><html><body style="margin:0;background:#0f1e16">` +
      `<img style="display:block;width:${w}px;max-width:100%" src="data:image/png;base64,${png.toString("base64")}"/>` +
      `<footer style="padding:12px 14px;font:12px/1.45 monospace;color:#f6f1e7;border-top:2px solid #22563c">${esc(stamp)}</footer>` +
      `</body></html>`,
  );
  await sp.screenshot({ path: join(OUT, file), fullPage: true });
  await sp.close();
  console.log("CAP", file, meta);
}

async function go(page, v) {
  await page.evaluate((val) => {
    const l = document.getElementById("linha");
    l.value = String(val);
    l.dispatchEvent(new Event("input", { bubbles: true }));
    l.dispatchEvent(new Event("change", { bubbles: true }));
  }, v);
  await page.waitForTimeout(280);
}

async function cells(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll(".cell")].map((n) => ({
      nome: n.querySelector(".cell-nome")?.textContent?.trim(),
      estado: n.querySelector(".cell-estado")?.textContent?.trim(),
      info: n.querySelector(".cell-info")?.textContent?.trim() || "",
      title: n.title || "",
    })),
  );
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(BASE + "/", { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForSelector(".cell", { timeout: 30000 });
  await page.waitForFunction(() => Number(document.getElementById("linha")?.max) > 10, {
    timeout: 45000,
  });
  await page.evaluate(() => {
    const b = document.getElementById("btPlay");
    if (b) b.click();
  });

  const max = Number(await page.evaluate(() => document.getElementById("linha").max));
  let mov = null;
  let aten = null;
  let sushiHot = null;
  let qc = null;
  const caixaLog = [];

  for (let v = 0; v <= max; v++) {
    await go(page, v);
    const c = await cells(page);
    const caixa = c.find((x) => /caixa/i.test(x.nome));
    const sushi = c.find((x) => /sushi/i.test(x.nome));
    const q = c.find((x) => /^quentes$/i.test(x.nome));
    const coz = c.find((x) => /cozinha/i.test(x.nome));
    caixaLog.push({ v, estado: caixa?.estado, info: caixa?.info });
    if (!mov && /movimento/i.test(caixa?.estado || "")) mov = { v, caixa };
    if (!aten && /aten/i.test(caixa?.estado || "")) aten = { v, caixa };
    if (
      !sushiHot &&
      sushi &&
      /concentra|aten|press|acumul/i.test((sushi.estado || "") + (sushi.title || ""))
    ) {
      sushiHot = { v, sushi };
    }
    if (
      !qc &&
      q &&
      coz &&
      q.estado !== coz.estado &&
      /press|aten|crít|subindo/i.test(coz.estado || "")
    ) {
      qc = { v, q, coz };
    }
  }

  console.log("FOUND", JSON.stringify({ mov, aten, sushiHot, qc }, null, 2));
  writeFileSync(join(__dirname, "caixa-timeline-full.json"), JSON.stringify(caixaLog, null, 2));

  // unit proofs for missing UI bands
  {
    const t = 20;
    const NIGHT = [];
    for (let i = 0; i < 4; i++) NIGHT.push({ r: t - 5, p: t - 2, c: null });
    const rMov = CEL.leituraCaixa(NIGHT, t);
    const rAten = CEL.leituraCaixa(
      Array.from({ length: 8 }, () => ({ r: t - 5, p: t - 1, c: null })),
      t,
    );
    const DISPLAY = { combinados: "Combinados", duplas: "Duplas", enrolados: "Enrolados" };
    const sushiAten = CEL.estadoAgregado(
      { enrolados: 1 },
      ["combinados", "duplas", "enrolados"],
      DISPLAY,
    );
    writeFileSync(
      join(__dirname, "provas-unitarias.json"),
      JSON.stringify(
        {
          caixa_em_movimento_unit: rMov,
          caixa_atencao_unit: rAten,
          sushi_atencao_unit: sushiAten,
          note_ui:
            "Se a UI do cenário sintético pular bandas, a prova unitária confirma a lógica do módulo puro.",
        },
        null,
        2,
      ),
    );
    console.log("UNIT mov", rMov.frase, rMov.info);
    console.log("UNIT aten", rAten.frase, rAten.info);
    console.log("UNIT sushi", sushiAten.motivo);
  }

  if (aten) {
    await go(page, aten.v);
    await shot(browser, page, "06_caixa_atencao.png", {
      scenario: "caixa_atencao",
      viewport: "1280x800",
      replay: aten.v,
    });
    await shot(browser, page, "07_caixa_leitura_parcial.png", {
      scenario: "caixa_leitura_parcial",
      viewport: "1280x800",
      replay: aten.v,
    });
  }
  if (mov) {
    await go(page, mov.v);
    await shot(browser, page, "05_caixa_movimento.png", {
      scenario: "caixa_em_movimento",
      viewport: "1280x800",
      replay: mov.v,
    });
  }
  if (sushiHot) {
    await go(page, sushiHot.v);
    await shot(browser, page, "02_sushi_atencao.png", {
      scenario: "sushi_atencao_praca",
      viewport: "1280x800",
      replay: sushiHot.v,
    });
  }
  if (qc) {
    await go(page, qc.v);
    await shot(browser, page, "03_quentes_cozinha_diferentes.png", {
      scenario: "quentes_cozinha_estados_diferentes",
      viewport: "1280x800",
      replay: qc.v,
    });
  }
  await go(page, 0);
  await shot(browser, page, "01_sushi_estavel.png", {
    scenario: "sushi_estavel",
    viewport: "1280x800",
    replay: 0,
  });

  await browser.close();
  console.log("DONE");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
