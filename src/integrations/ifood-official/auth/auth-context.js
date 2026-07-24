/* ============================================================================
 * Contexto de autenticação — orquestra os contratos de auth.js sem NUNCA
 * guardar segredo real. `tokenReference` é sempre uma string opaca (o que
 * quer que a implementação real do adapter devolva); o valor do token
 * nunca passa por aqui.
 * ==========================================================================*/
"use strict";

const { evaluateTokenState, TOKEN_STATE, AUTH_ERROR_CATEGORY } = require("../contracts/auth");

function createAuthContext(config) {
  let current = null; // { tokenReference, issuedAt, expiresAt } -- nunca o token em si

  function set(tokenReference, issuedAt, expiresAt) {
    current = { tokenReference, issuedAt, expiresAt };
    return status();
  }

  function clear() { current = null; }

  function status(now) {
    if (!current) return { state: TOKEN_STATE.ABSENT, error_category: AUTH_ERROR_CATEGORY.CREDENTIAL_MISSING };
    const state = evaluateTokenState({
      tokenReference: current.tokenReference, expiresAt: current.expiresAt,
      renewalMarginSeconds: config ? config.renewal_margin_seconds : 0, now
    });
    const errorCategory = state === TOKEN_STATE.EXPIRED ? AUTH_ERROR_CATEGORY.TOKEN_EXPIRED
      : state === TOKEN_STATE.ERROR ? AUTH_ERROR_CATEGORY.TOKEN_INVALID : null;
    return { state, error_category: errorCategory };
  }

  /** Renovação -- nesta missão nunca chama rede; só simula a decisão de QUANDO renovar. */
  function needsRenewal(now) {
    const s = status(now).state;
    return s === TOKEN_STATE.ABSENT || s === TOKEN_STATE.EXPIRED || s === TOKEN_STATE.EXPIRING_SOON;
  }

  return { set, clear, status, needsRenewal };
}

module.exports = { createAuthContext };
