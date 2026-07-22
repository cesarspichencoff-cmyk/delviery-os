/* ============================================================================
 * Guard de PII — sanitização por ALLOWLIST (Sprint 2.2, Fase 1).
 * ----------------------------------------------------------------------------
 * A rechecagem independente do Sprint 2.1 encontrou um vazamento real:
 * `mapping-mode.js` sanitizava por BLOCKLIST (rejeitava só texto contendo
 * palavras como "telefone"/"nome") — um nome de pessoa qualquer ("Joao
 * Silva") passava direto, porque não continha nenhuma das palavras
 * proibidas. Blocklist nunca cobre o que não foi previsto.
 *
 * Este módulo inverte a lógica: só passa o que é RECONHECIDO como vocabulário
 * funcional conhecido (os mesmos padrões que `status-map.js` e
 * `multidimensional-observation.js` já usam para mapear dimensões — nada
 * duplicado, tudo reexportado de lá). Qualquer texto que não bata com um
 * padrão conhecido é tratado como potencialmente sensível e nunca sai em
 * forma bruta — vira categoria + comprimento + hash.
 *
 * Aplicado em profundidade: captura (mapping-mode.js), evidência
 * (evidence.js), e qualquer serialização de erro que passe por `sanitizeDeep`.
 * ==========================================================================*/
"use strict";

const crypto = require("crypto");
const { RAW_TEXT_MAP } = require("./status-map");
const {
  LAYOUT_MODE_TEXT_MAP, VISUAL_LOCATION_TEXT_MAP, ORDER_STATE_TEXT_MAP,
  COURIER_STATE_TEXT_MAP, DISPATCH_STATE_TEXT_MAP, COMPLETION_TEXT_MAP,
  FULFILLMENT_TEXT_MAP, NOTIFY_LABEL_RE, CONFIRMED_NOTIFICATION_RE
} = require("./multidimensional-observation");
const { ACTIONS } = require("./operator-panel");

/** Rótulos literais do painel interno (Iniciar, Aguardando item, ...) — vocabulário nosso, não do iFood. */
const PANEL_ACTION_LABELS = new Set(Object.values(ACTIONS).map((a) => a.label.toLowerCase()));

/** Todos os padrões de vocabulário funcional já usados para mapear dimensões — nenhum novo, tudo reutilizado. */
const KNOWN_PATTERNS = [
  ...RAW_TEXT_MAP.map(([re]) => re),
  ...LAYOUT_MODE_TEXT_MAP.map(([re]) => re),
  ...VISUAL_LOCATION_TEXT_MAP.map(([re]) => re),
  ...ORDER_STATE_TEXT_MAP.map(([re]) => re),
  ...COURIER_STATE_TEXT_MAP.map(([re]) => re),
  ...DISPATCH_STATE_TEXT_MAP.map(([re]) => re),
  ...COMPLETION_TEXT_MAP.map(([re]) => re),
  ...FULFILLMENT_TEXT_MAP.map(([re]) => re),
  NOTIFY_LABEL_RE, CONFIRMED_NOTIFICATION_RE,
  // status brutos já provados seguros no relatório histórico do Sprint 1
  /^(concluded|cancelled|declined|concluido|cancelado|recusado)$/i
];

/** Um texto curto bate com vocabulário funcional conhecido? Allowlist, nunca blocklist. */
function isKnownSafeText(text) {
  const s = String(text || "").trim();
  if (!s) return false;
  if (PANEL_ACTION_LABELS.has(s.toLowerCase())) return true;
  return KNOWN_PATTERNS.some((re) => re.test(s));
}

function sha256(v) { return crypto.createHash("sha256").update(String(v)).digest("hex").slice(0, 16); }

/**
 * Sanitiza um texto curto: se é vocabulário funcional conhecido, devolve o
 * texto (é seguro — é rótulo de status/ação, não dado de pessoa). Caso
 * contrário, NUNCA devolve o texto bruto — devolve um marcador sanitizado.
 * Em caso de dúvida (padrão desconhecido), a decisão é sempre não persistir
 * o valor original.
 */
function sanitizeText(text, category) {
  const s = String(text == null ? "" : text);
  if (isKnownSafeText(s)) return s;
  return {
    redacted: true,
    text_category: category || "unknown_text",
    text_length: s.length,
    text_hash: sha256(s)
  };
}

/** Um valor já é um marcador sanitizado (não precisa sanitizar de novo)? */
function isRedactedMarker(v) {
  return Boolean(v) && typeof v === "object" && v.redacted === true;
}

/**
 * Sanitização recursiva para objetos/arrays arbitrários (ex.: payload de erro
 * que por engano carregue um trecho de observação do cliente). Strings que
 * batem com CHAVES conhecidas por serem seguras (ids, contadores, enums já
 * validados) podem ser preservadas via `safeKeys`; todo o resto de string
 * passa pelo mesmo `sanitizeText`. Nunca lança — pior caso, sanitiza demais.
 */
function sanitizeDeep(value, opts) {
  const o = opts || {};
  const safeKeys = o.safeKeys || new Set();
  const category = o.category || "unknown_text";
  const depth = o.depth || 0;
  if (depth > 6) return sanitizeText(String(value), category); // nunca desce infinitamente

  if (value == null || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") return sanitizeText(value, category);
  if (Array.isArray(value)) return value.map((v) => sanitizeDeep(v, Object.assign({}, o, { depth: depth + 1 })));
  if (typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (safeKeys.has(k) && typeof v === "string") { out[k] = v; continue; }
      out[k] = sanitizeDeep(v, Object.assign({}, o, { depth: depth + 1 }));
    }
    return out;
  }
  return sanitizeText(String(value), category);
}

module.exports = { isKnownSafeText, sanitizeText, isRedactedMarker, sanitizeDeep, sha256, KNOWN_PATTERNS };
