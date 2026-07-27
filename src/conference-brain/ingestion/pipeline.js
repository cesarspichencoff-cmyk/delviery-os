/* ============================================================================
 * Pipeline de ingestão — desacoplado da fonte.
 * ----------------------------------------------------------------------------
 * Contratos exigidos: observe · normalize · deduplicate · persist · checkpoint ·
 * resume · reportHealth.
 *
 * Propriedades: idempotente · reproduzível · auditável · tolerante a duplicidade ·
 * retomável · preserva o bruto · coloca inconsistente em quarentena.
 *
 * Um ADAPTADOR fornece apenas: { source, collectorVersion, parserVersion,
 * observe() -> [linhas brutas], normalizeRow(row, ctx) -> {order, items, events,...} }.
 * A fundação aceita hoje arquivos históricos e payloads estruturados de teste;
 * o coletor de navegador entra depois pela mesma porta, sem mudar este código.
 * ==========================================================================*/
"use strict";

const crypto = require("crypto");
const { createStore } = require("../storage/store");
const { RECORD_STATUS, ANOMALY_SEVERITY, SOURCE_STATES, CONFIDENCE } = require("../contracts/states");
const dedupe = require("../normalize/dedupe");

function hashOf(v) {
  return crypto.createHash("sha256").update(typeof v === "string" ? v : JSON.stringify(v)).digest("hex");
}

/**
 * @param {object} adapter  fonte (ver cabeçalho)
 * @param {object} [opts]   { store, dryRun, runId, unit, checkpoint }
 */
function createIngestion(adapter, opts) {
  if (!adapter || typeof adapter.observe !== "function" || typeof adapter.normalizeRow !== "function") {
    throw new Error("adapter invalido: precisa de observe() e normalizeRow()");
  }
  const options = opts || {};
  const store = options.store || createStore(options.storeOptions);
  const dryRun = options.dryRun === true;
  const runId = options.runId || (adapter.source + ":" + Date.now());

  const state = {
    run_id: runId,
    source: adapter.source,
    started_at: new Date().toISOString(),
    finished_at: null,
    collector_version: adapter.collectorVersion || "unknown",
    status: "iniciado",
    observed_count: 0,
    normalized_count: 0,
    rejected_count: 0,
    duplicate_count: 0,
    error: null,
    checkpoint: options.checkpoint || null,
    dry_run: dryRun
  };
  const anomalies = [];
  const health = { source_state: SOURCE_STATES.AVAILABLE, missing_fields: new Set(), warnings: 0 };

  /* --- observe ----------------------------------------------------------- */
  function observe() {
    const rows = adapter.observe() || [];
    state.observed_count = rows.length;
    return rows;
  }

  /* --- normalize --------------------------------------------------------- */
  function normalize(row, index) {
    const ctx = {
      observed_at: new Date().toISOString(),
      source: adapter.source,
      unit: options.unit,
      channel: adapter.channel
    };
    let res;
    try { res = adapter.normalizeRow(row, ctx); }
    catch (e) { return { error: "excecao_normalizacao:" + String((e && e.message) || e) }; }
    if (!res || !res.order || !res.order.order_id) return { error: "pedido_sem_id" };
    (res.missing_fields || []).forEach((f) => health.missing_fields.add(f));
    if (res.warnings && res.warnings.length) health.warnings += res.warnings.length;
    res.index = index;
    return res;
  }

  /* --- deduplicate ------------------------------------------------------- */
  function deduplicate(order) {
    const existing = store.get("orders", order.order_id);
    if (!existing) return { duplicate: false, record: order };
    const resolution = dedupe.resolve(existing, order);
    const merged = dedupe.merge(resolution.winner, resolution.loser);
    const anomaly = dedupe.toAnomaly(order.order_id, resolution, runId);
    anomalies.push(anomaly);
    state.duplicate_count++;
    return { duplicate: true, record: merged, resolution, anomaly };
  }

  /* --- persist ----------------------------------------------------------- */
  function persist(entity, record) {
    if (dryRun) return { ok: true, action: "dry_run" };
    const r = store.put(entity, record);
    if (!r.ok) {
      state.rejected_count++;
      anomalies.push({
        anomaly_id: "rej:" + entity + ":" + (record.order_id || record.record_id || Math.random().toString(36).slice(2)),
        type: "registro_rejeitado_por_schema",
        severity: ANOMALY_SEVERITY.ERROR,
        run_id: runId,
        description: "Registro rejeitado: " + (r.errors || []).join(", "),
        evidence: { entity, errors: r.errors },
        status: "quarentena",
        detected_at: new Date().toISOString()
      });
    }
    return r;
  }

  /** Guarda o bruto (L0) com hash — evidência do que foi observado. */
  function persistRaw(row, index) {
    const payloadHash = hashOf(row);
    const rec = {
      record_id: runId + "#" + index,
      run_id: runId,
      source: adapter.source,
      observed_at: new Date().toISOString(),
      external_id: String(row.oid || row.order_id || row.id || ""),
      type: "order_row",
      payload_hash: payloadHash,
      parser_version: adapter.parserVersion || "unknown",
      status: RECORD_STATUS.PENDING,
      raw: options.keepRaw === false ? undefined : row
    };
    if (rec.raw === undefined) delete rec.raw;
    persist("ingestion_raw_records", rec);
    return rec;
  }

  /* --- checkpoint / resume ----------------------------------------------- */
  function checkpoint(value) { state.checkpoint = value; return state.checkpoint; }
  function resume(fromCheckpoint) { state.checkpoint = fromCheckpoint || state.checkpoint; return state.checkpoint; }

  /* --- reportHealth ------------------------------------------------------ */
  function reportHealth() {
    const missing = Array.from(health.missing_fields);
    // Fonte que não observa "pronto"/"saiu" é PARCIAL por definição: não dá
    // para afirmar estado operacional confiante sobre ela.
    let sourceState = health.source_state;
    if (missing.includes("ready_at") || missing.includes("dispatched_at")) {
      sourceState = SOURCE_STATES.PARTIAL;
    }
    if (state.status === "falhou") sourceState = SOURCE_STATES.UNAVAILABLE;
    const divergent = anomalies.filter((a) => a.type === "duplicidade_com_divergencia").length;
    if (divergent > 0 && sourceState === SOURCE_STATES.AVAILABLE) sourceState = SOURCE_STATES.INCONSISTENT;
    return {
      run_id: runId,
      source: adapter.source,
      source_state: sourceState,
      missing_fields: missing,
      warnings: health.warnings,
      anomalies: anomalies.length,
      divergent_duplicates: divergent,
      confidence: sourceState === SOURCE_STATES.AVAILABLE ? CONFIDENCE.HIGH
        : sourceState === SOURCE_STATES.PARTIAL ? CONFIDENCE.MEDIUM : CONFIDENCE.LOW,
      counts: {
        observed: state.observed_count, normalized: state.normalized_count,
        duplicates: state.duplicate_count, rejected: state.rejected_count
      }
    };
  }

  /** Executa a ingestão inteira. Nunca lança: falha vira status + anomalia. */
  function run() {
    try {
      const rows = observe();
      const startAt = state.checkpoint && Number.isInteger(state.checkpoint.index) ? state.checkpoint.index : 0;
      for (let i = startAt; i < rows.length; i++) {
        persistRaw(rows[i], i);
        const res = normalize(rows[i], i);
        if (res.error) {
          state.rejected_count++;
          anomalies.push({
            anomaly_id: "norm:" + runId + "#" + i,
            type: "falha_normalizacao", severity: ANOMALY_SEVERITY.WARNING, run_id: runId,
            description: res.error, evidence: { index: i }, status: "quarentena",
            detected_at: new Date().toISOString()
          });
          continue;
        }
        const dd = deduplicate(res.order);
        persist("orders", dd.record);
        for (const it of res.items || []) persist("order_items", it);
        for (const ev of res.events || []) persist("order_status_events", ev);
        state.normalized_count++;
        checkpoint({ index: i + 1, order_id: res.order.order_id });
      }
      state.status = "concluido";
    } catch (e) {
      state.status = "falhou";
      state.error = String((e && e.message) || e);
    }
    state.finished_at = new Date().toISOString();
    if (!dryRun) store.put("ingestion_runs", state);
    for (const a of anomalies) persist("ingestion_anomalies", a);
    return { run: Object.assign({}, state), health: reportHealth(), anomalies: anomalies.slice(), store };
  }

  return { observe, normalize, deduplicate, persist, checkpoint, resume, reportHealth, run, store, state };
}

module.exports = { createIngestion, hashOf };
