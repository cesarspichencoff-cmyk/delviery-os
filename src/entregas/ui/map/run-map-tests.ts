/**
 * Testes do adapter de navegação e contratos de mapa (sem domínio).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildExternalNavigationUrl } from "./ExternalNavigationAdapter";
import { DEMO_SP_POINTS, DEMO_ROUTE } from "./MapProvider";

let n = 0;
function ok(name: string, fn: () => void) {
  fn();
  n++;
  console.log(`  OK  ${name}`);
}

console.log("\n=== Map / nav adapter tests ===\n");

ok("geo uri com coordenadas", () => {
  const r = buildExternalNavigationUrl({ lat: -23.56, lon: -46.65 }, "geo");
  assert.equal(r.ok, true);
  if (r.ok) assert.ok(r.url.startsWith("geo:"));
});

ok("fallback OSM web", () => {
  const r = buildExternalNavigationUrl({ lat: -23.56, lon: -46.65 }, "osm");
  assert.equal(r.ok, true);
  if (r.ok) assert.ok(r.url.includes("openstreetmap.org"));
});

ok("destino insuficiente falha com segurança", () => {
  const r = buildExternalNavigationUrl({});
  assert.equal(r.ok, false);
});

ok("demo points anonimizados sem PII", () => {
  for (const p of DEMO_SP_POINTS) {
    assert.ok(p.lat && p.lon);
    assert.equal(String(p.label || "").includes("@"), false);
    assert.equal(String(p.label || "").toLowerCase().includes("telefone"), false);
  }
  assert.ok(DEMO_ROUTE.length >= 2);
});

ok("POC html marca demo e OSM attribution", () => {
  const html = readFileSync(
    join(process.cwd(), "src/entregas/ui/map-poc/index.html"),
    "utf8",
  );
  assert.ok(html.includes("AMBIENTE DE DEMONSTRAÇÃO"));
  assert.ok(html.includes("OpenStreetMap"));
  assert.ok(html.includes("MapLibre"));
  assert.ok(html.toLowerCase().includes("não é produção") || html.includes("não é produção"));
});

ok("POC não importa domínio/FileUnitOfWork", () => {
  const poc = readFileSync(
    join(process.cwd(), "src/entregas/ui/map-poc/poc.js"),
    "utf8",
  );
  assert.equal(poc.includes("ApplicationService"), false);
  assert.equal(poc.includes("FileUnitOfWork"), false);
  assert.equal(poc.includes("motoboy fictício") || poc.includes("NÃO desenhar"), true);
});

console.log(`\n=== ${n} map tests OK ===\n`);
