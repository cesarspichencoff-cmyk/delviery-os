"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const here = __dirname;
require(path.join(here, "packaging-current.js"));
const P = globalThis.TATAPackaging;
if (!P) throw new Error("PACKAGING_ENGINE_MISSING");

function sha256File(p) {
  return crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
}
function readJson(p) {
  let buf = fs.readFileSync(p);
  let text;
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    text = buf.subarray(2).toString("utf16le");
  } else {
    text = buf.toString("utf8").replace(/^\uFEFF/, "");
  }
  return JSON.parse(text);
}
function norm(s) {
  return String(s ?? "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/\s+/g, " ").trim();
}
function canonical(raw) {
  const d = String(raw ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (d.length !== 10) return null;
  return d.slice(0,1)+"."+d.slice(1,3)+"."+d.slice(3,5)+"."+d.slice(5,8)+"."+d.slice(8,10);
}
function isExec(n) {
  return /^comb(?:inado)?\s+exec(?:utivo)?\b/.test(n) || /^combinado\s+executivo\b/.test(n);
}
function sameSet(a, b) {
  if (a.length !== b.length) return false;
  const aa = [...a].sort();
  const bb = [...b].sort();
  return aa.every((x, i) => x === bb[i]);
}
function writeAtomicJson(outPath, value) {
  const tmp = outPath + ".tmp." + process.pid + "." + Date.now();
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + "\n", {encoding:"utf8"});
  fs.renameSync(tmp, outPath);
}

const eventPath = process.argv[2];
const outPath = process.argv[3] || null;
if (!eventPath) throw new Error("EVENT_PATH_REQUIRED");

const event = readJson(eventPath);
if (event.schema !== "deliveryos.tata-reader-stable-order-event.v1") {
  throw new Error("EVENT_SCHEMA_MISMATCH");
}

const cache = readJson(path.join(here, "product-identity-cache-v1.json"));
const academy = readJson(path.join(here, "app-data.json"));
const routing = readJson(path.join(here, "routing.json"));
const printerMap = readJson(path.join(here, "printer-map.json"));
const nonProduction = readJson(path.join(here, "non-production.json"));

const ruleLineage = Object.freeze({
  academy_rule_refs: Object.freeze([
    "tata-academia:installed/packaging-current.js#sha256=" + sha256File(path.join(here, "packaging-current.js")),
    "tata-academia:installed/app-data.json#sha256=" + sha256File(path.join(here, "app-data.json"))
  ]),
  delivery_rule_refs: Object.freeze([
    "deliveryos:installed/routing.json#sha256=" + sha256File(path.join(here, "routing.json")),
    "deliveryos:installed/printer-map.json#sha256=" + sha256File(path.join(here, "printer-map.json")),
    "deliveryos:installed/non-production.json#sha256=" + sha256File(path.join(here, "non-production.json")),
    "deliveryos:installed/product-identity-cache-v1.json#sha256=" + sha256File(path.join(here, "product-identity-cache-v1.json"))
  ])
});

if (cache.schema !== "deliveryos.product-identity-cache.v1") throw new Error("IDENTITY_CACHE_SCHEMA_MISMATCH");
if (routing.schema !== "deliveryos.odhen.product-routing.compact.v1") throw new Error("ROUTING_SCHEMA_MISMATCH");
if (printerMap.schema !== "deliveryos.runtime-printer-map.v1") throw new Error("PRINTER_MAP_SCHEMA_MISMATCH");

const cacheByProduct = new Map(cache.rows.map(r => [String(r.CDPRODUTO), r]));
const academyByName = new Map((academy.products || []).map(p => [norm(p.nome), p]));
const printerByCode = new Map((printerMap.mappings || []).map(p => [String(p.printer_code), p]));
const blockers = [];
const items = [];
const packEntries = [];

for (const [index, raw] of (event.order.items || []).entries()) {
  const id = cacheByProduct.get(String(raw.CDPRODUTO));
  const code = canonical(raw.CDARVPROD);
  if (!id) {
    blockers.push("IDENTITY_NOT_FOUND_" + raw.CDPRODUTO);
    continue;
  }
  if (id.canonical !== code) {
    blockers.push("IDENTITY_CANONICAL_MISMATCH_" + raw.CDPRODUTO);
    continue;
  }

  const name = String(id.NMPRODUTO || "").trim();
  const n = norm(name);
  let routes = Array.isArray(routing.products?.[code]) ? [...routing.products[code]] : [];
  const np = nonProduction.items?.[code] || null;
  let routingStatus = "ROUTED";

  if (!routes.length) {
    if (np) routingStatus = "NO_OWN_PRODUCTION_TICKET";
    else blockers.push("ROUTE_NOT_FOUND_" + code);
  }

  const service = event.service_resolution?.service || null;
  if (routes.includes("00009") && routes.includes("00003")) {
    if (service === "LUNCH") routes = routes.filter(x => x !== "00003");
    else if (service === "DINNER") routes = routes.filter(x => x !== "00009");
    else blockers.push("SERVICE_REQUIRED_SUSHI1_" + code);
  }
  if (routes.includes("00006") && routes.includes("00004")) {
    if (service === "LUNCH") routes = routes.filter(x => x !== "00004");
    else if (service === "DINNER") routes = routes.filter(x => x !== "00006");
    else blockers.push("SERVICE_REQUIRED_SUSHI2_" + code);
  }

  const targets = routes
    .map(rc => printerByCode.get(rc))
    .filter(Boolean)
    .map(p => ({
      printer_code: p.printer_code,
      printer_name: p.printer_name,
      printer_ip: p.printer_ip
    }));
  if (routes.length !== targets.length) blockers.push("PRINTER_MAP_MISSING_" + code);

  let classification = null;
  let classificationSource = null;

  if (isExec(n)) {
    classification = {
      family: "combinado",
      subfamily: "executivo",
      station: "combinados",
      review_required: false
    };
    classificationSource = "HUMAN_CURRENT_EXECUTIVE_COMBO_2026_10_05";
  } else {
    const exact = academyByName.get(n);
    if (exact?.classification && !exact.classification.review_required) {
      classification = exact.classification;
      classificationSource = "ACADEMIA_EXACT_NAME";
    } else if (
      n === "coca cola zero 350ml - un" &&
      code === "8.00.05.010.00" &&
      sameSet(routes, ["00007"])
    ) {
      classification = {
        family: "bebida",
        subfamily: "refrigerante",
        station: "bar_bebidas",
        review_required: false
      };
      classificationSource = "LIVE_EXACT_ALIAS_2026_10_05";
    } else if (routingStatus === "NO_OWN_PRODUCTION_TICKET") {
      classification = {
        family: "nao_producao",
        subfamily: np.logical_plaza || "nao_producao",
        station: null,
        review_required: false
      };
      classificationSource = "NON_PRODUCTION_AUTHORITY";
    } else {
      blockers.push("CLASSIFICATION_UNKNOWN_" + code);
    }
  }

  const quantity = Math.max(1, Number(raw.QTPRODCOMVEN) || 1);
  const item = {
    item_index: index + 1,
    CDPRODUTO: String(raw.CDPRODUTO),
    canonical_code: code,
    product_name: name,
    quantity,
    routing_status: routingStatus,
    targets,
    classification,
    classification_source: classificationSource
  };
  items.push(item);

  if (classification) {
    packEntries.push({ product: { nome: name, classification }, quantity });
  }
}

let packaging = null;
let kits = null;
if (packEntries.length) {
  packaging = P.packComanda(packEntries);
  kits = P.kitVerdict(packEntries);
}

if (!packaging) {
  blockers.push("PACKAGING_NOT_RUN");
} else {
  if (packaging.has_unknown === true) blockers.push("PACKAGING_UNKNOWN");
  if (!packaging.bags || packaging.bags.size_status !== "FACT") blockers.push("BAG_SIZE_NOT_FACT");
  if (packaging.bags?.exact_bag_count_status !== "FACT") blockers.push("BAG_COUNT_NOT_FACT");
}
if (!kits || kits.status !== "FACT") blockers.push("KITS_NOT_FACT");

let sequence = null;
const seqPath = "C:\\ProgramData\\TataComandaReader\\state\\tata-sequence-state.json";
if (fs.existsSync(seqPath)) {
  const s = readJson(seqPath);
  if (
    s.schema === "deliveryos.tata-sequence-state.v1" &&
    Number(s.next_value) >= 1 &&
    Number(s.next_value) <= 999
  ) {
    sequence = {
      shadow_candidate: String(Number(s.next_value)).padStart(3, "0"),
      binding_written: false
    };
  } else {
    blockers.push("TATA_SEQUENCE_STATE_INVALID");
  }
} else {
  blockers.push("TATA_SEQUENCE_STATE_MISSING");
}

const core = {
  order_key: event.order_key,
  snapshot_hash: event.snapshot_hash,
  ifood_sequence: event.order.NRCOMANDAEXT,
  teknisa_sequence: event.order.NRCOMANDA,
  service: event.service_resolution,
  items,
  packaging,
  kits,
  sequence
};
const fingerprint = crypto.createHash("sha256")
  .update(JSON.stringify(core))
  .digest("hex");

const result = {
  schema: "deliveryos.live-shadow-decision.v1",
  generated_at: new Date().toISOString(),
  ready: blockers.length === 0,
  blocking_reasons: [...new Set(blockers)].sort(),
  fingerprint,
  ...core,
  rule_lineage: ruleLineage,
  effects: {
    database_read: false,
    database_write: false,
    sequence_binding_write: false,
    print: false,
    spooler_write: false,
    odhen_write: false,
    fiscal_action: false,
    sefaz_call: false
  }
};

if (outPath) writeAtomicJson(outPath, result);
process.stdout.write(JSON.stringify(result) + "\n");
process.exit(result.ready ? 0 : 5);
