/* ============================================================================
 * Persistência da fundação — JSONL append-only por entidade.
 * ----------------------------------------------------------------------------
 * Por que JSONL e não um banco: o repositório tem ZERO dependências de runtime
 * (package.json só tem devDeps). Introduzir um banco no Sprint 1 seria uma
 * decisão de infraestrutura maior que a fundação em si. JSONL preserva o
 * princípio append-only (L0 imutável), é auditável a olho nu e é reconstruível.
 * O contrato de `Store` abaixo é a fronteira: trocar para SQLite/Postgres no
 * futuro não exige mudar ingestão, snapshots nem estado sombra.
 *
 * Dados ficam em data/conference-brain/ — gitignorado via *.runtime.jsonl.
 * Nunca lança por erro de I/O: devolve status (falha segura, como o modo sombra).
 * ==========================================================================*/
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { validate, naturalKey } = require("../contracts/schemas");

const DEFAULT_DIR = path.join(__dirname, "..", "..", "..", "data", "conference-brain");

function sha256(v) {
  return crypto.createHash("sha256").update(typeof v === "string" ? v : JSON.stringify(v)).digest("hex");
}

function createStore(opts) {
  const options = opts || {};
  const dir = options.dir || process.env.CONFERENCE_BRAIN_DATA_DIR || DEFAULT_DIR;
  const memoryOnly = options.memoryOnly === true;
  const mem = new Map();          // entidade -> Map(chave -> registro)
  const failures = [];
  const corrupted = [];           // Sprint 2.2 (Fase 7/12, bloqueador 12): linhas JSONL ilegíveis, NUNCA descartadas em silêncio

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

  /**
   * Carrega do disco para memória (idempotente; última linha por chave vence).
   *
   * Bloqueador 12 da rechecagem: uma linha JSONL corrompida (truncada por
   * queda no meio da escrita, disco cheio, etc.) era silenciosamente
   * ignorada — o evento correspondente sumia sem deixar rastro nenhum. Agora
   * toda linha corrompida vira uma entrada em `corrupted` (linha, entidade,
   * trecho sanitizado, erro) — visível em `health()`, nunca escondida.
   */
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
            // Sprint 2.3 (bloqueador 6, REPLAY-A): `e.message` de um
            // `SyntaxError` de JSON.parse embute um TRECHO da entrada
            // invalida na propria mensagem (comportamento do V8 atual) —
            // guardar isso bruto reabria exatamente o vazamento que esta
            // estrutura foi desenhada para evitar. `e.name` e' sempre um
            // literal fixo ("SyntaxError"), nunca influenciado pelo
            // conteudo — o hash/tamanho ao lado ja bastam para auditoria.
            error: (e && e.name) || "Error",
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

  /**
   * Grava um registro. Idempotente pela chave natural: mesma chave sobrescreve
   * em memória e acrescenta nova linha no arquivo (histórico preservado).
   * @returns {{ok, action:'inserted'|'updated'|'rejected', errors?}}
   */
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

  /** Saúde do armazenamento — sem esconder falha de I/O nem linha corrompida. */
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
