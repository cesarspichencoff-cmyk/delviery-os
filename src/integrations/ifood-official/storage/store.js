/* ============================================================================
 * Persistência da integração oficial — JSONL append-only, independente do
 * `conference-brain/storage/store.js` (mesmo padrão, reimplementado sem
 * nenhum require cruzado — ver IFOOD_EXISTING_ASSETS_INVENTORY.md §3.1).
 * ----------------------------------------------------------------------------
 * Zero dependências de runtime. Nunca lança por erro de I/O: devolve status.
 * Linha corrompida NUNCA é descartada em silêncio (lição do conference-brain,
 * bloqueador 12/REPLAY-A) — vira entrada em `corrupted[]`, com hash/tamanho,
 * nunca o conteúdo bruto (o `e.name` do erro de parse, nunca `e.message`,
 * porque o V8 pode embutir um trecho da entrada inválida na mensagem).
 * ==========================================================================*/
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { validate, naturalKey } = require("../contracts/schemas");

const DEFAULT_DIR = path.join(__dirname, "..", "..", "..", "..", "data", "integrations", "ifood-official");

function sha256(v) {
  return crypto.createHash("sha256").update(typeof v === "string" ? v : JSON.stringify(v)).digest("hex");
}

function createStore(opts) {
  const options = opts || {};
  const dir = options.dir || process.env.IFOOD_OFFICIAL_DATA_DIR || DEFAULT_DIR;
  const memoryOnly = options.memoryOnly === true;
  const mem = new Map();
  const failures = [];
  const corrupted = [];

  function fileFor(entity) { return path.join(dir, entity + ".runtime.jsonl"); }

  function ensureDir() {
    if (memoryOnly) return true;
    try { fs.mkdirSync(dir, { recursive: true }); return true; }
    catch (e) { failures.push({ op: "mkdir", error: String((e && e.message) || e) }); return false; }
  }

  function table(entity) {
    if (!mem.has(entity)) mem.set(entity, new Map());
    return mem.get(entity);
  }

  function load(entity) {
    if (memoryOnly) return table(entity).size;
    const f = fileFor(entity);
    if (!fs.existsSync(f)) return 0;
    try {
      const t = table(entity);
      const lines = fs.readFileSync(f, "utf8").split("\n");
      for (let i = 0; i < lines.length; i++) {
        const s = lines[i].trim();
        if (!s) continue;
        try { const r = JSON.parse(s); t.set(naturalKey(entity, r), r); }
        catch (e) {
          corrupted.push({
            entity, line_number: i + 1, file: f,
            error: (e && e.name) || "Error", // nunca e.message — pode embutir a linha invalida
            excerpt_length: s.length, excerpt_hash: sha256(s)
          });
        }
      }
      return t.size;
    } catch (e) {
      failures.push({ op: "load:" + entity, error: String((e && e.message) || e) });
      return 0;
    }
  }

  function put(entity, record) {
    const v = validate(entity, record);
    if (!v.ok) return { ok: false, action: "rejected", errors: v.errors };
    const key = naturalKey(entity, record);
    const t = table(entity);
    const existed = t.has(key);
    t.set(key, record);
    if (!memoryOnly && ensureDir()) {
      try { fs.appendFileSync(fileFor(entity), JSON.stringify(record) + "\n"); }
      catch (e) { failures.push({ op: "append:" + entity, error: String((e && e.message) || e) }); }
    }
    return { ok: true, action: existed ? "updated" : "inserted", key };
  }

  function get(entity, key) { return table(entity).get(key) || null; }
  function has(entity, key) { return table(entity).has(key); }
  function all(entity) { return Array.from(table(entity).values()); }
  function count(entity) { return table(entity).size; }
  function clear(entity) { table(entity).clear(); }

  function health() {
    return {
      dir: memoryOnly ? "(memoria)" : dir,
      memory_only: memoryOnly,
      entities: Array.from(mem.keys()).map((e) => ({ entity: e, records: mem.get(e).size })),
      io_failures: failures.slice(),
      corrupted_lines: corrupted.slice()
    };
  }

  return { put, get, has, all, count, clear, load, health, sha256, dir, fileFor };
}

module.exports = { createStore, sha256, DEFAULT_DIR };
