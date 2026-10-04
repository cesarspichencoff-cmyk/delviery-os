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

/**
 * Códigos de erro de validação cujo sufixo é NOME DE CAMPO — decidível, e o
 * contrato já nomeia chave proibida ao recusar (mesma escolha de
 * `checkEvent`). Os demais códigos podem carregar VALOR do registro
 * (`status_invalido:<valor>`), e valor de registro inválido é exatamente o
 * que não pode ser guardado num diagnóstico.
 */
const ERRO_COM_NOME_DE_CAMPO = new Set([
  "campo_obrigatorio_ausente", "campo_desconhecido", "campo_proibido_pii"
]);

function erroSeguro(e) {
  const s = String(e);
  const i = s.indexOf(":");
  if (i < 0) return s;
  const codigo = s.slice(0, i);
  return ERRO_COM_NOME_DE_CAMPO.has(codigo) ? s : codigo;
}

function createStore(opts) {
  const options = opts || {};
  const dir = options.dir || process.env.CONFERENCE_BRAIN_DATA_DIR || DEFAULT_DIR;
  const memoryOnly = options.memoryOnly === true;
  const mem = new Map();          // entidade -> Map(chave -> registro)
  const failures = [];
  const corrupted = [];           // Sprint 2.2 (Fase 7/12, bloqueador 12): linhas JSONL ilegíveis, NUNCA descartadas em silêncio
  const invalid = [];             // 4B5: linhas legíveis que NÃO passam no schema — quarentena, nunca admissão silenciosa

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
   *
   * 4B5 — a assimetria que faltava: `put()` validava contra o schema e `load()`
   * NÃO. Uma linha sintaticamente válida mas proibida pelo contrato — inclusive
   * uma carregando `customer_name` — entrava inteira na memória no reinício,
   * porque só o caminho de ESCRITA tinha porteiro. O arquivo é editável por
   * fora (correção manual, restauração de backup ruim, versão antiga do
   * código), então "só o put grava" nunca foi garantia do que está no disco.
   *
   * Agora a carga valida com o MESMO `validate()` da escrita, e o que não passa
   * vai para `invalid` em vez da memória. O diagnóstico guarda os códigos de
   * erro, o tamanho e o hash — nunca o conteúdo do registro recusado, que é
   * justamente o que pode estar carregando dado de pessoa.
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
        try {
          const r = JSON.parse(s);
          const v = validate(entity, r);
          if (!v.ok) {
            invalid.push({
              entity, line_number: i + 1, file: f,
              errors: v.errors.map(erroSeguro),
              excerpt_length: s.length, excerpt_hash: sha256(s)
            });
            continue;
          }
          t.set(naturalKey(entity, r), r);
        }
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

  /**
   * Reescreve UMA entidade de forma atômica.
   *
   * É a única exceção deliberada ao append-only normal do store e existe para
   * retenção/compactação. Todos os registros são validados ANTES da troca e o
   * arquivo temporário é relido/validado antes do rename.
   */
  function rewrite(entity, records) {
    // Compactar depois de detectar corrupção/linha inválida apagaria a própria
    // evidência do defeito. Enquanto houver quarentena desta entidade, recusa.
    if (
      corrupted.some((x) => x.entity === entity) ||
      invalid.some((x) => x.entity === entity)
    ) {
      return { ok: false, action: "quarantine_present" };
    }

    const lista = Array.isArray(records) ? records : [];
    const nova = new Map();
    for (const record of lista) {
      const v = validate(entity, record);
      if (!v.ok) return { ok: false, action: "rejected", errors: v.errors };
      nova.set(naturalKey(entity, record), record);
    }

    if (memoryOnly) {
      mem.set(entity, nova);
      return { ok: true, action: "rewritten", records: nova.size };
    }
    if (!ensureDir()) return { ok: false, action: "io_error" };

    const f = fileFor(entity);
    const tmp = f + ".rewrite-" + process.pid + "-" + Date.now() + ".tmp";
    try {
      const corpo = Array.from(nova.values()).map((r) => JSON.stringify(r)).join("\n");
      const fd = fs.openSync(tmp, "w", 0o600);
      try {
        fs.writeFileSync(fd, corpo ? corpo + "\n" : "", "utf8");
        fs.fsyncSync(fd);
      } finally {
        fs.closeSync(fd);
      }

      // Não confiar nem na escrita que acabamos de fazer: reler e validar com
      // o MESMO contrato do put/load antes de substituir o arquivo vigente.
      const linhas = fs.readFileSync(tmp, "utf8").split("\n").filter((s) => s.trim());
      const conferida = new Map();
      for (const s of linhas) {
        const r = JSON.parse(s);
        const v = validate(entity, r);
        if (!v.ok) throw new Error("rewrite_validation_failed");
        conferida.set(naturalKey(entity, r), r);
      }
      if (conferida.size !== nova.size) throw new Error("rewrite_count_mismatch");

      fs.renameSync(tmp, f);
      mem.set(entity, nova);
      return { ok: true, action: "rewritten", records: nova.size };
    } catch (e) {
      try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch (_) { /* melhor esforço */ }
      failures.push({ op: "rewrite:" + entity, error: String((e && e.name) || "Error") });
      return { ok: false, action: "io_error" };
    }
  }

  /**
   * Le o historico append-only de uma entidade sem alterar o estado em memoria.
   * Diferente de `all()`, preserva as versoes validas na ordem do arquivo.
   * `opts.limit` limita a janela devolvida, sem deixar de validar o arquivo inteiro.
   * Linha invalida/corrompida vira diagnostico sanitizado; nunca some em silencio.
   */
  function history(entity, opts) {
    const solicitado = opts && Number.isInteger(opts.limit) ? Number(opts.limit) : null;
    const limit = solicitado === null ? null : Math.max(1, Math.min(solicitado, 1000));
    if (memoryOnly) {
      const atuais = Array.from(table(entity).values());
      return {
        records: limit === null ? atuais : atuais.slice(-limit), complete: false, source: "memory_only",
        corrupted_lines: [], invalid_lines: [], io_failures: []
      };
    }
    const f = fileFor(entity);
    if (!fs.existsSync(f)) {
      return { records: [], complete: true, source: "disk", corrupted_lines: [], invalid_lines: [], io_failures: [] };
    }
    const records = [];
    const corruptedLines = [];
    const invalidLines = [];
    const ioFailures = [];
    try {
      const lines = fs.readFileSync(f, "utf8").split("\n");
      for (let i = 0; i < lines.length; i++) {
        const s = lines[i].trim();
        if (!s) continue;
        try {
          const record = JSON.parse(s);
          const v = validate(entity, record);
          if (!v.ok) {
            invalidLines.push({
              entity, line_number: i + 1, errors: v.errors.map(erroSeguro),
              excerpt_length: s.length, excerpt_hash: sha256(s)
            });
            continue;
          }
          records.push(record);
          if (limit !== null && records.length > limit) records.shift();
        } catch (e) {
          corruptedLines.push({
            entity, line_number: i + 1, error: (e && e.name) || "Error",
            excerpt_length: s.length, excerpt_hash: sha256(s)
          });
        }
      }
    } catch (e) {
      ioFailures.push({ op: "history:" + entity, error: String((e && e.name) || "Error") });
    }
    return {
      records,
      complete: corruptedLines.length === 0 && invalidLines.length === 0 && ioFailures.length === 0,
      source: "disk",
      corrupted_lines: corruptedLines,
      invalid_lines: invalidLines,
      io_failures: ioFailures
    };
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
      corrupted_lines: corrupted.slice(),
      // Separadas de propósito: linha ilegível e linha legível-mas-proibida são
      // falhas de natureza diferente. A primeira é dano físico; a segunda é
      // registro que alguém conseguiu colocar no disco por fora do contrato.
      invalid_lines: invalid.slice()
    };
  }

  return { put, rewrite, get, has, all, count, clear, load, history, health, sha256, dir, fileFor };
}

module.exports = { createStore, sha256, DEFAULT_DIR };
