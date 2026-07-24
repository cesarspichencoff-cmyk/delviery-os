/* ============================================================================
 * Contratos de autenticação — SOMENTE FORMA, nunca segredo real.
 * ----------------------------------------------------------------------------
 * Esta missão nunca cria credencial, nunca cadastra aplicativo, nunca chama
 * a API real. `AuthConfig` só descreve QUAIS campos uma implementação
 * futura precisaria configurar — todos vêm de variável de ambiente/config
 * externa, nunca hardcoded. `TokenState` descreve o CICLO DE VIDA de um
 * token, sem nunca conter o valor do token em texto — só uma referência
 * opaca (`token_reference`) para o que quer que armazene o segredo de
 * verdade (fora deste repositório).
 * ==========================================================================*/
"use strict";

const AUTH_ERROR_CATEGORY = Object.freeze({
  CREDENTIAL_MISSING: "credential_missing",
  MERCHANT_NOT_AUTHORIZED: "merchant_not_authorized",
  TOKEN_EXPIRED: "token_expired",
  TOKEN_INVALID: "token_invalid",
  RENEWAL_FAILED: "renewal_failed",
  UNKNOWN: "unknown"
});

/**
 * Configuração — todos os valores vêm de fora (env/config), nunca
 * hardcoded aqui. `buildAuthConfig` só valida presença/forma.
 * @param {object} raw
 *   clientIdRef, clientSecretRef   referências opacas a onde o segredo mora
 *   tokenUrl                        endpoint de emissão de token (configurável)
 *   scopes[]
 *   tokenTtlSeconds                  configurável, nunca fixo no código
 *   renewalMarginSeconds              margem antes de expirar para renovar
 */
function buildAuthConfig(raw) {
  const r = raw || {};
  const errors = [];
  if (!r.clientIdRef) errors.push("client_id_ref_ausente");
  if (!r.clientSecretRef) errors.push("client_secret_ref_ausente");
  if (!r.tokenUrl) errors.push("token_url_ausente");
  if (!Number.isFinite(r.tokenTtlSeconds) || r.tokenTtlSeconds <= 0) errors.push("token_ttl_invalido");
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    config: {
      client_id_ref: r.clientIdRef,
      client_secret_ref: r.clientSecretRef,
      token_url: r.tokenUrl,
      scopes: Array.isArray(r.scopes) ? r.scopes.slice() : [],
      token_ttl_seconds: r.tokenTtlSeconds,
      renewal_margin_seconds: Number.isFinite(r.renewalMarginSeconds) ? r.renewalMarginSeconds : Math.floor(r.tokenTtlSeconds * 0.1)
    }
  };
}

const TOKEN_STATE = Object.freeze({
  ABSENT: "absent", VALID: "valid", EXPIRING_SOON: "expiring_soon", EXPIRED: "expired", ERROR: "error"
});

/**
 * @param {object} raw
 *   tokenReference    referência opaca (nunca o token em texto)
 *   issuedAt, expiresAt
 *   now                 injeção de relógio para teste
 */
function evaluateTokenState(raw) {
  const r = raw || {};
  const now = r.now || Date.now();
  if (!r.tokenReference || !r.expiresAt) return TOKEN_STATE.ABSENT;
  const expiresAtMs = Date.parse(r.expiresAt);
  if (!Number.isFinite(expiresAtMs)) return TOKEN_STATE.ERROR;
  if (expiresAtMs <= now) return TOKEN_STATE.EXPIRED;
  const marginMs = (r.renewalMarginSeconds || 0) * 1000;
  if (expiresAtMs - now <= marginMs) return TOKEN_STATE.EXPIRING_SOON;
  return TOKEN_STATE.VALID;
}

module.exports = { AUTH_ERROR_CATEGORY, buildAuthConfig, TOKEN_STATE, evaluateTokenState };
