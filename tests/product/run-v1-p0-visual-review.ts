/**
 * DELIVERYOS V1 P0 VISUAL REVIEW: only existing LOCAL 127.0.0.1:5367 preview.
 * Screenshots are audit artifacts on the developer computer, not a release.
 * Refuses operational databases. Never starts production server or touches devices.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";

const HOST = "http://127.0.0.1:5367";
const OUTPUT = join(tmpdir(), "deliveryos-v1-p0-review-20261020");
const ROUTES = [
  { label: "operacao", path: "/" },
  { label: "copiloto", path: "/copiloto" },
  { label: "entregas", path: "/entregas" },
  { label: "operacao-viva", path: "/operacao-viva" },
  { label: "conference-brain", path: "/conference-brain" },
] as const;
const SIZES = [
  { label: "celular", width: 390, height: 844 },
  { label: "desktop", width: 1440, height: 900 },
] as const;
async function main(): Promise<void> {
  for (const k of ["DELIVERYOS_DATABASE_URL", "DELIVERYOS_PG_URL", "TATA_READER_INSTALL_ROOT", "CONFERENCE_BRAIN_DATA_DIR"]) {
    if ((process.env[k] || "").trim()) throw Error("P0_PREVIEW_REFUSED: active data/operational source configured: " + k);
  }
  const healthResponse = await fetch(HOST + "/api/health", { signal: AbortSignal.timeout(5000) });
  assert.equal(healthResponse.status, 200);
  const health = await healthResponse.json() as { demo?: boolean; leitura_do_servidor?: boolean; banner?: string };
  assert.equal(health.demo, true);
  assert.equal(health.leitura_do_servidor, false);
  assert.match(health.banner || "", /AMBIENTE DE DEMONSTRACAO/);
  assert.equal((await fetch(HOST + "/api/copiloto", { method: "POST" })).status, 405);
  mkdirSync(OUTPUT, { recursive: true });
  let passed = 0;
  const browser = await chromium.launch({ headless: true });
  const manifest: { route: string; viewport: string; file: string; width: number; height: number }[] = [];
  try {
    for (const size of SIZES) {
      const context = await browser.newContext({ viewport: { width: size.width, height: size.height }, reducedMotion: "reduce" });
      try {
        for (const route of ROUTES) {
          const page = await context.newPage();
          const errors: string[] = [];
          page.on("pageerror", e => errors.push(e.message));
          try {
            const response = await page.goto(HOST + "/#" + route.path, { waitUntil: "domcontentloaded", timeout: 15000 });
            assert.equal(response?.status(), 200);
            await page.waitForFunction(() => document.querySelector("#superficie")?.getAttribute("aria-busy") === "false", undefined, { timeout: 15000 });
            const body = await page.locator("body").innerText();
            assert.match(body, /DEMONSTRACAO|DEMONSTRAÇÃO/i, "preview must declare simulation");
            assert.ok((await page.locator("#superficie").innerText()).trim().length > 40, "route must render content");
            assert.deepEqual(errors, [], "no uncaught JS error");
            const overflow = await page.evaluate(() => ({
              viewport: document.documentElement.clientWidth,
              content: document.documentElement.scrollWidth,
            }));
            assert.ok(overflow.content <= overflow.viewport + 2,
              "no horizontal overflow on " + route.path + ": " + JSON.stringify(overflow));
            const file = join(OUTPUT, size.label + "-" + route.label + ".png");
            await page.screenshot({ path: file, fullPage: true, animations: "disabled" });
            manifest.push({ route: route.path, viewport: size.label, file, width: size.width, height: size.height });
            console.log("ok P0-REVIEW-" + (++passed) + " " + size.label + " / " + route.path);
          } finally {
            await page.close();
          }
        }
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
  writeFileSync(join(OUTPUT, "manifest.json"), JSON.stringify({
    classification: "SIMULATED_ONLY_LOCALHOST_P0_NOT_OPERATIONAL",
    host: HOST, git_head_at_review: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    checks: { health_demo: true, operational_reader: false, post_405: true },
    screenshots: manifest,
  }, null, 2));
  assert.equal(passed, SIZES.length * ROUTES.length);
  console.log("DELIVERYOS_V1_P0_VISUAL_REVIEW: " + passed + "/" + passed + " PASS; file evidence " + OUTPUT);
}
void main().catch(e => { console.error("DELIVERYOS_V1_P0_VISUAL_REVIEW=FAIL", e); process.exitCode = 1; });
