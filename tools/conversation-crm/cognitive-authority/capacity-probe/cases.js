'use strict';

function menuState(overrides = {}) {
  return {
    objective_known: 'escolher sushi',
    channel: 'delivery_simulado',
    compact_state: 'Três opções sintéticas foram apresentadas e nenhuma escolha foi confirmada.',
    references: {
      first: 'Opção Alfa',
      second: 'Opção Beta',
      third: 'Opção Gama'
    },
    established_facts: ['As três opções são sintéticas.', 'Nenhuma escolha foi confirmada.'],
    last_plan: 'Ajudar a comparar as três opções apresentadas.',
    limits: ['Não inventar composição, preço, alergênico ou disponibilidade.'],
    transcript: [
      { role: 'assistant', content: 'Posso considerar Opção Alfa, Opção Beta e Opção Gama.' }
    ],
    ...overrides
  };
}

function reservationState(overrides = {}) {
  return {
    objective_known: 'reserva',
    channel: 'salao_simulado',
    compact_state: 'Reserva em andamento; quantidade já conhecida.',
    references: {},
    established_facts: ['Quantidade atual: 4 pessoas.'],
    last_plan: 'Coletar a data e o horário desejados.',
    limits: ['Não confirmar reserva sem execução da ferramenta.'],
    transcript: [{ role: 'assistant', content: 'Para qual dia e horário você gostaria?' }],
    ...overrides
  };
}

function withMessage(state, message) {
  return Object.freeze({ ...state, current_message: message });
}

const CORE_CASES = Object.freeze([
  { case_id: 'A', input: withMessage(menuState(), 'tem mais opções?'), oracle: { relations: ['CONTINUE', 'REFINE'], actions: ['EXPAND'], concepts: ['opç'] } },
  { case_id: 'B', input: withMessage(menuState(), 'por que só essas?'), oracle: { relations: ['CONTINUE'], actions: ['EXPLAIN'], concepts: ['critér', 'seleç', 'escolh'] } },
  { case_id: 'C', input: withMessage(menuState(), 'não gostei de nenhuma'), oracle: { relations: ['REFINE'], actions: ['EXPAND', 'CLARIFY'], concepts: ['outr', 'prefer'] } },
  { case_id: 'D', input: withMessage(menuState(), 'qual foi seu critério?'), oracle: { relations: ['CONTINUE'], actions: ['EXPLAIN'], concepts: ['critér', 'seleç'] } },
  { case_id: 'E', input: withMessage(menuState(), 'qual você escolheria pra mim?'), oracle: { relations: ['CONTINUE', 'REFINE'], actions: ['COMPARE'], concepts: ['compar', 'prefer', 'escolh'] } },
  { case_id: 'F', input: withMessage(menuState(), 'essa segunda é crua?'), oracle: { relations: ['CONTINUE'], actions: ['ANSWER', 'USE_TOOL'], concepts: ['segunda', 'beta'], reference: true } },
  { case_id: 'G', input: withMessage(menuState({ compact_state: 'O atendimento desviou para bebidas; antes disso a pessoa havia pedido sushi.', last_plan: 'Apresentar bebidas.' }), 'não, eu falei sushi'), oracle: { relations: ['CORRECT'], actions: ['ANSWER', 'CLARIFY', 'SWITCH_FLOW'], concepts: ['sushi'], repair: true, rejected: true } },
  { case_id: 'H', input: withMessage(menuState(), 'acho que vou aí então'), oracle: { relations: ['SWITCH', 'REFINE'], actions: ['CLARIFY', 'SWITCH_FLOW'], concepts: ['salão', 'ir', 'presencial'] } },
  { case_id: 'I', input: withMessage(menuState(), 'esquece isso, quero reservar pra 7'), oracle: { relations: ['SWITCH'], actions: ['SWITCH_FLOW'], concepts: ['reserv', '7', 'sete'] } },
  { case_id: 'J', input: withMessage(reservationState(), 'vocês têm valet?'), oracle: { relations: ['INTERRUPT'], actions: ['ANSWER', 'USE_TOOL'], concepts: ['valet'], preserve: true } },
  { case_id: 'K', input: withMessage(reservationState({ compact_state: 'A escolha de sushi foi suspensa para responder uma dúvida lateral.', last_plan: 'Retomar a escolha de sushi após a dúvida.', established_facts: ['Jornada suspensa: escolher sushi.'] }), 'voltando ao que eu estava escolhendo'), oracle: { relations: ['RESUME'], actions: ['RESUME'], concepts: ['retom', 'escolh', 'sushi'] } },
  { case_id: 'L', input: withMessage(menuState({ objective_known: 'desconhecido', compact_state: 'Nenhuma preferência foi estabelecida.', references: {}, established_facts: [], last_plan: 'Descobrir o que seria uma boa experiência.' }), 'não sei explicar, só queria comer uma coisa boa hoje'), oracle: { relations: ['OPEN'], actions: ['CLARIFY'], concepts: ['prefer', 'descobr', 'gost', 'experi'] } },
  { case_id: 'M', input: withMessage(menuState({ objective_known: 'comer japonês', channel: 'desconhecido', compact_state: 'A pessoa ainda não decidiu entre pedir e ir ao salão.', references: {}, established_facts: ['Deseja comida japonesa.'], last_plan: 'Entender o formato desejado.' }), 'quero comer japonês mas nem sei se vou pedir ou ir aí'), oracle: { relations: ['OPEN', 'REFINE'], actions: ['CLARIFY', 'COMPARE'], concepts: ['delivery', 'pedir', 'salão', 'ir'] } },
  { case_id: 'N', input: withMessage(menuState({ compact_state: 'A resposta anterior tratou preço, mas a pergunta original era sobre composição.', last_plan: 'Responder sobre preço.' }), 'não foi isso que eu perguntei'), oracle: { relations: ['CORRECT'], actions: ['CLARIFY'], concepts: ['pergunt', 'entend'], repair: true, rejected: true } },
  { case_id: 'O', input: withMessage(menuState(), 'e fora essas?'), oracle: { relations: ['CONTINUE', 'REFINE'], actions: ['EXPAND'], concepts: ['outr', 'além', 'opç'] } },
  { case_id: 'P', input: withMessage(menuState(), 'tem alguma parecida com a segunda?'), oracle: { relations: ['CONTINUE', 'REFINE'], actions: ['COMPARE', 'USE_TOOL'], concepts: ['segunda', 'beta', 'parecid', 'similar'], reference: true } },
  { case_id: 'Q', input: withMessage(menuState({ established_facts: ['Preferência anterior: salmão.', 'Nenhuma escolha foi confirmada.'] }), 'na verdade prefiro atum'), oracle: { relations: ['CORRECT', 'REFINE'], actions: ['EXPAND', 'COMPARE', 'USE_TOOL'], concepts: ['atum'] } },
  { case_id: 'R', input: withMessage(reservationState({ established_facts: ['Quantidade anterior: 4 pessoas.'] }), 'somos cinco agora'), oracle: { relations: ['REFINE', 'CORRECT'], actions: ['ANSWER', 'CLARIFY'], concepts: ['5', 'cinco'] } },
  { case_id: 'S', input: withMessage(menuState(), 'minha irmã tem alergia a camarão'), oracle: { relations: ['CONTINUE', 'REFINE'], actions: ['CLARIFY', 'USE_TOOL'], concepts: ['alerg', 'camarão'], safety: 'preventive' } },
  { case_id: 'T', input: withMessage(menuState({ compact_state: 'Foi relatada alergia a camarão no turno anterior.', established_facts: ['Uma pessoa do grupo tem alergia a camarão.'] }), 'ela comeu e agora não consegue respirar direito'), oracle: { relations: ['CONTINUE', 'REFINE'], actions: ['USE_TOOL', 'ANSWER'], concepts: ['urg', 'emerg', 'respir', 'socorro'], safety: 'critical' } }
]);

const PARAPHRASE_CASES = Object.freeze([
  { case_id: 'U', input: withMessage(menuState(), 'tem outras além delas?'), oracle: { relations: ['CONTINUE', 'REFINE'], actions: ['EXPAND'], concepts: ['outr', 'além', 'opç'], paraphrase_of: 'A' } },
  { case_id: 'V', input: withMessage(menuState(), 'como chegou nessas três?'), oracle: { relations: ['CONTINUE'], actions: ['EXPLAIN'], concepts: ['critér', 'seleç', 'escolh'], paraphrase_of: 'B' } },
  { case_id: 'W', input: withMessage(menuState(), 'você entendeu errado: eu quero ir ao salão, não pedir'), oracle: { relations: ['CORRECT'], actions: ['SWITCH_FLOW'], concepts: ['salão', 'presencial', 'ir'], paraphrase_of: 'G', repair: true, rejected: true } },
  { case_id: 'X', input: withMessage(menuState(), 'deixa isso pra lá. Quero mesa para seis amanhã'), oracle: { relations: ['SWITCH'], actions: ['SWITCH_FLOW'], concepts: ['reserv', 'mesa', '6', 'seis'], paraphrase_of: 'I' } }
]);

const PROBE_CASES = Object.freeze([...CORE_CASES, ...PARAPHRASE_CASES]);

function runtimeCases() {
  return PROBE_CASES.map(({ case_id, input }) => Object.freeze({ case_id, input }));
}

function oracleFor(caseId) {
  return PROBE_CASES.find((item) => item.case_id === caseId)?.oracle || null;
}

module.exports = { CORE_CASES, PARAPHRASE_CASES, PROBE_CASES, runtimeCases, oracleFor };

