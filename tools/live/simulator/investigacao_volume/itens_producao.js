/* ============================================================================
 * DeliveryOS · investigação de volume · ITENS DE PRODUÇÃO (cardápio REAL)
 * ----------------------------------------------------------------------------
 * DECISÃO TÉCNICA EXPLÍCITA (documentada, não silenciosa):
 *
 * Os cenários certificados 3A usam NOMES_ITENS_SINTETICOS ("Item Sintetico
 * Alfa"...), que nunca casam contra o cardápio real (matchSeed). Isso é
 * intencional na 3A/3B/D4A: aqueles cenários só precisam provar o encanamento
 * do núcleo, não a decisão cognitiva do motor.
 *
 * Esta investigação tem um objetivo DIFERENTE: fazer o MOTOR REAL (motor.js)
 * decidir Ambiente/Foco legitimamente. A lógica de sobrecarga de praça
 * (`load[p] > BASELINE[p]`) só existe para pedidos cujos itens casam com uma
 * praça de PRODUÇÃO real via `MOTOR.matchSeed()` — um item com nome fictício
 * cai em "montagem_outros" (não-produção) e nunca entra nessa conta.
 *
 * Por isso este módulo usa NOMES REAIS do cardápio público
 * (`data/cardapio_knowledge_seed.json`) — dado de CONHECIMENTO do produto,
 * não dado de OPERAÇÃO: não é pedido real, não é cliente real, não é PII.
 * Tudo o que É sintético continua sintético: identificadores de pedido
 * (SIM-IFOOD-/SIM-INTERNO-/SIM-JOB-), datas, horários e volume são 100%
 * fabricados por este script — nenhum evento, pedido ou timestamp real é
 * usado. O cardápio é a mesma "camada de conhecimento real" que TODO
 * cenário da V1 (inclusive a demo histórica Missão 4) sempre usou.
 *
 * Só itens com `pracas_dependentes: []` são escolhidos — cada pedido sintético
 * afeta EXATAMENTE uma praça de produção, o que torna a carga por praça
 * matematicamente previsível (nenhuma dependência cruzada a calcular).
 * ==========================================================================*/
"use strict";

const path = require("node:path");
const RAIZ = path.join(__dirname, "..", "..", "..", "..");
const seed = require(path.join(RAIZ, "data", "cardapio_knowledge_seed.json"));

const PRODUCAO = ["combinados", "duplas", "enrolados", "enrolados_quentes", "cozinha_quentes"];

/** itens de produção sem dependência de outra praça, por praça */
const ITENS_LIMPOS = Object.fromEntries(
  PRODUCAO.map((p) => [
    p,
    seed.itens.filter((i) => i.praca_principal === p && (!i.pracas_dependentes || i.pracas_dependentes.length === 0))
  ])
);

// um nome representativo por praça (determinístico — sempre o primeiro da lista)
const NOME_POR_PRACA = Object.fromEntries(
  PRODUCAO.filter((p) => ITENS_LIMPOS[p].length > 0).map((p) => [p, ITENS_LIMPOS[p][0].nome])
);

/** monta um item {nome, quantidade, observacao} de composição real para a praça dada */
function itemDaPraca(praca) {
  const nome = NOME_POR_PRACA[praca];
  if (!nome) throw new Error(`sem_item_limpo_para_praca: ${praca}`);
  return { nome, quantidade: 1, observacao: null };
}

module.exports = { PRODUCAO, ITENS_LIMPOS, NOME_POR_PRACA, itemDaPraca };
