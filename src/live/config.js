/* ============================================================================
 * DeliveryOS · src/live · CONFIG
 * ----------------------------------------------------------------------------
 * Limiares e comportamentos configuráveis do núcleo de fonte viva.
 *
 * ATENÇÃO — VERDADE CONSERVADORA:
 * Os valores abaixo são CHUTES DECLARADOS DE DESENVOLVIMENTO, nunca verdade
 * operacional. Os limiares definitivos só existirão com evidência da Fase
 * Sombra na loja (Addendum §4). Nenhum valor aqui pode ser tratado como
 * calibrado.
 * ==========================================================================*/
"use strict";

const CONFIG_PADRAO = Object.freeze({
  freshness: Object.freeze({
    // fonte sem evento há mais que isto => "atrasada" (chute de dev, não calibrado)
    atrasadaAposMs: 90 * 1000,
    // fonte sem evento há mais que isto => "vencida" (chute de dev, não calibrado)
    vencidaAposMs: 5 * 60 * 1000,
    // comportamento do estado "atrasada" (contrato F3-03):
    //   "bloquear"             => recomendações sensíveis a tempo não nascem
    //   "marcar_nao_confiavel" => nascem, mas carregam marca de não confiável
    // Padrão conservador: bloquear.
    comportamentoAtrasada: "bloquear"
  })
});

/** Cria uma configuração mesclando overrides rasos sobre o padrão. */
function criarConfig(overrides) {
  const o = overrides || {};
  const f = o.freshness || {};
  return Object.freeze({
    freshness: Object.freeze({
      atrasadaAposMs: Number.isFinite(f.atrasadaAposMs) ? f.atrasadaAposMs : CONFIG_PADRAO.freshness.atrasadaAposMs,
      vencidaAposMs: Number.isFinite(f.vencidaAposMs) ? f.vencidaAposMs : CONFIG_PADRAO.freshness.vencidaAposMs,
      comportamentoAtrasada: (f.comportamentoAtrasada === "marcar_nao_confiavel")
        ? "marcar_nao_confiavel"
        : "bloquear"
    })
  });
}

module.exports = { CONFIG_PADRAO, criarConfig };
