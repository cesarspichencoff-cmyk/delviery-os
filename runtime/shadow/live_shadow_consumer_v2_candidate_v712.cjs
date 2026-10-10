// BEGIN V712 CANDIDATE — REVIEW ONLY, NOT INSTALLED
// Fork of exact V7.10 V2 + 8-rule-lineage candidate.
// Difference: historical human override never becomes FACT for another snapshot.
// All proofs remain offline; no cutover or printer authorization.
// END V712 CANDIDATE
// BEGIN V710 CANDIDATE HEADER — OFFLINE ONLY, uninstalled
// Source: CAIXA_MOOCA consumer Git blob 22e3bdcbbed1cf245088f32679dd29ffb50766c9.
// Preserve installed V2 observations, allergen guard, aliases and exact order overrides.
// Adds rule lineage; no integration/deployment, no printer, no TATA sequence mutation.
// END V710 CANDIDATE HEADER
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
// BEGIN V710 LINEAGE 1 — same installed V2 consumer plus audited origin hashes
function sha256File(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}
// END V710 LINEAGE 1


const here = __dirname;
require(path.join(here, "packaging-current.js"));
const P = globalThis.TATAPackaging;
if (!P) throw new Error("PACKAGING_ENGINE_MISSING");

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
  return /\bcomb(?:inado)?\s+exec(?:utivo)?\b/.test(n) || /\bcombinado\s+executivo\b/.test(n);
}
function isComboOperationalName(n) {
  return /^comb(?:inado)?\b/.test(n);
}
function sameSet(a, b) {
  if (a.length !== b.length) return false;
  const aa = [...a].sort();
  const bb = [...b].sort();
  return aa.every((x, i) => x === bb[i]);
}
function classificationFromPackagingFactStrict(name, routes) {
  // Source-first bridge: only exact live product name -> FACT from the
  // installed canonical packaging engine. No fuzzy aliases or station guessing.
  const fact = P.categoryOf({ nome:name });
  if (!fact || fact.status !== P.FACT || !fact.category || !routes.length) return null;
  const byRoute = {
    "00002":"cozinha_quentes", "00003":"duplas", "00009":"duplas",
    "00004":"enrolados", "00006":"enrolados", "00007":"bar_bebidas"
  };
  const stations = routes.map(r => byRoute[String(r)] || null);
  if (stations.some(x => !x) || new Set(stations).size !== 1) return null;
  const station = stations[0];
  const allowed = {
    dupla_dyo:["duplas"],
    sashimi:["duplas"],
    enrolado:["enrolados"],
    temaki:["enrolados"],
    prato_quente:["cozinha_quentes"],
    bebida:["bar_bebidas"]
  };
  if (!(allowed[fact.category] || []).includes(station)) return null;
  const families = {
    dupla_dyo:"dupla",
    sashimi:"sashimi",
    caixa_fixa:"caixa_fixa",
    enrolado:"enrolado",
    temaki:"temaki",
    selada_650:"entrada",
    prato_quente:"prato_quente",
    bebida:"bebida"
  };
  return {
    family:families[fact.category],
    subfamily:fact.category,
    station,
    truth_class:"PROVEN_ACADEMIA_PACKAGING_RULE",
    review_required:false
  };
}function writeAtomicJson(outPath, value) {
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
const aliases = readJson(path.join(here, "product-aliases-v1.json"));
const orderOverrides = readJson(path.join(here, "human-order-overrides-v1.json"));
const routing = readJson(path.join(here, "routing.json"));
const printerMap = readJson(path.join(here, "printer-map.json"));
const nonProduction = readJson(path.join(here, "non-production.json"));
// BEGIN V710 LINEAGE 2 — eight files that actually determine this decision
const ruleLineage = Object.freeze({
  academy_rule_refs: Object.freeze([
    "tata-academia:installed/packaging-current.js#sha256=" + sha256File(path.join(here, "packaging-current.js")),
    "tata-academia:installed/app-data.json#sha256=" + sha256File(path.join(here, "app-data.json"))
  ]),
  delivery_rule_refs: Object.freeze([
    "deliveryos:installed/routing.json#sha256=" + sha256File(path.join(here, "routing.json")),
    "deliveryos:installed/printer-map.json#sha256=" + sha256File(path.join(here, "printer-map.json")),
    "deliveryos:installed/non-production.json#sha256=" + sha256File(path.join(here, "non-production.json")),
    "deliveryos:installed/product-identity-cache-v1.json#sha256=" + sha256File(path.join(here, "product-identity-cache-v1.json")),
    "deliveryos:installed/product-aliases-v1.json#sha256=" + sha256File(path.join(here, "product-aliases-v1.json")),
    "deliveryos:installed/human-order-overrides-v1.json#sha256=" + sha256File(path.join(here, "human-order-overrides-v1.json"))
  ])
});
// END V710 LINEAGE 2


if (cache.schema !== "deliveryos.product-identity-cache.v1") throw new Error("IDENTITY_CACHE_SCHEMA_MISMATCH");
if (aliases.schema !== "deliveryos.academia-live-product-aliases.v1") throw new Error("PRODUCT_ALIASES_SCHEMA_MISMATCH");
if (orderOverrides.schema !== "deliveryos.human-exact-order-overrides.v1") throw new Error("ORDER_OVERRIDES_SCHEMA_MISMATCH");
if (routing.schema !== "deliveryos.odhen.product-routing.compact.v1") throw new Error("ROUTING_SCHEMA_MISMATCH");
if (printerMap.schema !== "deliveryos.runtime-printer-map.v1") throw new Error("PRINTER_MAP_SCHEMA_MISMATCH");

const cacheByProduct = new Map(cache.rows.map(r => [String(r.CDPRODUTO), r]));
const academyByName = new Map((academy.products || []).map(p => [norm(p.nome), p]));
const aliasByName = new Map((aliases.aliases || []).map(a => [norm(a.live_name), a]));
const printerByCode = new Map((printerMap.mappings || []).map(p => [String(p.printer_code), p]));
const observationRows = Array.isArray(event.order?.observation_rows)
  ? event.order.observation_rows
  : [];
const orderObservations = [];
const itemObservationsByIndex = new Map();
const seenObservationKeys = new Set();
const observationBlockers = [];
if (event.order?.observation_scan_complete !== true) {
  observationBlockers.push("OBSERVATION_SOURCE_NOT_PROVEN_COMPLETE");
}
for (const row of observationRows) {
  if (!row || typeof row !== "object") continue;
  const value = String(row.value ?? "").trim();
  if (!value) continue;
  const sourceField = String(row.source_field ?? "UNKNOWN_FIELD").trim();
  const scope = row.scope_hint === "item" || row.scope_hint === "order"
    ? row.scope_hint
    : "unknown";
  if (row.join_proven !== true) {
    observationBlockers.push("OBSERVATION_JOIN_NOT_PROVEN:" + sourceField);
    continue;
  }
  // Alergia declarada em observacao confiavel exige revisao humana.
  // Nunca converter mencao textual em permissao implicita de imprimir ou manipular alimento.
  // Aplicar inclusive quando a regra de embalagem/kit esta completa.
  if (/\balerg(?:ia|ico|ica|icos|icas)\b|\banafilaxia\b/.test(norm(value))) {
    observationBlockers.push("ALLERGEN_NOTE_REQUIRES_HUMAN_REVIEW");
  }  const key = sourceField + "|" + value.toLocaleUpperCase("pt-BR") + "|" + String(row.item_index ?? "");
  if (seenObservationKeys.has(key)) continue;
  seenObservationKeys.add(key);
  const entry = { source_field: sourceField, value };
  if (scope === "order") {
    orderObservations.push(entry);
    continue;
  }
  if (scope === "item") {
    const idx = Number(row.item_index);
    if (!Number.isInteger(idx) || idx < 0 || idx >= (event.order?.items || []).length) {
      observationBlockers.push("OBSERVATION_ITEM_JOIN_TARGET_INVALID:" + sourceField);
      continue;
    }
    const current = itemObservationsByIndex.get(idx) || [];
    current.push(entry);
    itemObservationsByIndex.set(idx, current);
    continue;
  }
  observationBlockers.push("OBSERVATION_SCOPE_NOT_PROVEN:" + sourceField);
}

const upstreamBlockers = [];
if (event.ready_for_downstream_shadow !== true) {
  const eventBlockers = Array.isArray(event.blockers) ? event.blockers : [];
  if (eventBlockers.length) {
    for (const blocker of eventBlockers) {
      upstreamBlockers.push("UPSTREAM_" + String(blocker));
    }
  } else {
    upstreamBlockers.push("UPSTREAM_EVENT_NOT_READY");
  }
}
const blockers = [...upstreamBlockers, ...observationBlockers];
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
  const alias = aliasByName.get(n);

  // Compute a strict documented fallback but never outrank human aliases or
  // exact Academy classification. Only use it for classifications not mapped.
  const packagingClassification = classificationFromPackagingFactStrict(name, routes);  const routedToCombinados = routes.includes("00009") || routes.includes("00003");

  if (alias && String(alias.canonical_code || "").trim() === code) {
    classification = alias.classification;
    classificationSource = "HUMAN_CONFIRMED_NAME_ALIAS_2026_10_05";
  } else if (isExec(n) && routedToCombinados) {
    classification = {
      family: "combinado",
      subfamily: "executivo",
      station: "combinados",
      review_required: false
    };
    classificationSource = "ACADEMIA_OPERATIONAL_COMBO_BRIDGE_2026_10_07";
  } else if (isComboOperationalName(n) && routedToCombinados) {
    classification = {
      family: "combinado",
      subfamily: "combinado",
      station: "combinados",
      review_required: false
    };
    classificationSource = "ACADEMIA_OPERATIONAL_COMBO_BRIDGE_2026_10_07";
  } else {
    const exact = academyByName.get(n);
    if (exact?.classification && !exact.classification.review_required) {
      classification = exact.classification;
      classificationSource = "ACADEMIA_EXACT_NAME";
    } else if (
      n === "sashimi tataki de salmao" &&
      code === "9.10.05.072.00" &&
      (sameSet(routes, ["00009"]) || sameSet(routes, ["00003"]))
    ) {
      const academyVariant = academyByName.get("sashimi tataki");
      if (academyVariant?.classification && !academyVariant.classification.review_required) {
        classification = academyVariant.classification;
        classificationSource = "ACADEMIA_EXACT_VARIANT_CANONICAL_ROUTE_2026_10_07";
      } else {
        blockers.push("CLASSIFICATION_VARIANT_SOURCE_MISSING_" + code);
      }
    } else if (
      n === "sprite 350ml - un" &&
      code === "8.00.05.040.00" &&
      sameSet(routes, ["00007"])
    ) {
      const academyVariant = academyByName.get("sprite 350ml");
      if (academyVariant?.classification && !academyVariant.classification.review_required) {
        classification = academyVariant.classification;
        classificationSource = "ACADEMIA_EXACT_VARIANT_CANONICAL_ROUTE_2026_10_07";
      } else {
        blockers.push("CLASSIFICATION_VARIANT_SOURCE_MISSING_" + code);
      }
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
    } else if ((!exact?.classification || exact.classification.review_required !== true)
               && packagingClassification && routingStatus === "ROUTED") {
      classification = packagingClassification;
      classificationSource = "ACADEMIA_DOCUMENTED_CATEGORY_EXACT_NAME_AND_ROUTED_STATION_2026_10_07";
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
    classification_source: classificationSource,
    observations: itemObservationsByIndex.get(index) || []
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

// BEGIN V712 HUMAN OVERRIDE GATE — no future order may inherit a historical override
const exactOrderOverrides = (orderOverrides.orders || []).filter(o =>
  String(o.teknisa_sequence || "") === String(event.order.NRCOMANDA || "") &&
  String(o.ifood_sequence || "") === String(event.order.NRCOMANDAEXT || "")
);
const exactOrderOverride = exactOrderOverrides.length === 1 ? exactOrderOverrides[0] : null;
const exactOverrideBound = exactOrderOverride &&
  exactOrderOverride.scope === "EXACT_SNAPSHOT_ONLY" &&
  exactOrderOverride.store_id === event.order.CDFILIAL &&
  exactOrderOverride.loja_id === event.order.CDLOJA &&
  exactOrderOverride.operational_date === String(event.order.DTHRABERMESA || "").slice(0,10) &&
  exactOrderOverride.order_key === event.order_key &&
  /^[a-f0-9]{64}$/.test(String(exactOrderOverride.snapshot_hash || "")) &&
  exactOrderOverride.snapshot_hash === event.snapshot_hash &&
  Array.isArray(exactOrderOverride.source_refs) &&
  exactOrderOverride.source_refs.length > 0 &&
  exactOrderOverride.source_refs.every(ref => typeof ref === "string" &&
    ref.length >= 12 && ref.length <= 200 && !/[\r\n]/.test(ref));
if (exactOrderOverrides.length > 1) blockers.push("HUMAN_ORDER_OVERRIDE_AMBIGUOUS");
else if (exactOrderOverride && !exactOverrideBound)
  blockers.push("HUMAN_ORDER_OVERRIDE_NOT_BOUND_TO_EXACT_SNAPSHOT");
if (exactOrderOverride && exactOverrideBound) {
// END V712 HUMAN OVERRIDE GATE
  const exactBags = (exactOrderOverride.bags || []).map(row => ({
    size: String(row.size || "").trim().toUpperCase(),
    quantity: Math.max(0, Number(row.quantity) || 0)
  })).filter(row => ["P","M","G"].includes(row.size) && row.quantity > 0);

  if (packaging && exactBags.length) {
    const exactBagCount = exactBags.reduce((sum, row) => sum + row.quantity, 0);
    packaging = {
      ...packaging,
      bags: {
        ...(packaging.bags || {}),
        size: exactBags.length === 1 ? exactBags[0].size : "MIXED",
        size_status: "FACT",
        size_source: "human-order-overrides-v1.json",
        exact_bags: exactBags,
        exact_bag_count: exactBagCount,
        exact_bag_count_status: "FACT",
        measurement_required_for_external_count: false,
        why: "Quantidade e tamanhos confirmados por Cesar para esta comanda exata."
      }
    };
  }

  if (Array.isArray(exactOrderOverride.kits) && exactOrderOverride.kits.length) {
    kits = {
      kits: exactOrderOverride.kits.map(row => ({
        kit: String(row.kit || "").trim(),
        quantidade: Math.max(1, Number(row.quantidade) || 1)
      })),
      status: "FACT",
      why: "Kit confirmado por Cesar para esta comanda exata.",
      source: "human-order-overrides-v1.json"
    };
  }
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
  order_observations: orderObservations,
  observation_scan_complete: event.order?.observation_scan_complete === true,
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
  // BEGIN V710 LINEAGE 3 — outside legacy V2 core fingerprint on purpose
  rule_lineage: ruleLineage,
  // END V710 LINEAGE 3
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
