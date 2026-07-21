/* ============================================================================
 * Versionamento de regra — toda regra do cérebro carrega identidade e volta atrás.
 * ----------------------------------------------------------------------------
 * Exigência da missão: toda regra precisa de ID, versão, data, fonte, modo,
 * parâmetros e possibilidade de reversão. Sem isso é impossível auditar por que
 * uma leitura mudou, nem comparar histórico (leituras de versões diferentes não
 * são comparáveis).
 * ==========================================================================*/
"use strict";

const MODES = Object.freeze({
  SHADOW: "shadow",       // observa e registra; não afeta produto
  ACTIVE: "active"        // afeta produto — exige decisão humana registrada
});

/**
 * Cria um descritor imutável de versão de regra.
 * @param {object} d
 * @param {string} d.id           identificador estável (ex.: "conference-shadow")
 * @param {string} d.version      versão semântica curta (ex.: "v1")
 * @param {string} d.date         ISO da vigência
 * @param {string} d.source       de onde a regra veio (evidência/decisão)
 * @param {string} [d.mode]       shadow | active (default shadow)
 * @param {object} [d.params]     parâmetros que a regra usa
 * @param {string} [d.supersedes] versão anterior que esta substitui
 * @param {string} [d.revertTo]   versão para a qual reverter em caso de problema
 */
function defineRule(d) {
  if (!d || !d.id || !d.version || !d.date || !d.source) {
    throw new Error("defineRule: id, version, date e source sao obrigatorios");
  }
  const mode = d.mode || MODES.SHADOW;
  if (mode !== MODES.SHADOW && mode !== MODES.ACTIVE) {
    throw new Error("defineRule: mode invalido: " + mode);
  }
  return Object.freeze({
    id: d.id,
    version: d.version,
    ref: d.id + "-" + d.version,
    date: d.date,
    source: d.source,
    mode,
    params: Object.freeze(Object.assign({}, d.params || {})),
    supersedes: d.supersedes || null,
    revert_to: d.revertTo || d.supersedes || null
  });
}

/* --- Regras vigentes do Sprint 1 ------------------------------------------ */

/** Faixas-base de carga. Aprovadas pelo César; entram SOMENTE em sombra. */
const LOAD_BANDS_V1 = defineRule({
  id: "conference-load-bands",
  version: "v1",
  date: "2026-07-21",
  source: "decisao do Cesar (faixas 30/50/70) + analise de 267 dias (91,2% do tempo <30)",
  mode: MODES.SHADOW,
  params: { calm_below: 30, flowing_below: 50, attention_below: 70 }
});

/** Estado sombra da Conferência: base por carga + modificadores observáveis. */
const CONFERENCE_SHADOW_V1 = defineRule({
  id: "conference-shadow",
  version: "v1",
  date: "2026-07-21",
  source: "decisao de produto aprovada: ativos + convergencia + ritmo + tempo interno + prontidao",
  mode: MODES.SHADOW,
  params: {
    window_minutes: 5,
    // Modificadores: provisórios e transparentes, sem pesos definitivos.
    high_convergence_ready_in_window: 8,   // prontos na janela que caracterizam convergência
    queue_growing_consecutive_windows: 2,  // janelas seguidas com entrada > conclusão
    ready_time_growth_ratio: 1.25,         // tempo até pronto vs média recente
    attention_floor_active: 20             // abaixo disso, modificador não eleva a atenção
  }
});

/** Janela padrão dos snapshots. */
const SNAPSHOT_WINDOW_V1 = defineRule({
  id: "operational-snapshot-window",
  version: "v1",
  date: "2026-07-21",
  source: "missao Sprint 1: janela padrao 5 min, suporte futuro a 10 min",
  mode: MODES.SHADOW,
  params: { window_minutes: 5, supported_minutes: [5, 10] }
});

/** Sinais pontuais de composição — contexto do pedido, nunca estado global. */
const COMPOSITION_HINTS_V1 = defineRule({
  id: "composition-hints",
  version: "v1",
  date: "2026-07-21",
  source: "decisao aprovada: composicao e contexto e regra pontual, nao peso do estado global",
  mode: MODES.SHADOW,
  params: { many_units_threshold: 12, multi_volume_units_threshold: 18 }
});

module.exports = {
  MODES, defineRule,
  LOAD_BANDS_V1, CONFERENCE_SHADOW_V1, SNAPSHOT_WINDOW_V1, COMPOSITION_HINTS_V1
};
