/* ============================================================================
 * Sinais pontuais de composição — CONTEXTO do pedido, nunca estado global.
 * ----------------------------------------------------------------------------
 * Decisão de produto aprovada: a composição NÃO controla o estado da
 * Conferência na V1. Ela ajuda a conferir, a evitar erro, o catálogo e o
 * treinamento. Aqui só existe infraestrutura + sinais evidentes.
 *
 * PROIBIÇÕES ATIVAS (garantidas por teste):
 *  - nenhum sinal daqui gera urgência global;
 *  - NÃO existe peso/score de complexidade por prato;
 *  - NÃO se usa o campo generico `risco_de_erro: alto` do seed (46% do cardapio
 *    o tem — usá-lo cru faria metade do menu gritar);
 *  - NÃO se faz inferência médica; alergia só quando DECLARADA em texto;
 *  - NÃO se inventa alergia a partir do nome do prato.
 * ==========================================================================*/
"use strict";

const { COMPOSITION_HINTS_V1 } = require("../contracts/rule-version");
const { normalizeName } = require("../normalize/normalizer");

/** Praças canônicas do motor (vocabulário soberano). */
const PRACAS = Object.freeze([
  "combinados", "duplas", "enrolados", "enrolados_quentes",
  "cozinha_quentes", "sobremesa", "bar_bebidas", "montagem_outros"
]);

/** Termos de restrição DECLARADA. Só valem no texto escrito pelo cliente. */
const ALLERGY_TERMS = Object.freeze([
  "alergia", "alergic", "alérgic", "intoleran", "sem gluten", "sem glúten",
  "sem lactose", "celiac", "restricao alimentar", "restrição alimentar"
]);

/** Índice do catálogo por nome normalizado (aceita o seed do Copiloto). */
function buildCatalogIndex(seedItems) {
  const idx = new Map();
  for (const it of seedItems || []) {
    const n = normalizeName(it.nome || it.name || "");
    if (n) idx.set(n, it);
  }
  return idx;
}

/** Casa um item do pedido com o catálogo. Sem invenção: ou casa, ou declara. */
function matchCatalog(item, index) {
  if (!index) return { matched: false, confidence: "baixa", reason: "sem_catalogo" };
  const n = item.normalized_name || normalizeName(item.raw_name);
  const exact = index.get(n);
  if (exact) {
    return {
      matched: true, confidence: "alta", item_id: exact.id || null,
      praca: exact.praca_principal || null,
      temperatura: exact.temperatura || null,
      categoria: exact.categoria_operacional || null
    };
  }
  return { matched: false, confidence: "baixa", reason: "sem_correspondencia" };
}

/**
 * Sinais de contexto de um pedido. Nunca devolve estado nem severidade global.
 * @param {object} order  pedido normalizado
 * @param {Array}  items  linhas de item do pedido
 * @param {Map}    [catalogIndex]
 */
function orderHints(order, items, catalogIndex) {
  const list = Array.isArray(items) ? items : [];
  const P = COMPOSITION_HINTS_V1.params;
  const hints = [];
  const pracas = new Set();
  let hot = false, cold = false, drink = false, dessert = false, assembly = false;
  let unmatched = 0;

  for (const it of list) {
    const m = matchCatalog(it, catalogIndex);
    if (!m.matched) { unmatched++; continue; }
    if (m.praca) pracas.add(m.praca);
    if (m.praca === "bar_bebidas") drink = true;
    if (m.praca === "sobremesa") dessert = true;
    if (m.praca === "montagem_outros") assembly = true;
    const t = String(m.temperatura || "").toLowerCase();
    if (t.includes("quente")) hot = true;
    if (t.includes("frio") || t.includes("gelad")) cold = true;
    if (m.praca === "cozinha_quentes" || m.praca === "enrolados_quentes") hot = true;
  }

  const units = list.reduce((a, i) => a + (Number(i.quantity) || 0), 0);
  const observations = list.filter((i) => i.observation && String(i.observation).trim());

  const add = (code, message, evidence) => hints.push({ code, message, evidence: evidence || null });

  if (observations.length) {
    add("HAS_OBSERVATION",
      observations.length === 1 ? "Pedido com observacao do cliente." : `Pedido com ${observations.length} observacoes do cliente.`,
      { lines: observations.map((o) => o.line_index) });
  }

  // Alergia SOMENTE se declarada por escrito. Sem inferência médica.
  for (const o of observations) {
    const txt = String(o.observation).toLowerCase();
    if (ALLERGY_TERMS.some((t) => txt.includes(t))) {
      add("DECLARED_RESTRICTION",
        "Observacao menciona restricao alimentar declarada. Confirmar com a equipe; o sistema nao interpreta condicao medica.",
        { line: o.line_index });
      break;
    }
  }

  if (hot && cold) add("HOT_AND_COLD", "Pedido reune itens quentes e frios (separacao termica na montagem).");
  if (drink) add("HAS_DRINK", "Pedido inclui bebida (volume separado).");
  if (dessert) add("HAS_DESSERT", "Pedido inclui sobremesa.");
  if (assembly) add("HAS_ASSEMBLY_ITEM", "Pedido inclui item de montagem_outros (insumo de finalizacao).");
  if (pracas.size >= 3) add("MULTI_PRACA", `Itens de ${pracas.size} pracas diferentes convergem neste pedido.`, { pracas: Array.from(pracas) });
  if (units >= P.many_units_threshold) add("MANY_UNITS", `${units} unidades no mesmo pedido.`, { units });
  if (units >= P.multi_volume_units_threshold) add("POSSIBLE_MULTI_VOLUME", `Volume alto (${units} unidades): possivel necessidade de mais de uma sacola.`, { units });
  if (unmatched) add("CATALOG_MATCH_INCOMPLETE", `${unmatched} item(ns) sem correspondencia no catalogo.`, { unmatched });

  return {
    order_id: order && order.order_id,
    hints,
    facts: {
      distinct_items: list.length || null,
      total_units: units || null,
      pracas: Array.from(pracas),
      has_hot: hot, has_cold: cold, has_drink: drink, has_dessert: dessert,
      unmatched_items: unmatched
    },
    // Contrato explícito: composição é contexto e NUNCA promove estado global.
    affects_global_state: false,
    rule_version: COMPOSITION_HINTS_V1.ref
  };
}

module.exports = { orderHints, matchCatalog, buildCatalogIndex, PRACAS, ALLERGY_TERMS };
