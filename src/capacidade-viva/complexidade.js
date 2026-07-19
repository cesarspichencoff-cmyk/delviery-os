/* ============================================================================
 * Complexidade de itens — configurável, sem classificação definitiva do cardápio.
 * ==========================================================================*/
"use strict";

function pesoComplexidade(config, key) {
  const c = (config && config.complexidade) || {};
  const k = key || "moderado";
  if (c[k] && c[k].peso != null) return Number(c[k].peso);
  return 1.5;
}

function classifyItem(item, config) {
  const it = item || {};
  const key = it.complexidade || it.complexity || "moderado";
  const peso = pesoComplexidade(config, key);
  return {
    item_id: it.id || it.item_id || null,
    nome: it.nome || it.name || null,
    praca: it.praca || it.area || null,
    complexidade: key,
    peso,
    tempo_tipico_min: it.tempo_tipico_min != null ? it.tempo_tipico_min : null,
    paralelizavel: it.paralelizavel !== false,
    dependencias: it.dependencias || it.dependencies || [],
    concentracao: it.concentracao != null ? it.concentracao : 1,
    simulated: it.simulated !== false,
    explanation: `complexidade=${key} peso=${peso} (configurável, não definitiva)`
  };
}

module.exports = { pesoComplexidade, classifyItem };
