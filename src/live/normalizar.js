/* ============================================================================
 * DeliveryOS · src/live · NORMALIZAR
 * ----------------------------------------------------------------------------
 * Normalização de texto, hash canônico de itens e vocabulário canônico de
 * change_mode. Nunca inventa dado: normalizar é reescrever forma, jamais
 * preencher conteúdo ausente.
 *
 * Hash canônico de itens (Addendum §13): nome normalizado + quantidade +
 * observação, itens ordenados — usado para comparar reimpressões e revisões.
 * ==========================================================================*/
"use strict";

const crypto = require("node:crypto");

/** minúsculas, sem acento, espaços colapsados. Nunca altera null/undefined. */
function normalizarTexto(s) {
  if (s === null || s === undefined) return null;
  return String(s)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** "2026-07-11T19:05:00-03:00" -> "2026-07-11" (dia da chave). null se inválido. */
function diaDe(iso) {
  if (typeof iso !== "string") return null;
  const m = iso.match(/^(\d{4}-\d{2}-\d{2})T/);
  return m ? m[1] : null;
}

/**
 * Hash canônico de itens ordenados (Addendum §13).
 * Cada item: { nome, quantidade, observacao }. Campos ausentes = null (nunca
 * preenchidos). Itens fora de ordem produzem o MESMO hash.
 */
function hashCanonicoItens(itens) {
  if (!Array.isArray(itens)) return null;
  const canonicos = itens
    .map((it) => ({
      nome: normalizarTexto(it && it.nome),
      quantidade: (it && Number.isFinite(it.quantidade)) ? it.quantidade : null,
      observacao: normalizarTexto(it && it.observacao)
    }))
    .sort((a, b) => {
      const ka = `${a.nome}|${a.quantidade}|${a.observacao}`;
      const kb = `${b.nome}|${b.quantidade}|${b.observacao}`;
      return ka < kb ? -1 : ka > kb ? 1 : 0;
    });
  return crypto.createHash("sha256").update(JSON.stringify(canonicos)).digest("hex");
}

/* ---------- change_mode ----------
 * Vocabulário canônico (autorização da Fase 2 do César):
 *   full_snapshot | partial_delta | field_correction | items_replacement
 * O Addendum §13 usou nomes em português — aceitos como alias e normalizados,
 * com aviso registrado (divergência documentada no Contrato do Núcleo §12). */
const CHANGE_MODES = Object.freeze(["full_snapshot", "partial_delta", "field_correction", "items_replacement"]);
const CHANGE_MODE_ALIASES = Object.freeze({
  snapshot_completo: "full_snapshot",
  delta_parcial: "partial_delta",
  correcao_campo: "field_correction",
  substituicao_itens: "items_replacement"
});

/** @returns {{modo: string|null, alias: boolean}} modo canônico ou null se desconhecido */
function normalizarChangeMode(m) {
  if (typeof m !== "string") return { modo: null, alias: false };
  if (CHANGE_MODES.includes(m)) return { modo: m, alias: false };
  if (CHANGE_MODE_ALIASES[m]) return { modo: CHANGE_MODE_ALIASES[m], alias: true };
  return { modo: null, alias: false };
}

module.exports = {
  normalizarTexto,
  diaDe,
  hashCanonicoItens,
  CHANGE_MODES,
  normalizarChangeMode
};
