/* ============================================================================
 * Evidência e proteção de privacidade (Sprint 2, Fase 9).
 * ----------------------------------------------------------------------------
 * Toda evidência de diagnóstico é: sanitizada, opcional, fora do Git, e com
 * retenção limitada. Screenshot é o último recurso — a assinatura estrutural
 * (mapping-mode.js) já cobre a maior parte do diagnóstico sem imagem nenhuma.
 * ==========================================================================*/
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DEFAULT_DIR = path.join(__dirname, "..", "..", "..", "data", "conference-brain", "live-evidence");

function sha256(v) { return crypto.createHash("sha256").update(v).digest("hex"); }

/**
 * Registro de evidência de UM ciclo — nunca o HTML/imagem bruta, só o que foi
 * derivado dela (hash, metadados, assinatura estrutural, seletor usado).
 * `screenshotPath` é opcional e, quando presente, fica fora do Git por
 * construção (ver `ensureEvidenceDir`, que nunca escreve dentro do repositório
 * versionado quando chamado com o diretório padrão).
 */
function buildEvidenceRecord(opts) {
  const o = opts || {};
  return {
    run_id: o.runId || null,
    cycle_id: o.cycleId || null,
    captured_at: o.capturedAt || new Date().toISOString(),
    layout_signature_hash: o.signatureHash || null,
    diagnostic_excerpt: o.diagnosticExcerpt ? sanitizeExcerpt(o.diagnosticExcerpt) : null,
    screenshot_path: o.screenshotPath || null,
    screenshot_sanitized: o.screenshotPath ? Boolean(o.screenshotSanitized) : null,
    retention_days: o.retentionDays || 7,
    expires_at: new Date(Date.now() + (o.retentionDays || 7) * 86400000).toISOString()
  };
}

/** Remove trechos que pareçam telefone, e-mail, CPF ou nome vinculado a "cliente"/"nome". */
function sanitizeExcerpt(text) {
  return String(text)
    .replace(/\b\d{2,3}[.\s]?\d{3}[.\s]?\d{3}[-.\s]?\d{0,2}\b/g, "[numero-suprimido]")
    .replace(/\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g, "[email-suprimido]")
    .replace(/\(?\d{2}\)?\s?\d{4,5}-?\d{4}/g, "[telefone-suprimido]")
    .slice(0, 500); // trecho mínimo — nunca o documento inteiro
}

function ensureEvidenceDir(dir) {
  const target = dir || DEFAULT_DIR;
  try { fs.mkdirSync(target, { recursive: true }); return { ok: true, dir: target }; }
  catch (e) { return { ok: false, dir: target, error: String((e && e.message) || e) }; }
}

/** Remove evidências cujo `expires_at` já passou. Nunca lança. */
function purgeExpired(records, now) {
  const t = now || Date.now();
  const kept = [], purged = [];
  for (const r of records || []) {
    if (r.expires_at && Date.parse(r.expires_at) < t) purged.push(r); else kept.push(r);
  }
  return { kept, purged };
}

module.exports = { DEFAULT_DIR, buildEvidenceRecord, sanitizeExcerpt, ensureEvidenceDir, purgeExpired, sha256 };
