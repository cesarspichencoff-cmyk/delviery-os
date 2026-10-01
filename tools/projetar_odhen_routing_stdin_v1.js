"use strict";

const fs = require("node:fs");
const path = require("node:path");

const { normalizeOdhenRouting } = require("../dist/src/shadow/odhenRoutingReadonly.js");
const { projectExpectedRouting } = require("../dist/src/shadow/expectedRouting.js");

function loadJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, "..", relativePath), "utf8"));
}

function readStdin() {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", reject);
  });
}

async function main() {
  const inputText = (await readStdin()).trim();
  if (!inputText) {
    throw new Error("ODHEN_ROUTING_STDIN_EMPTY");
  }

  const raw = JSON.parse(inputText);
  const normalized = normalizeOdhenRouting(raw);

  if (!normalized.ready_for_routing) {
    process.stdout.write(
      JSON.stringify(
        {
          schema: "deliveryos.shadow.odhen-routing-stdin-result.v1",
          ready: false,
          blocking_reasons: normalized.blocking_reasons,
          privacy: normalized.privacy,
          effects: normalized.effects,
        },
        null,
        2,
      ) + "\n",
    );
    process.exitCode = 2;
    return;
  }

  const routing = loadJson("data/odhen_product_routing_compact_v1.json");
  const printers = loadJson("data/runtime_printer_map_v1.json");
  const projection = projectExpectedRouting(normalized, routing, printers);

  process.stdout.write(
    JSON.stringify(
      {
        schema: "deliveryos.shadow.odhen-routing-stdin-result.v1",
        ready: projection.ready,
        blocking_reasons: projection.blocking_reasons,
        order_id: projection.order_id,
        items: projection.items,
        order_targets: projection.order_targets,
        semantics: projection.semantics,
        configuration_evidence: {
          store: routing.store ?? printers.store ?? null,
          routing_captured_date: routing.captured_date ?? null,
          routing_source_sha256: routing.source_sha256 ?? null,
          printer_captured_at_local: printers.captured_at_local ?? null,
          printer_status: printers.status ?? null,
        },
        privacy: normalized.privacy,
        effects: projection.effects,
      },
      null,
      2,
    ) + "\n",
  );

  if (!projection.ready) {
    process.exitCode = 3;
  }
}

main().catch((error) => {
  process.stderr.write(String(error && error.stack ? error.stack : error) + "\n");
  process.exitCode = 1;
});
