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
const PiiGuard = require("./pii-guard");

const DEFAULT_DIR = path.join(__dirname, "..", "..", "..", "data", "conference-brain", "live-evidence");

function sha256(v) { return crypto.createHash("sha256").update(v).digest("hex"); }

/**
 * Registro de evidência de UM ciclo — nunca o HTML/imagem bruta, só o que foi
 * derivado dela (hash, metadados, assinatura estrutural, seletor usado).
 * `screenshotPath` é opcional e, quando presente, fica fora do Git por
 * construção (ver `ensureEvidenceDir`, que nunca escreve dentro do repositório
 * versionado quando chamado com o diretório padrão).
 *
 * Sprint 2.3 (bloqueador 1, item PII-C da rechecagem): além do excerto
 * redigido por token, o registro carrega `diagnostic_excerpt_hash` — a
 * rechecagem exigiu estrutura auditável (hash/tamanho/redigido) mesmo quando
 * o excerto inteiro sobrevive redigido; nunca "some" em silêncio.
 */
function buildEvidenceRecord(opts) {
  const o = opts || {};
  const rawExcerpt = o.diagnosticExcerpt ? String(o.diagnosticExcerpt).slice(0, 500) : null;
  return {
    run_id: o.runId || null,
    cycle_id: o.cycleId || null,
    captured_at: o.capturedAt || new Date().toISOString(),
    layout_signature_hash: o.signatureHash || null,
    diagnostic_excerpt: rawExcerpt ? sanitizeExcerpt(rawExcerpt) : null,
    diagnostic_excerpt_hash: rawExcerpt ? sha256(rawExcerpt) : null,
    screenshot_path: o.screenshotPath || null,
    screenshot_sanitized: o.screenshotPath ? Boolean(o.screenshotSanitized) : null,
    retention_days: o.retentionDays || 7,
    expires_at: new Date(Date.now() + (o.retentionDays || 7) * 86400000).toISOString()
  };
}

/**
 * Camada 4 de defesa em profundidade (Fase 1, Sprint 2.2 · corrigida no
 * Sprint 2.3, bloqueador 1/PII-C). A versão anterior era BLOCKLIST: suprimia
 * só os formatos previstos (número, e-mail, telefone, "duas+ palavras
 * capitalizadas"). A rechecagem provou o buraco clássico de blocklist: nome
 * minúsculo ("joao silva") e nome em outro alfabeto ("李明") não batem com
 * NENHUM desses formatos e passavam brutos. Corrigido para ALLOWLIST por
 * TOKEN via `pii-guard.js#sanitizeFreeText` — a mesma disciplina já usada em
 * `mapping-mode.js`, sem depender de forma de nome (maiúscula/latina) como
 * critério: só sobrevive literal a palavra que bate INTEIRA com vocabulário
 * funcional conhecido; qualquer outra, em qualquer script, vira marcador.
 */
function sanitizeExcerpt(text) {
  return PiiGuard.sanitizeFreeText(String(text).slice(0, 500));
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
