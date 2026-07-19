/* ============================================================================
 * Catálogo de itens + complexidade inicial (evidência TATÁ > culinária genérica).
 * ==========================================================================*/
"use strict";

const { EPISTEMIC, stamp } = require("./labels");
const { normalizeName } = require("./normalizer");

const PRACA_ALIAS = {
  combinados: "sushi",
  combinado: "sushi",
  duplas: "sushi",
  dupla: "sushi",
  enrolados: "sushi",
  enrolado: "sushi",
  enrolados_quentes: "quentes",
  enrolado_quente: "quentes",
  cozinha_quentes: "quentes",
  prato_quente: "quentes",
  sobremesa: "conferencia",
  bar_bebidas: "conferencia",
  bebida: "conferencia",
  montagem_outros: "conferencia",
  complemento: "conferencia",
  acompanhamento: "conferencia",
  entrada: "sushi",
  menu_composto: "sushi",
  nao_producao: "caixa",
  outros: "conferencia"
};

/**
 * Constrói catálogo a partir do cardápio seed + opcional stats de itens.
 */
function buildCatalog(cardapioSeed, itemStats) {
  const itens = (cardapioSeed && cardapioSeed.itens) || [];
  const stats = itemStats || {};
  const byName = {};
  const rows = [];
  let pending = 0;
  let classified = 0;

  for (const it of itens) {
    const pracaMotor = it.praca_principal || null;
    const area = mapPracaToArea(pracaMotor, it.categoria_operacional);
    const cx = classifyComplexity(it, stats[it.id] || stats[normalizeName(it.nome)]);
    if (cx.pending) pending++;
    else classified++;

    const row = stamp({
      item: it.nome,
      item_id: it.id,
      praca_motor: pracaMotor,
      praca: area,
      complexidade_inicial: cx.key,
      complexidade_peso: cx.peso,
      tempo_tipico_observado: cx.tempo_obs,
      quantidade_componentes: (it.ingredientes_extraidos || []).length || null,
      paralelizavel: it.produz_sozinho !== false,
      dependencias: it.pracas_dependentes || [],
      concentracao: it.quantidade_pecas || 1,
      confianca_classificacao: cx.confidence,
      motivo: cx.motivo,
      complexidade_epistemic: cx.epistemic,
      revisao_manual: !!it.revisao_manual,
      pendente_validacao: cx.pending,
      label_pendente: cx.pending ? "CLASSIFICAÇÃO PENDENTE DE VALIDAÇÃO" : null
    });
    rows.push(row);
    byName[normalizeName(it.nome)] = {
      id: it.id,
      praca: area,
      complexidade: cx.key,
      complexidade_epistemic: cx.epistemic,
      peso: cx.peso
    };
  }

  return stamp({
    n: rows.length,
    classified,
    pending_validation: pending,
    byName,
    items: rows,
    pracas_aliases: PRACA_ALIAS,
    note: "Quentes×Cozinha não consolidados — ambos mapeiam a quentes quando motor diz cozinha_quentes/enrolados_quentes; validar com César"
  });
}

function mapPracaToArea(pracaPrincipal, categoriaOp) {
  if (pracaPrincipal && PRACA_ALIAS[pracaPrincipal]) return PRACA_ALIAS[pracaPrincipal];
  if (categoriaOp && PRACA_ALIAS[categoriaOp]) return PRACA_ALIAS[categoriaOp];
  if (pracaPrincipal) return PRACA_ALIAS[pracaPrincipal] || null;
  return null;
}

/**
 * Prioriza evidências do seed (peças, menu composto, quente, multi-praça).
 * Sem tempo histórico por item → não inventa minutos.
 */
function classifyComplexity(it, stat) {
  const pieces = Number(it.quantidade_pecas) || 0;
  const multi = (it.pracas_dependentes || []).length > 0 || it.depende_de_outra_praca;
  const composed = it.categoria_operacional === "menu_composto" || it.categoria_operacional === "combinado";
  const hot = it.temperatura === "quente" || (it.praca_principal || "").indexOf("quente") >= 0;
  const confSeed = it.confianca_classificacao || "media";

  let key = "moderado";
  let peso = 1.5;
  let motivo = [];
  let epistemic = EPISTEMIC.INFERIDO_ALTA;
  let pending = false;

  if (composed || (it.contem_bebida && it.contem_sobremesa)) {
    key = "muito_complexo";
    peso = 3.0;
    motivo.push("menu/combinado multi-componente");
  } else if (pieces >= 20 || multi) {
    key = "complexo";
    peso = 2.2;
    motivo.push(pieces >= 20 ? `peças=${pieces}` : "depende de outra praça");
  } else if (hot && pieces >= 8) {
    key = "complexo";
    peso = 2.2;
    motivo.push("quente + volume de peças");
  } else if (pieces > 0 && pieces <= 4 && !hot) {
    key = "simples";
    peso = 1.0;
    motivo.push("poucas peças frias");
  } else if (it.categoria_operacional === "bebida") {
    key = "simples";
    peso = 1.0;
    motivo.push("bebida");
  } else if (it.categoria_operacional === "enrolado_quente") {
    key = "moderado";
    peso = 1.5;
    motivo.push("enrolado quente");
  }

  // congestionante: alto volume típico em sobremesa/bebida kit
  if (it.contem_kit || (it.sacolas_esperadas && it.sacolas_esperadas >= 2)) {
    key = "congestionante";
    peso = 3.5;
    motivo.push("kit/multi-sacola");
  }

  if (!it.praca_principal || confSeed === "baixa" || it.revisao_manual) {
    pending = true;
    epistemic = EPISTEMIC.INFERIDO_BAIXA;
    motivo.push("pendente validação operacional");
  }

  let tempo_obs = null;
  if (stat && stat.median_prep_min != null) {
    tempo_obs = stat.median_prep_min;
    motivo.push("tempo mediano observado em histórico");
    epistemic = EPISTEMIC.CONFIRMADO;
  } else {
    motivo.push("sem tempo típico observado por item — não inventado");
  }

  return {
    key,
    peso,
    motivo: motivo.join("; "),
    confidence: pending ? "baixa" : confSeed === "alta" ? "alta" : "media",
    epistemic,
    pending,
    tempo_obs
  };
}

module.exports = {
  buildCatalog,
  mapPracaToArea,
  classifyComplexity,
  PRACA_ALIAS
};
