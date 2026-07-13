/* ============================================================================
 * DeliveryOS · src/live/interface · SELEÇÃO DE FONTE (feature flag D4A)
 * ----------------------------------------------------------------------------
 * Flag explícita, auditável e reversível: DELIVERYOS_LIVE_SOURCE.
 * Valores: "current" | "simulator".
 *
 * SEGURO POR PADRÃO: valor ausente => fonte atual (comportamento histórico,
 * byte-idêntico), com fallback REGISTRADO; valor inválido => fonte atual +
 * degraded_state "flag_invalida" — o simulador NUNCA liga silenciosamente.
 * Rollback = remover/trocar a variável de ambiente; sem rebuild.
 * ==========================================================================*/
"use strict";

const FONTES_VALIDAS = Object.freeze(["current", "simulator"]);
const NOME_FLAG = "DELIVERYOS_LIVE_SOURCE";

/**
 * @param {string|undefined} valorBruto  valor cru da flag (env)
 * @returns {{ fonte: "current"|"simulator", flag_bruta: string|null,
 *             degraded_state: string|null, fallback: string|null }}
 */
function selecionarFonte(valorBruto) {
  if (valorBruto === undefined || valorBruto === null || valorBruto === "") {
    return {
      fonte: "current",
      flag_bruta: null,
      degraded_state: null,
      fallback: "flag_ausente_usando_fonte_atual" // registrado, nunca silencioso
    };
  }
  const normalizado = String(valorBruto).trim().toLowerCase();
  if (FONTES_VALIDAS.includes(normalizado)) {
    return { fonte: normalizado, flag_bruta: String(valorBruto), degraded_state: null, fallback: null };
  }
  return {
    fonte: "current", // comportamento seguro: nunca ativa simulador por engano
    flag_bruta: String(valorBruto),
    degraded_state: "flag_invalida",
    fallback: "valor_desconhecido_usando_fonte_atual"
  };
}

/** leitura padrão a partir do ambiente do processo */
const selecionarFonteDoAmbiente = (env) => selecionarFonte((env || process.env)[NOME_FLAG]);

module.exports = { NOME_FLAG, FONTES_VALIDAS, selecionarFonte, selecionarFonteDoAmbiente };
