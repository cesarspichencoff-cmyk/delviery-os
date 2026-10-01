"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
delete globalThis.TATAPackaging;
require(path.join(root, "vendor", "tata_academia_packaging_current.js"));
const engine = globalThis.TATAPackaging;
if (!engine) throw new Error("PACKAGING_ENGINE_NOT_LOADED");

const seed = JSON.parse(
  fs.readFileSync(path.join(root, "data", "cardapio_knowledge_seed.json"), "utf8"),
);

function normalize(value) {
  return engine.normalize(String(value || ""));
}

const seedByName = new Map();
for (const item of seed.itens || []) {
  const key = normalize(item.nome);
  const list = seedByName.get(key) || [];
  list.push(item);
  seedByName.set(key, list);
}

function familyOf(seedItem) {
  if (!seedItem) return null;
  const category = String(seedItem.categoria_operacional || "");
  if (category === "bebida") return "bebida";
  if (category === "sobremesa") return "sobremesa";
  if (category === "nao_producao" || category === "complemento") return "nao_producao";
  if (category === "prato_quente") return "prato_quente";
  if (category === "entrada") return "entrada";
  if (category === "acompanhamento") return "entrada";
  return category || null;
}

function enrich(entry) {
  const name = String(entry.nome || entry.name || "").trim();
  const matches = seedByName.get(normalize(name)) || [];
  const exact = matches.length === 1 ? matches[0] : null;

  return {
    product: {
      nome: name,
      codigo: entry.codigo || entry.product_code || null,
      classification: {
        station: exact ? exact.praca_principal : null,
        family: familyOf(exact),
        proof: exact ? "SEED_EXACT_NAME" : "NAME_RULES_ONLY",
      },
    },
    quantity: Math.max(1, Number(entry.quantidade || entry.quantity || 1)),
  };
}

function readStdin() {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => { data += chunk; });
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", reject);
  });
}

(async () => {
  const raw = String(await readStdin()).trim();
  if (!raw) throw new Error("PACKAGING_ORDER_STDIN_EMPTY");
  const input = JSON.parse(raw);
  const entries = (input.items || []).map(enrich);

  const packaging = engine.packComanda(entries);
  const kits = engine.kitVerdict(entries);

  process.stdout.write(
    JSON.stringify(
      {
        schema: "deliveryos.packaging-order-projection.v1",
        order_id: input.order_id || null,
        enriched_items: entries,
        packaging,
        kits,
        source: {
          engine: "vendor/tata_academia_packaging_current.js",
          source_lock: "data/packaging_source_lock_v1.json",
        },
        semantics: {
          fact_only_may_feed_resource_consumption: true,
          unknown_must_remain_unknown: true,
          projection_is_not_physical_consumption: true,
        },
        effects: {
          stock_write: false,
          print: false,
          odhen_write: false,
        },
      },
      null,
      2,
    ) + "\n",
  );
})().catch((error) => {
  process.stderr.write(String(error && error.stack ? error.stack : error) + "\n");
  process.exitCode = 1;
});
