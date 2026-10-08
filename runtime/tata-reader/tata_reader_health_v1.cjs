"use strict";
/**
 * Saude REAL do TATA Comanda Reader — "servico RUNNING" nao e prova.
 * ============================================================================
 * Em 05/10/2026 o servico estava RUNNING, os dois processos vivos e a sessao
 * SQL "sleeping"; a ultima leitura real era de 21:55:51. Todo sinal de
 * existencia dizia "saudavel" e nenhum sinal de PROGRESSO foi olhado.
 *
 * Este avaliador so aceita progresso como prova de saude:
 *   - o heartbeat do supervisor (vivo e recente);
 *   - o ultimo lote bem-sucedido (dado lido de verdade, recente);
 *   - o checkpoint do watcher (gravado a cada poll bem-sucedido).
 * O status do host e o do consumidor sombra so podem PIORAR o veredito, nunca
 * melhora-lo. Ausencia de sinal nunca vira saudavel.
 *
 * Funcao pura: o chamador fornece os documentos ja lidos e o "agora" — no
 * mesmo relogio da maquina que gravou os arquivos (o relogio da CAIXA ja
 * divergiu do relogio da conversa; comparar entre maquinas e erro).
 *
 * Vocabulario de saida = vocabulario canonico do observador de saude de fonte
 * do produto (saudavel | parcial | stale | indisponivel).
 */

const HEALTH_SCHEMA = "deliveryos.tata-reader-health.v1";
const HEARTBEAT_SCHEMA = "deliveryos.tata-reader-heartbeat.v1";
const HOST_SCHEMAS = new Set([
  "deliveryos.tata-reader-continuous-host-status.v1",
  "deliveryos.tata-reader-continuous-host-status.v2",
]);
const CONSUMER_SCHEMA = "deliveryos.live-shadow-consumer-status.v1";

/** Sem cadencia declarada (watcher v1 sem supervisor): poll de ~3 s. */
const LEGACY_CHECKPOINT_STALE_SECONDS = 90;

const VERDICTS = Object.freeze(["HEALTHY", "DEGRADED", "STALLED", "DOWN", "FATAL", "UNKNOWN"]);
const SOURCE_STATE = Object.freeze({
  HEALTHY: "saudavel",
  DEGRADED: "parcial",
  STALLED: "stale",
  DOWN: "indisponivel",
  FATAL: "indisponivel",
  UNKNOWN: "indisponivel",
});
const EXIT_CODE = Object.freeze({ HEALTHY: 0, DEGRADED: 1, STALLED: 2, DOWN: 2, FATAL: 2, UNKNOWN: 3 });

function isObj(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}
function parseInstant(v) {
  if (typeof v !== "string" || !v.trim()) return null;
  const ms = Date.parse(v);
  return Number.isFinite(ms) ? ms : null;
}
function age(nowMs, thenMs) {
  if (thenMs === null || thenMs === undefined || !Number.isFinite(thenMs)) return null;
  return Math.round((nowMs - thenMs) / 1000);
}
function posInt(v, fallback) {
  return Number.isInteger(v) && v > 0 ? v : fallback;
}

/**
 * Limiares derivados da cadencia DECLARADA no heartbeat — nunca de um numero
 * magico do avaliador. Cada um pode ser sobrescrito explicitamente.
 */
function thresholdsFrom(heartbeat, override = {}) {
  const c = isObj(heartbeat?.cadence) ? heartbeat.cadence : {};
  const poll = posInt(c.poll_seconds, 3);
  const batchSeconds = posInt(c.expected_batch_seconds, poll * 60);
  const hbEvery = posInt(c.heartbeat_every_seconds, 5);
  const stall = posInt(c.progress_stall_seconds, 3 * poll + 30);
  const backoff = posInt(c.max_backoff_seconds, 60);
  const t = {
    // O supervisor grava heartbeat a cada `heartbeat_every_seconds` durante
    // lote e durante backoff; tres batidas perdidas = processo calado.
    heartbeat_silent_after_s: Math.max(3 * hbEvery, 30),
    // Um lote leva `expected_batch_seconds`; com margem de um lote inteiro,
    // do tempo de deteccao de parada e de um backoff maximo.
    data_stale_after_s: 2 * batchSeconds + stall + backoff,
    // O checkpoint e gravado a cada poll bem-sucedido.
    checkpoint_stale_after_s: stall + backoff + 30,
  };
  return { ...t, ...override };
}

function verdict(v, reasons, extra) {
  return Object.freeze({
    schema: HEALTH_SCHEMA,
    verdict: v,
    source_state: SOURCE_STATE[v],
    exit_code: EXIT_CODE[v],
    reasons: Object.freeze([...reasons]),
    ...extra,
  });
}

/**
 * @param {object} input
 * @param {number} input.nowMs                 relogio da maquina que gravou os arquivos
 * @param {object|null} input.heartbeat        reader-heartbeat-v1.json (ou null)
 * @param {object|null} [input.hostStatus]     continuous-host-status.json (ou null)
 * @param {object|null} [input.consumerStatus] shadow-consumer-status.json (ou null)
 * @param {number|null} [input.checkpointMtimeMs] mtime do checkpoint do watcher
 * @param {object} [input.thresholds]          sobrescrita explicita dos limiares
 */
function evaluateTataReaderHealthV1(input) {
  if (!isObj(input) || !Number.isFinite(input.nowMs)) throw new Error("HEALTH_INPUT_NOW_REQUIRED");
  const { nowMs } = input;
  const hb = input.heartbeat ?? null;
  const host = input.hostStatus ?? null;
  const consumer = input.consumerStatus ?? null;
  const ckMs = Number.isFinite(input.checkpointMtimeMs) ? input.checkpointMtimeMs : null;

  const reasons = [];
  const ages = {
    heartbeat_s: null,
    last_success_s: null,
    checkpoint_s: age(nowMs, ckMs),
    host_status_s: null,
  };
  const evidence = {
    heartbeat_state: null,
    host_state: null,
    consumer_state: null,
    consecutive_failures: null,
    last_batch_outcome: null,
    last_error_class: null,
    watcher_sha256_verified: null,
  };

  // O host so pode piorar o veredito: RUNNING e o estado que mentiu em 05/10.
  let hostDown = false;
  if (host !== null) {
    if (!isObj(host) || !HOST_SCHEMAS.has(host.schema)) {
      reasons.push("HOST_STATUS_SCHEMA_INVALID");
    } else {
      evidence.host_state = String(host.state ?? "");
      ages.host_status_s = age(nowMs, parseInstant(host.updated_at));
      if (evidence.host_state !== "RUNNING") {
        hostDown = true;
        reasons.push(`HOST_STATE_${evidence.host_state || "EMPTY"}`);
      }
    }
  }
  let consumerFailed = false;
  if (consumer !== null) {
    if (!isObj(consumer) || consumer.schema !== CONSUMER_SCHEMA) {
      reasons.push("CONSUMER_STATUS_SCHEMA_INVALID");
    } else {
      evidence.consumer_state = String(consumer.state ?? "");
      if (evidence.consumer_state === "FAILED") {
        consumerFailed = true;
        reasons.push("CONSUMER_FAILED");
      }
    }
  }

  const extra = () => ({ ages_seconds: Object.freeze({ ...ages }), evidence: Object.freeze({ ...evidence }) });

  // ---- sem heartbeat: watcher legado (v1 direto no host) ou supervisor ausente
  if (hb === null) {
    reasons.push("HEARTBEAT_MISSING");
    if (hostDown) return verdict("DOWN", reasons, extra());
    const legacyStale = (input.thresholds?.checkpoint_stale_after_s) ?? LEGACY_CHECKPOINT_STALE_SECONDS;
    if (ages.checkpoint_s !== null && ages.checkpoint_s > legacyStale) {
      reasons.push("CHECKPOINT_STALE");
      return verdict("STALLED", reasons, extra());
    }
    if (ages.checkpoint_s === null) reasons.push("CHECKPOINT_UNOBSERVED");
    // Checkpoint recente sem heartbeat: ha progresso, mas sem prova de
    // cadencia nem de erro — o maximo honesto e "parcial".
    if (ages.checkpoint_s !== null) return verdict("DEGRADED", reasons, extra());
    return verdict("UNKNOWN", reasons, extra());
  }

  if (!isObj(hb) || hb.schema !== HEARTBEAT_SCHEMA) {
    reasons.push("HEARTBEAT_SCHEMA_INVALID");
    return verdict(hostDown ? "DOWN" : "UNKNOWN", reasons, extra());
  }

  const t = thresholdsFrom(hb, input.thresholds);
  evidence.heartbeat_state = String(hb.state ?? "");
  evidence.consecutive_failures = Number.isInteger(hb.consecutive_failures) ? hb.consecutive_failures : null;
  evidence.last_batch_outcome = isObj(hb.last_batch) ? hb.last_batch.outcome ?? null : null;
  evidence.last_error_class = isObj(hb.last_batch) ? hb.last_batch.error_class ?? null : null;
  evidence.watcher_sha256_verified = hb.watcher?.sha256_verified === true;
  ages.heartbeat_s = age(nowMs, parseInstant(hb.written_at));
  ages.last_success_s = age(nowMs, parseInstant(hb.last_success_at));

  if (ages.heartbeat_s !== null && ages.heartbeat_s < -120) {
    // Heartbeat "do futuro" alem de dois minutos: relogio trocado. Nao se
    // decide saude sobre relogio que nao se pode confiar.
    reasons.push("HEARTBEAT_FROM_FUTURE_CLOCK_MISMATCH");
    return verdict("UNKNOWN", reasons, { ...extra(), thresholds: t });
  }
  if (evidence.heartbeat_state === "FATAL") {
    reasons.push(`FATAL_${String(hb.fatal ?? "UNSPECIFIED")}`);
    return verdict("FATAL", reasons, { ...extra(), thresholds: t });
  }
  if (evidence.heartbeat_state === "STOPPED") {
    reasons.push("SUPERVISOR_STOPPED");
    return verdict("DOWN", reasons, { ...extra(), thresholds: t });
  }
  if (hostDown) return verdict("DOWN", reasons, { ...extra(), thresholds: t });
  if (ages.heartbeat_s === null || ages.heartbeat_s > t.heartbeat_silent_after_s) {
    reasons.push("SUPERVISOR_SILENT");
    return verdict("STALLED", reasons, { ...extra(), thresholds: t });
  }
  if (!evidence.watcher_sha256_verified) reasons.push("WATCHER_SHA256_NOT_VERIFIED");

  if (ages.last_success_s === null) {
    if ((evidence.consecutive_failures ?? 0) > 0) {
      reasons.push("NO_SUCCESSFUL_BATCH_YET");
      reasons.push(`LAST_ERROR_${evidence.last_error_class ?? "UNKNOWN"}`);
      return verdict("DEGRADED", reasons, { ...extra(), thresholds: t });
    }
    reasons.push("STARTING_NO_BATCH_COMPLETED");
    return verdict("DEGRADED", reasons, { ...extra(), thresholds: t });
  }
  if (ages.last_success_s > t.data_stale_after_s) {
    reasons.push("DATA_STALE");
    if (evidence.last_error_class) reasons.push(`LAST_ERROR_${evidence.last_error_class}`);
    return verdict("STALLED", reasons, { ...extra(), thresholds: t });
  }
  if (ages.checkpoint_s !== null && ages.checkpoint_s > t.checkpoint_stale_after_s) {
    reasons.push("CHECKPOINT_STALE");
    return verdict("STALLED", reasons, { ...extra(), thresholds: t });
  }
  if (ages.checkpoint_s === null) reasons.push("CHECKPOINT_UNOBSERVED");
  if ((evidence.consecutive_failures ?? 0) > 0) {
    reasons.push("RECENT_FAILURES");
    if (evidence.last_error_class) reasons.push(`LAST_ERROR_${evidence.last_error_class}`);
    return verdict("DEGRADED", reasons, { ...extra(), thresholds: t });
  }
  if (consumerFailed || !evidence.watcher_sha256_verified || ages.checkpoint_s === null) {
    return verdict("DEGRADED", reasons, { ...extra(), thresholds: t });
  }
  return verdict("HEALTHY", reasons, { ...extra(), thresholds: t });
}

// ------------------------------------------- leitura dos arquivos (E/S) ----
// No Windows, File.Replace (ReplaceFile) sao dois renames: alvo -> backup,
// temporario -> alvo. Entre eles o caminho NAO existe. existsSync seguido de
// statSync/readFileSync cai nessa janela: o stat lancava (o CLI morria com
// pilha no stderr, a rota /api/fontes respondia 500 com o caminho local) e o
// existsSync falso virava "sinal ausente" (DOWN espurio). Agora cada leitura
// tenta de novo, com pausa curta, e so entao decide: ausente = sinal ausente
// (null); presente e ilegivel = sinal invalido; nunca lanca.
const READ_ATTEMPTS = 3;
const READ_PAUSE_MS = 15;

function sleepSync(ms) {
  if (ms > 0) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function readSignalDoc(p, opts = {}) {
  if (!p) return null;
  const fsImpl = opts.fs || require("node:fs");
  const attempts = opts.attempts || READ_ATTEMPTS;
  const pauseMs = opts.pauseMs ?? READ_PAUSE_MS;
  let last = "ABSENT";
  for (let i = 0; i < attempts; i++) {
    if (i > 0) sleepSync(pauseMs);
    let text;
    try {
      text = fsImpl.readFileSync(p, "utf8");
    } catch (e) {
      last = e && e.code === "ENOENT" ? "ABSENT" : "UNREADABLE";
      continue;
    }
    try {
      return JSON.parse(String(text).replace(/^\uFEFF/, ""));
    } catch {
      last = "UNREADABLE";
    }
  }
  return last === "ABSENT" ? null : { schema: "UNREADABLE" };
}

function readMtimeMs(p, opts = {}) {
  if (!p) return null;
  const fsImpl = opts.fs || require("node:fs");
  const attempts = opts.attempts || READ_ATTEMPTS;
  const pauseMs = opts.pauseMs ?? READ_PAUSE_MS;
  for (let i = 0; i < attempts; i++) {
    if (i > 0) sleepSync(pauseMs);
    try {
      const m = fsImpl.statSync(p).mtimeMs;
      if (Number.isFinite(m)) return m;
    } catch {
      // janela da troca, ausente ou sem acesso: tenta de novo
    }
  }
  return null;
}

module.exports = {
  HEALTH_SCHEMA,
  HEARTBEAT_SCHEMA,
  VERDICTS,
  SOURCE_STATE,
  LEGACY_CHECKPOINT_STALE_SECONDS,
  READ_ATTEMPTS,
  READ_PAUSE_MS,
  thresholdsFrom,
  evaluateTataReaderHealthV1,
  readSignalDoc,
  readMtimeMs,
};

// ------------------------------------------------------------------ CLI ----
// node tata_reader_health_v1.cjs [--heartbeat p] [--host-status p]
//   [--consumer-status p] [--checkpoint p] [--now ISO]
// Saida: JSON do veredito; codigo 0 HEALTHY, 1 DEGRADED, 2 STALLED/DOWN/FATAL,
// 3 UNKNOWN. Arquivo ausente = sinal ausente (nunca erro silencioso); arquivo
// presente e ilegivel = sinal invalido.
if (require.main === module) {
  const fs = require("node:fs");
  const args = process.argv.slice(2);
  const opt = {};
  for (let i = 0; i < args.length; i += 2) {
    const k = args[i];
    const v = args[i + 1];
    if (!k || !k.startsWith("--") || v === undefined) {
      console.error("USO: --heartbeat <p> --host-status <p> --consumer-status <p> --checkpoint <p> [--now ISO]");
      process.exit(64);
    }
    opt[k.slice(2)] = v;
  }
  const readDoc = (p) => readSignalDoc(p, { fs });
  const nowMs = opt.now ? Date.parse(opt.now) : Date.now();
  if (!Number.isFinite(nowMs)) {
    console.error("NOW_INVALID");
    process.exit(64);
  }
  const ck = readMtimeMs(opt.checkpoint, { fs });
  const r = evaluateTataReaderHealthV1({
    nowMs,
    heartbeat: readDoc(opt.heartbeat),
    hostStatus: opt["host-status"] ? readDoc(opt["host-status"]) : null,
    consumerStatus: opt["consumer-status"] ? readDoc(opt["consumer-status"]) : null,
    checkpointMtimeMs: ck,
  });
  process.stdout.write(JSON.stringify({ ...r, evaluated_at: new Date(nowMs).toISOString() }, null, 2) + "\n");
  process.exit(r.exit_code);
}
