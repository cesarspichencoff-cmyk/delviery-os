/* ============================================================================
 * DeliveryOS · tools/live/simulator · IDENTIFICADORES SINTÉTICOS
 * ----------------------------------------------------------------------------
 * Todo identificador é CLARAMENTE artificial (prefixo SIM-) e sequencial —
 * determinístico por construção. Nunca nome, telefone, e-mail, CPF, endereço,
 * cookie, token, senha, nem nada que se pareça com dado pessoal.
 * ==========================================================================*/
"use strict";

function criarIdentificadores() {
  const contadores = { evento: 0, ifood: 0, interno: 0, job: 0 };
  const pad = (n) => String(n).padStart(4, "0");

  return {
    proximoEvento: () => `SIM-EVENT-${pad(++contadores.evento)}`,
    proximoIfood: () => `SIM-IFOOD-${pad(++contadores.ifood)}`,
    proximoInterno: () => `SIM-INTERNO-${pad(++contadores.interno)}`,
    proximoJob: () => `SIM-JOB-${pad(++contadores.job)}`
  };
}

/* Textos livres permitidos (allowlist sintética) — únicos valores que podem
 * aparecer em campos de texto livre como `observacao`. */
const OBSERVACOES_SINTETICAS = Object.freeze([
  null,
  "observacao sintetica um",
  "observacao sintetica dois",
  "observacao sintetica tres"
]);

const NOMES_ITENS_SINTETICOS = Object.freeze([
  "Item Sintetico Alfa",
  "Item Sintetico Beta",
  "Item Sintetico Gama",
  "Item Sintetico Delta",
  "Item Sintetico Epsilon",
  "Item Sintetico Zeta"
]);

module.exports = { criarIdentificadores, OBSERVACOES_SINTETICAS, NOMES_ITENS_SINTETICOS };
