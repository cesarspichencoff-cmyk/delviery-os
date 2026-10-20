/** M1B: browser evidence for the Home's source truth, not a production claim.
 * Requires the separate local demo preview on 127.0.0.1:5368. No external IO.
 */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";

const host = "http://127.0.0.1:5368";
const scenes = ["calmo", "ambiente", "foco", "degradado"];
const sizes = [
  { w: 320, h: 720 }, { w: 375, h: 812 }, { w: 390, h: 844 },
  { w: 768, h: 1024 }, { w: 1024, h: 768 }, { w: 1440, h: 900 },
];
const dest = join(tmpdir(), "deliveryos-m1b-home-20261020");
async function main(): Promise<void> {
  const h = await (await fetch(host + "/api/health")).json() as {
    demo?: boolean; leitura_do_servidor?: boolean;
  };
  assert.equal(h.demo, true);
  assert.equal(h.leitura_do_servidor, false);
  mkdirSync(dest, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  let passed = 0;
  const measures: { scene: string; width: number; height: number; title_px: number;
    territory_width: number; territory_top: number; first_area_top: number }[] = [];
  try {
    for (const size of sizes) {
      const page = await browser.newPage({ viewport: { width: size.w, height: size.h }, reducedMotion: "reduce" });
      try {
        for (const scene of scenes) {
          const errors: string[] = [];
          page.once("pageerror", e => errors.push(e.message));
          const r = await page.goto(host + "/?cena=" + scene + "#/", { waitUntil: "domcontentloaded" });
          assert.equal(r?.status(), 200);
          await page.waitForFunction(() => document.querySelector("#superficie")?.getAttribute("aria-busy") === "false");
          const org = page.locator(".org");
          assert.equal(await org.getAttribute("data-demonstracao"), "sim");
          assert.equal(await page.locator(".org-demo").count(), 1);
          const vida = page.locator(".org-topo__vida");
          const note = (await vida.innerText()).toLowerCase();
          if (scene === "degradado") {
            assert.equal(await vida.getAttribute("data-estado"), "falha");
            assert.match(note, /leitura degradada/);
          } else {
            assert.equal(await vida.getAttribute("data-estado"), "simulado");
            assert.match(note, /cenario simulado/);
            assert.doesNotMatch(note, /ao vivo/);
          }
          const animation = await page.locator(".org-topo__ponto").evaluate(e => getComputedStyle(e).animationName);
          assert.equal(animation, "none", "fixture must never pulse as live operation");
          const font = await page.locator(".org-legenda__frase").evaluate(e => parseFloat(getComputedStyle(e).fontSize));
          if (size.w <= 390) assert.ok(font >= 30, "main state must dominate mobile typography: " + font);
          assert.equal(await page.locator(".org h1").count(), 1);
          const geom = await page.evaluate(() => {
            const mass = document.querySelector(".org-massa")?.getBoundingClientRect();
            const area = document.querySelector(".org-area")?.getBoundingClientRect();
            return { territory_width: mass?.width ?? 0, territory_top: mass?.top ?? -1,
              first_area_top: area?.top ?? -1 };
          });
          assert.ok(geom.territory_width > 180,
            "territory must not collapse: " + size.w + "px " + scene + " " + geom.territory_width);
          measures.push({ scene, width: size.w, height: size.h, title_px: font, ...geom });
          const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
          assert.ok(overflow <= 2, "home overflow " + scene + " width " + size.w + ": " + overflow);
          assert.deepEqual(errors, []);
          await page.screenshot({ path: join(dest, scene + "-" + size.w + ".png"), fullPage: true });
          console.log("ok M1B-" + (++passed) + " " + scene + " " + size.w + "px");
        }
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }
  writeFileSync(join(dest, "measurements.json"), JSON.stringify({
    classification: "DEMONSTRATION_ONLY_NOT_HUMAN_APPROVED",
    passed, scenes, viewports: sizes, measures,
  }, null, 2));
  console.log("M1B_HOME_SIMULATION_TRUTH: " + passed + "/" + passed +
    " PASS, screenshots and measurements " + dest + "; visual human acceptance pending");
}
void main().catch(e => {
  console.error("M1B_HOME_SIMULATION_TRUTH=FAIL", e instanceof Error ? e.message : String(e));
  process.exitCode = 1;
});
