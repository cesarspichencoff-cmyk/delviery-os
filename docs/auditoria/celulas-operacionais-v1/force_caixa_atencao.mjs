import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require(
  "C:/Users/italo/Desktop/Claude/deliveryos-entregas-v1/node_modules/playwright",
);
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../../..");
const OUT = join(__dirname, "capturas");
const COMMIT = execSync("git rev-parse HEAD", { cwd: ROOT, encoding: "utf8" }).trim().slice(0, 7);
const BRANCH = execSync("git branch --show-current", { cwd: ROOT, encoding: "utf8" }).trim();

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto("http://127.0.0.1:5186/", { waitUntil: "networkidle" });
  await page.waitForSelector(".cell");
  await page.waitForFunction(() => Number(document.getElementById("linha")?.max) > 10);

  // Pause if playing
  await page.evaluate(() => {
    const b = document.getElementById("btPlay");
    if (b && (b.textContent || "").includes("❚")) b.click();
  });

  // Seek to 65 (known attention)
  await page.evaluate(() => {
    const l = document.getElementById("linha");
    l.value = "65";
    l.dispatchEvent(new Event("input", { bubbles: true }));
    l.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    const b = document.getElementById("btPlay");
    if (b && (b.textContent || "").includes("❚")) b.click();
  });
  await page.waitForTimeout(200);

  // Wait until Caixa shows atenção
  await page.waitForFunction(
    () => {
      const cells = [...document.querySelectorAll(".cell")];
      const caixa = cells.find((n) => /caixa/i.test(n.querySelector(".cell-nome")?.textContent || ""));
      return /aten/i.test(caixa?.querySelector(".cell-estado")?.textContent || "");
    },
    { timeout: 5000 },
  ).catch(() => {});

  const c = await page.evaluate(() =>
    [...document.querySelectorAll(".cell")].map((n) => ({
      nome: n.querySelector(".cell-nome")?.textContent,
      estado: n.querySelector(".cell-estado")?.textContent,
      info: n.querySelector(".cell-info")?.textContent,
    })),
  );
  console.log("CELLS", JSON.stringify(c, null, 2));

  const png = await page.screenshot({ fullPage: true, type: "png" });
  const w = png.readUInt32BE(16);
  const stamp = `commit ${COMMIT} · branch ${BRANCH} · caixa_atencao · 1280x800 · replay≈65`;
  const sp = await browser.newPage();
  await sp.setContent(
    `<html><body style="margin:0;background:#0f1e16">` +
      `<img style="display:block;width:${w}px" src="data:image/png;base64,${png.toString("base64")}"/>` +
      `<footer style="padding:12px;font:12px monospace;color:#f6f1e7;border-top:2px solid #22563c">${stamp}</footer>` +
      `</body></html>`,
  );
  await sp.screenshot({ path: join(OUT, "06_caixa_atencao.png"), fullPage: true });
  await sp.screenshot({ path: join(OUT, "07_caixa_leitura_parcial.png"), fullPage: true });
  await browser.close();
  console.log("OK 06/07");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
