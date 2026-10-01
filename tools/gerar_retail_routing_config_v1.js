"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const XLSX = require("xlsx");

const PRODUCT_HEADERS = [
  "Código",
  "Produto",
  "Setor de Produção",
  "Impressora do Puxa",
  "Impressora de Produção",
  "Impressora de Produção (2)",
  "Impressora de Produção (Backup)",
  "Impressora de Produção (2) (Backup)",
  "Impressora do Puxa (Backup)",
  "Imprime Cancelamento de Pedido",
];

const PRINTER_HEADERS = [
  "Código",
  "Modelo",
  "Nome Impressora",
  "Porta/IP de Impressão",
  "Endereço de IP da impressora",
  "Endereço do servidor de periféricos",
];

function fail(message) {
  throw new Error("retail-routing-config-v1: " + message);
}

function textOrNull(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text || text === "-") return null;
  return text;
}

function canonicalizeProductCode(value) {
  const source = textOrNull(value);
  if (!source) return null;
  const compact = source.toUpperCase().replace(/\./g, "");
  if (!/^[A-Z0-9]{10}$/.test(compact)) {
    fail("invalid product code " + source);
  }
  return [
    compact.slice(0, 1),
    compact.slice(1, 3),
    compact.slice(3, 5),
    compact.slice(5, 8),
    compact.slice(8, 10),
  ].join(".");
}

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function readSheetRows(filePath, requiredHeaders) {
  const workbook = XLSX.readFile(filePath, { cellDates: false, raw: true });
  const first = workbook.SheetNames[0];
  if (!first) fail("workbook has no sheet: " + filePath);
  const sheet = workbook.Sheets[first];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: null, raw: true });
  if (!rows.length) fail("sheet has no rows: " + filePath);

  const actualHeaders = new Set(Object.keys(rows[0]));
  for (const header of requiredHeaders) {
    if (!actualHeaders.has(header)) fail("missing header " + header + " in " + filePath);
  }
  return rows;
}

function buildConfig(productRows, printerRows, meta) {
  if (!meta || !meta.store || !meta.capturedDate) {
    fail("store and capturedDate are required");
  }

  const printerByName = new Map();
  const printerMappings = [];

  for (const row of printerRows) {
    const printerCode = textOrNull(row["Código"]);
    const printerName = textOrNull(row["Nome Impressora"]);
    if (!printerCode && !printerName) continue;
    if (!printerCode || !printerName) fail("partial printer row");

    if (printerByName.has(printerName)) fail("duplicate printer name " + printerName);
    if (printerMappings.some((x) => x.printer_code === printerCode)) {
      fail("duplicate printer code " + printerCode);
    }

    const mapping = {
      printer_code: printerCode,
      printer_name: printerName,
      printer_model: textOrNull(row["Modelo"]),
      printer_port: textOrNull(row["Porta/IP de Impressão"]),
      printer_ip: textOrNull(row["Endereço de IP da impressora"]),
      peripherals_server: textOrNull(row["Endereço do servidor de periféricos"]),
      used_by_products: false,
      proof: "CURRENT_CONFIG_PROVEN",
    };

    printerByName.set(printerName, mapping);
    printerMappings.push(mapping);
  }

  const products = {};
  let puxa = 0;
  let backup = 0;
  const seenProductNames = new Map();

  for (const row of productRows) {
    const productCode = canonicalizeProductCode(row["Código"]);
    const productName = textOrNull(row["Produto"]);
    if (!productCode && !productName) continue;
    if (!productCode || !productName) fail("partial product row");
    if (products[productCode]) fail("duplicate product code " + productCode);

    const puxaName = textOrNull(row["Impressora do Puxa"]);
    const backupNames = [
      textOrNull(row["Impressora de Produção (Backup)"]),
      textOrNull(row["Impressora de Produção (2) (Backup)"]),
      textOrNull(row["Impressora do Puxa (Backup)"]),
    ].filter(Boolean);

    if (puxaName) puxa += 1;
    if (backupNames.length) backup += 1;

    const routeNames = [
      textOrNull(row["Impressora de Produção"]),
      textOrNull(row["Impressora de Produção (2)"]),
    ].filter(Boolean);

    if (!routeNames.length) fail("product has no production route " + productCode);
    if (new Set(routeNames).size !== routeNames.length) {
      fail("duplicate production target for " + productCode);
    }

    const routeCodes = routeNames.map((name) => {
      const printer = printerByName.get(name);
      if (!printer) fail("unknown printer " + name + " for " + productCode);
      if (!printer.printer_ip) fail("production printer without IP " + name + " for " + productCode);
      printer.used_by_products = true;
      return printer.printer_code;
    });

    products[productCode] = routeCodes;
    seenProductNames.set(productCode, productName);
  }

  // Compact V1 deliberately models configured production 1 + production 2 only.
  // A newly-active puxa/backup must stop generation instead of being silently ignored.
  if (puxa !== 0) fail("active puxa routes detected: " + puxa);
  if (backup !== 0) fail("active backup routes detected: " + backup);

  const routeLengths = Object.values(products).map((x) => x.length);
  const counts = {
    products: routeLengths.length,
    one_target: routeLengths.filter((x) => x === 1).length,
    two_targets: routeLengths.filter((x) => x === 2).length,
    zero_target: routeLengths.filter((x) => x === 0).length,
    puxa,
  };

  const routing = {
    schema: "deliveryos.odhen.product-routing.compact.v1",
    store: meta.store,
    captured_date: meta.capturedDate,
    source_sha256: {
      produtos_por_loja: meta.productsSha256,
      impressoras_por_loja: meta.printersSha256,
    },
    counts,
    products,
  };

  const printerMap = {
    schema: "deliveryos.runtime-printer-map.v1",
    status: "CURRENT_CONFIG_PROVEN",
    captured_at_local: meta.capturedAtLocal || null,
    store: meta.store,
    source: "TEKNISA_RETAIL__CADASTRO_DE_LOJA__IMPRESSORAS_POR_LOJA",
    mappings: printerMappings,
    notes: [
      "Generated deterministically from current Teknisa Retail store exports.",
      "Static configuration proof does not by itself prove a specific runtime print event or physical paper output.",
    ],
  };

  return { routing, printerMap, productNames: Object.fromEntries(seenProductNames) };
}

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) fail("unexpected argument " + token);
    const key = token.slice(2);
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) fail("missing value for --" + key);
    out[key] = value;
    i += 1;
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv);
  for (const required of ["products", "printers", "store", "captured-date", "routing-out", "printer-out"]) {
    if (!args[required]) fail("missing --" + required);
  }

  const productsPath = path.resolve(args.products);
  const printersPath = path.resolve(args.printers);
  const productRows = readSheetRows(productsPath, PRODUCT_HEADERS);
  const printerRows = readSheetRows(printersPath, PRINTER_HEADERS);

  const built = buildConfig(productRows, printerRows, {
    store: args.store,
    capturedDate: args["captured-date"],
    capturedAtLocal: args["captured-at-local"] || null,
    productsSha256: sha256File(productsPath),
    printersSha256: sha256File(printersPath),
  });

  fs.writeFileSync(path.resolve(args["routing-out"]), JSON.stringify(built.routing, null, 2) + "\n");
  fs.writeFileSync(path.resolve(args["printer-out"]), JSON.stringify(built.printerMap, null, 2) + "\n");

  process.stdout.write(
    JSON.stringify(
      {
        schema: "deliveryos.retail-routing-generator-result.v1",
        store: built.routing.store,
        counts: built.routing.counts,
        used_printers: built.printerMap.mappings
          .filter((x) => x.used_by_products)
          .map((x) => [x.printer_code, x.printer_name, x.printer_ip]),
        source_sha256: built.routing.source_sha256,
      },
      null,
      2,
    ) + "\n",
  );
}

module.exports = {
  PRODUCT_HEADERS,
  PRINTER_HEADERS,
  canonicalizeProductCode,
  buildConfig,
  readSheetRows,
};

if (require.main === module) {
  main();
}
