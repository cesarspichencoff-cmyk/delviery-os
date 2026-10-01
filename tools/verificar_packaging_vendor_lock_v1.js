"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const vendorPath = path.join(root, "vendor", "tata_academia_packaging_current.js");
const lock = JSON.parse(
  fs.readFileSync(path.join(root, "data", "packaging_source_lock_v1.json"), "utf8"),
);
const source = lock.files.find((x) => x.path === "lib/packaging-current.js");
assert.ok(source, "packaging source lock missing");

const bytes = fs.readFileSync(vendorPath);
const header = Buffer.from("blob " + bytes.length + "\0", "utf8");
const gitBlobSha = crypto
  .createHash("sha1")
  .update(Buffer.concat([header, bytes]))
  .digest("hex");

assert.equal(gitBlobSha, source.git_blob_sha);

delete globalThis.TATAPackaging;
require(vendorPath);
const engine = globalThis.TATAPackaging;
assert.ok(engine);
for (const fn of [
  "categoryOf",
  "packComanda",
  "kitVerdict",
  "bagVerdict",
  "bagSizeVerdict",
]) {
  assert.equal(typeof engine[fn], "function", fn);
}

const twoDuplas = engine.packComanda([
  {
    product: {
      nome: "Sushi de Salmão",
      classification: { station: "duplas", family: "dupla" },
    },
    quantity: 2,
  },
]);
assert.equal(twoDuplas.has_unknown, false);
assert.equal(twoDuplas.groups.length, 1);
assert.equal(twoDuplas.groups[0].box, "450");
assert.equal(twoDuplas.groups[0].boxes, 1);

const fourTemakis = engine.kitVerdict([
  {
    product: {
      nome: "Temaki de Salmão",
      classification: { station: "enrolados", family: "enrolado" },
    },
    quantity: 4,
  },
]);
assert.equal(fourTemakis.status, "FACT");
assert.deepEqual(fourTemakis.kits, [{ kit: "Kit p/2", quantidade: 1 }]);

console.log("packaging-vendor-lock-v1: ok");
