/* ============================================================================
 * Feature flags do modo sombra da Capacidade Viva human-v2 (§7).
 * ----------------------------------------------------------------------------
 * Duas flags, propositalmente separadas e nunca reaproveitadas entre si:
 *
 *   1) shadow (esta fase)         — liga/desliga a EXECUÇÃO do motor sombra
 *                                    (leitura, log técnico). Nunca decide nada.
 *   2) decisão automática (futura)— NÃO existe flag real aqui. A função
 *                                    correspondente devolve sempre false,
 *                                    hardcoded, sem ler variável de ambiente
 *                                    nenhuma. Ativar decisão automática exige
 *                                    uma fase própria, com aprovação humana
 *                                    explícita — nunca reaproveitar a flag
 *                                    de sombra para isso.
 * ==========================================================================*/
"use strict";

const SHADOW_FLAG_ENV = "CAPACIDADE_VIVA_HUMAN_V2_SHADOW";

/**
 * Modo sombra habilitado? Regras (§7):
 *  - se a env var estiver definida, ela manda (permite ligar/desligar
 *    explicitamente em qualquer ambiente, inclusive produção, para coleta
 *    controlada);
 *  - sem env var definida: habilitado em development/test (para permitir
 *    observação real durante o desenvolvimento, conforme pedido pela fase);
 *  - sem env var definida e ambiente não reconhecido (ex.: produção sem
 *    configuração explícita): desabilitado por padrão.
 */
function isShadowEnabled(env) {
  const e = env || process.env;
  const raw = e.CAPACIDADE_VIVA_HUMAN_V2_SHADOW;
  if (raw != null) return raw === "1" || raw === "true";
  const nodeEnv = e.NODE_ENV || "development";
  return nodeEnv === "development" || nodeEnv === "test";
}

/**
 * Decisão automática habilitada? SEMPRE false nesta fase — não lê env var,
 * não lê config, não tem chave para ligar. Existe como função (não apenas
 * comentário) para que qualquer código futuro que precise checar isso tenha
 * um único ponto de verdade, e para que os testes possam travar o
 * comportamento.
 */
function automaticDecisionsEnabled() {
  return false;
}

module.exports = { isShadowEnabled, automaticDecisionsEnabled, SHADOW_FLAG_ENV };
