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

/** "2026-07-11T19:05:00-03:00" -> "2026-07-11" (prefixo da string ISO).
 * ATENÇÃO (F2-02): NÃO é dia operacional — é só o prefixo textual, cego a
 * fuso. Para correlação multi-fonte use SEMPRE localDayKey (abaixo).
 * Mantida apenas para chaves onde o chamador já garante o fuso. */
function diaDe(iso) {
  if (typeof iso !== "string") return null;
  const m = iso.match(/^(\d{4}-\d{2}-\d{2})T/);
  return m ? m[1] : null;
}

/* ---------- dia operacional da loja (fecha F2-02) ----------
 * Um mesmo instante físico pertence a dias diferentes conforme o fuso; o dia
 * que importa é o da LOJA. storeTimeZone é um identificador IANA explícito
 * (ex. de teste: America/Sao_Paulo) — nunca uma constante escondida do núcleo
 * e nunca UTC assumido em silêncio. */
const formatadoresPorFuso = new Map();

/**
 * Chave local do dia: converte o instante para o fuso da loja e extrai
 * YYYY-MM-DD LOCAIS. A virada do dia respeita a meia-noite local.
 * @param {string} iso            occurred_at (preferido) ou captured_at
 * @param {string} storeTimeZone  IANA; ausente/inválido => null (sem chute)
 * @returns {string|null} null = "não sei o dia da loja" — nunca UTC silencioso
 */
function localDayKey(iso, storeTimeZone) {
  if (typeof iso !== "string" || typeof storeTimeZone !== "string" || storeTimeZone.length === 0) {
    return null;
  }
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  let fmt = formatadoresPorFuso.get(storeTimeZone);
  if (fmt === undefined) {
    try {
      // en-CA formata como YYYY-MM-DD
      fmt = new Intl.DateTimeFormat("en-CA", {
        timeZone: storeTimeZone, year: "numeric", month: "2-digit", day: "2-digit"
      });
    } catch {
      fmt = null; // IANA inválido: registrado como incapaz, sem fallback p/ UTC
    }
    formatadoresPorFuso.set(storeTimeZone, fmt);
  }
  if (fmt === null) return null;
  return fmt.format(new Date(t));
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
  localDayKey,
  hashCanonicoItens,
  CHANGE_MODES,
  normalizarChangeMode
};
