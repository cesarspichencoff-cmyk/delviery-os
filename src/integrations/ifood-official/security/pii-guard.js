/* ============================================================================
 * Guard de PII e segurança — independente do `conference-brain/live/pii-guard.js`
 * (mesmo princípio comprovado, reimplementado sem nenhum require cruzado).
 * ----------------------------------------------------------------------------
 * ALLOWLIST, nunca blocklist: um token de texto livre só sobrevive literal
 * se bater INTEIRO com vocabulário funcional conhecido (os `code`s de
 * evento e status desta integração); qualquer outro token — em qualquer
 * script, maiúsculo ou minúsculo — vira marcador de posição fixo. Nunca
 * usa forma de nome (capitalização) como critério.
 * ==========================================================================*/
"use strict";

const crypto = require("crypto");
const { CODE_MAP } = require("../receivers/payload-mapper");
const { ORDER_STATUS } = require("../contracts/order-snapshot");
const { NEGOTIATION_ACTION_TYPES } = require("../contracts/negotiation");
const { PACKAGING_CAPABILITY_STATE } = require("../contracts/packaging");

function sha256(v) { return crypto.createHash("sha256").update(String(v)).digest("hex").slice(0, 16); }

/** Vocabulário funcional conhecido — literais fixos, nunca regex de forma de nome. */
const KNOWN_TOKENS = new Set([
  ...Object.keys(CODE_MAP), ...Object.values(CODE_MAP),
  ...Object.values(ORDER_STATUS), ...Object.values(NEGOTIATION_ACTION_TYPES),
  ...Object.values(PACKAGING_CAPABILITY_STATE),
  "webhook", "polling", "simulator"
].map((s) => String(s).toLowerCase()));

function isKnownSafeToken(token) {
  return KNOWN_TOKENS.has(String(token || "").toLowerCase());
}

/**
 * Sanitiza texto livre por TOKEN — preserva vocabulário conhecido literal,
 * substitui qualquer outro token (nome de pessoa, endereço, telefone,
 * observação de cliente — em qualquer script) por um marcador fixo. Nunca
 * lança; string vazia entra, string vazia sai.
 */
function sanitizeFreeText(text) {
  const s = String(text == null ? "" : text);
  return s.replace(/\S+/g, (tok) => {
    const bare = tok.replace(/^[^\p{L}\p{N}]+/u, "").replace(/[^\p{L}\p{N}]+$/u, "");
    if (!bare) return tok; // pontuação isolada -- estruturalmente inerte
    return isKnownSafeToken(bare) ? tok : "[token-suprimido]";
  });
}

/** Classifica um valor de string: retorna literal se conhecido, ou marcador auditável. */
function sanitizeValue(value, category) {
  const s = String(value == null ? "" : value);
  if (isKnownSafeToken(s)) return s;
  return { redacted: true, text_category: category || "unknown_text", text_length: s.length, text_hash: sha256(s) };
}

/** Chaves de campo que NUNCA podem aparecer em log/diagnóstico, mesmo que o valor pareça inofensivo. */
const SENSITIVE_KEY_PATTERN = /(name|nome|phone|telefone|address|endereco|note|nota|observ|token|secret|segredo|cookie|senha|password)/i;

/**
 * Redige um objeto arbitrário para log/diagnóstico: chave sensível nunca
 * aparece (nem o valor, nem um hash dele -- o próprio NOME do campo já é
 * informação demais para um log); string livre em campo não-sensível passa
 * por `sanitizeValue`. Nunca lança; profundidade limitada.
 */
function redactForLog(value, depth) {
  const d = depth || 0;
  if (d > 6) return "[profundidade-maxima]";
  if (value == null || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") return sanitizeValue(value, "log_text");
  if (Array.isArray(value)) return value.map((v) => redactForLog(v, d + 1));
  if (typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (SENSITIVE_KEY_PATTERN.test(k)) { out[k] = "[campo-sensivel-omitido]"; continue; }
      out[k] = redactForLog(v, d + 1);
    }
    return out;
  }
  return sanitizeValue(String(value), "log_text");
}

module.exports = { isKnownSafeToken, sanitizeFreeText, sanitizeValue, redactForLog, sha256, KNOWN_TOKENS };
