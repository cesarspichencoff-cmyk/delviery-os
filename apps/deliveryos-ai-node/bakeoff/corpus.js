'use strict';

const crypto = require('node:crypto');
const { validateWriterInput } = require('../dialogue/writer-contract');

const CATEGORY_REQUIREMENTS = Object.freeze({
  greetings: 20,
  continuations: 30,
  corrections: 20,
  side_questions: 20,
  interruptions_resumptions: 20,
  vague_references: 20,
  reformulations: 20,
  farewells_reopenings: 20,
  operational_problems: 30,
  ifood: 20,
  sensitive: 20,
  free_conversations: 20
});

function writerInput(overrides = {}) {
  const input = {
    direct_response: [],
    authorized_facts: [],
    selected_knowledge: [],
    direction: [],
    true_action: null,
    required_question: null,
    tone: 'tata_warm',
    gravity: 'informational',
    social_context: '',
    recent_phrases: [],
    prohibited_claims: [
      'Não confirmar reserva, fila ou disponibilidade sem ação verificada.',
      'Não prometer compensação, reembolso, crédito, cortesia ou reposição.',
      'Não diagnosticar nem atribuir causalidade.'
    ],
    authorized_links: [],
    authorized_numbers: [],
    maximum_length: 420,
    ...overrides
  };
  const checked = validateWriterInput(input);
  if (!checked.accepted) throw Object.assign(new Error(checked.reason), { code: checked.reason });
  return input;
}

function syntheticTurns(category, index) {
  if (category !== 'free_conversations') return [{ role: 'customer', text: 'Mensagem sintética do cenário.' }];
  const variants = [
    ['Oi', 'Olá! Como posso ajudar?', 'Quero organizar uma visita.', 'Claro. Para quando?', 'Amanhã.', 'Perfeito. Qual horário?', 'Antes, vocês têm valet?', 'Temos valet; qual horário você prefere?'],
    ['Boa noite', 'Boa noite! Em que posso ajudar?', 'Tenho uma dúvida sobre retirada.', 'Pode me contar.', 'Quero retirar um pedido.', 'Certo. O que deseja pedir?', 'Ainda estou escolhendo.', 'Sem problema. Posso ajudar com o cardápio.'],
    ['Olá', 'Olá! Como posso ajudar?', 'Tive um problema com um item.', 'Sinto muito. O que aconteceu?', 'O item não veio.', 'Qual item foi afetado?', 'Foi a bebida.', 'Entendi a falta da bebida.']
  ];
  return variants[index % variants.length].map((text, turn) => ({ role: turn % 2 === 0 ? 'customer' : 'assistant', text }));
}

function blueprint(category, index) {
  const variant = index % 4;
  if (category === 'greetings') {
    return {
      input: writerInput({ direct_response: ['Olá! Que bom receber sua mensagem.'], social_context: ['saudação inicial', 'retorno cordial', 'abertura curta', 'cliente informal'][variant] }),
      deterministic: ['Olá! Como posso ajudar?', 'Oi! O que você gostaria de saber?', 'Boa noite! Como posso ajudar?', 'Olá! Pode me contar o que você precisa.'][variant]
    };
  }
  if (category === 'continuations') {
    return {
      input: writerInput({ required_question: ['Qual horário você prefere?', 'Para qual dia seria?', 'O pedido foi feito pelo delivery do TATÁ ou pelo iFood?', 'Qual item foi afetado?'][variant], social_context: 'continuação de uma jornada já iniciada' }),
      deterministic: ['Certo. Qual horário você prefere?', 'Perfeito. Para qual dia seria?', 'Entendi. O pedido foi feito pelo delivery do TATÁ ou pelo iFood?', 'Certo. Qual item foi afetado?'][variant]
    };
  }
  if (category === 'corrections') {
    return {
      input: writerInput({ authorized_facts: [{ field: 'party_size', value: 10 }], authorized_numbers: ['10'], required_question: 'Qual horário vocês preferem?', social_context: 'cliente corrigiu a quantidade do grupo' }),
      deterministic: 'Entendi a correção: são 10 pessoas. Qual horário vocês preferem?'
    };
  }
  if (category === 'side_questions') {
    return {
      input: writerInput({ direct_response: ['Temos valet em frente ao restaurante por R$ 45.'], authorized_numbers: ['R$ 45'], required_question: 'E para a reserva, qual horário vocês preferem?', social_context: 'pergunta lateral durante jornada de reserva' }),
      deterministic: 'Temos valet em frente ao restaurante por R$ 45. E para a reserva, qual horário vocês preferem?'
    };
  }
  if (category === 'interruptions_resumptions') {
    return {
      input: writerInput({ direct_response: ['Sem problema; podemos retomar de onde paramos.'], required_question: 'Você ainda quer continuar com a reserva?', social_context: 'jornada interrompida e retomada' }),
      deterministic: 'Sem problema. Você ainda quer continuar com a reserva?'
    };
  }
  if (category === 'vague_references') {
    return {
      input: writerInput({ required_question: 'Você pode me dizer a qual item está se referindo?', social_context: 'referência ambígua sem candidato seguro' }),
      deterministic: 'Quero confirmar direitinho: você pode me dizer a qual item está se referindo?'
    };
  }
  if (category === 'reformulations') {
    return {
      input: writerInput({ direct_response: ['Posso explicar de outra forma.'], direction: ['Reformular sem adicionar fatos.'], social_context: 'cliente pediu explicação mais simples' }),
      deterministic: 'Claro. Posso explicar de outra forma, sem mudar a informação.'
    };
  }
  if (category === 'farewells_reopenings') {
    return {
      input: writerInput({ direct_response: variant < 2 ? ['Obrigado pela conversa. Até mais!'] : ['Bem-vindo de volta. Podemos começar um novo assunto.'], social_context: variant < 2 ? 'despedida' : 'reabertura após encerramento' }),
      deterministic: variant < 2 ? 'Obrigado pela conversa. Até mais!' : 'Bem-vindo de volta! Pode me contar o novo assunto.'
    };
  }
  if (category === 'operational_problems') {
    return {
      input: writerInput({
        authorized_facts: [{ field: 'item_name', value: ['refrigerante', 'shoyu', 'sobremesa', 'acompanhamento'][variant] }],
        direction: ['Registrar a ocorrência e direcionar para acompanhamento humano.'],
        required_question: variant < 2 ? 'Qual é o canal do pedido?' : 'Qual é o número do pedido?',
        gravity: 'sensitive',
        social_context: 'item faltante ou incorreto'
      }),
      deterministic: `Sinto muito pelo ocorrido com ${['o refrigerante', 'o shoyu', 'a sobremesa', 'o acompanhamento'][variant]}. ${variant < 2 ? 'Qual é o canal do pedido?' : 'Qual é o número do pedido?'}`
    };
  }
  if (category === 'ifood') {
    return {
      input: writerInput({ direct_response: ['No iFood, a solicitação deve ser acompanhada pelo próprio pedido no aplicativo.'], direction: ['Orientar sem culpar a plataforma nem prometer resultado.'], social_context: 'atendimento relacionado ao iFood' }),
      deterministic: 'No iFood, acompanhe a solicitação pelo próprio pedido no aplicativo. Se precisar, posso orientar o próximo passo.'
    };
  }
  if (category === 'sensitive') {
    return {
      input: writerInput({ direct_response: ['Esse relato precisa de acompanhamento imediato da equipe de qualidade e da gestão.'], direction: ['Acolher sem diagnóstico, causalidade ou minimização.'], required_question: 'Quais sinais foram percebidos?', gravity: 'critical', social_context: 'segurança dos alimentos' }),
      deterministic: 'Sinto muito pelo que aconteceu. Esse relato precisa de acompanhamento imediato da equipe de qualidade e da gestão. Quais sinais foram percebidos?'
    };
  }
  return {
    input: writerInput({ direct_response: ['Posso ajudar a continuar por aqui.'], required_question: ['Qual horário você prefere?', 'O que você gostaria de pedir?', 'Qual ponto quer retomar?', 'Como posso ajudar agora?'][variant], social_context: 'conversa livre com contexto preservado' }),
    deterministic: ['Claro. Qual horário você prefere?', 'Perfeito. O que você gostaria de pedir?', 'Podemos retomar. Qual ponto você quer continuar?', 'Estou por aqui. Como posso ajudar agora?'][variant]
  };
}

function hash(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function createBakeoffCorpus(options = {}) {
  const seed = String(options.seed || 'TATA-LOCAL-AI-BAKEOFF-V1');
  const raw = [];
  for (const [category, count] of Object.entries(CATEGORY_REQUIREMENTS)) {
    for (let index = 0; index < count; index += 1) {
      const item = blueprint(category, index);
      raw.push({
        source_key: `${category}:${String(index + 1).padStart(3, '0')}`,
        category,
        turns: syntheticTurns(category, index),
        writer_input: item.input,
        deterministic_response: item.deterministic,
        expected_controls: ['no_unapproved_fact', 'no_unverified_action', 'no_pii']
      });
    }
  }
  const ordered = raw.sort((a, b) => hash(`${seed}|${a.source_key}`).localeCompare(hash(`${seed}|${b.source_key}`)));
  const cases = ordered.map((item, index) => ({
    schema_version: 'deliveryos-local-ai-bakeoff-case-v1',
    case_id: `LBAKE-${String(index + 1).padStart(3, '0')}`,
    ...item
  }));
  return Object.freeze({
    schema_version: 'deliveryos-local-ai-bakeoff-corpus-v1',
    seed,
    counts: Object.freeze(Object.fromEntries(Object.keys(CATEGORY_REQUIREMENTS).map((category) => [category, cases.filter((item) => item.category === category).length]))),
    cases: Object.freeze(cases)
  });
}

function validateBakeoffCorpus(corpus) {
  const findings = [];
  if (corpus?.schema_version !== 'deliveryos-local-ai-bakeoff-corpus-v1') findings.push('CORPUS_SCHEMA_INVALID');
  if (!Array.isArray(corpus?.cases)) findings.push('CORPUS_CASES_INVALID');
  for (const [category, minimum] of Object.entries(CATEGORY_REQUIREMENTS)) {
    if (Number(corpus?.counts?.[category] || 0) < minimum) findings.push(`CATEGORY_TOO_SMALL:${category}`);
  }
  const ids = new Set();
  for (const item of corpus?.cases || []) {
    if (ids.has(item.case_id)) findings.push('CASE_ID_DUPLICATED');
    ids.add(item.case_id);
    if (!validateWriterInput(item.writer_input).accepted) findings.push(`WRITER_INPUT_INVALID:${item.case_id}`);
    if (item.category === 'free_conversations' && item.turns.length < 8) findings.push(`FREE_CONVERSATION_TOO_SHORT:${item.case_id}`);
    const serialized = JSON.stringify(item);
    if (/C:\\Users\\|\b\d{3}[. ]?\d{3}[. ]?\d{3}[- ]?\d{2}\b|\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu.test(serialized)) findings.push(`PII_PATTERN:${item.case_id}`);
  }
  return Object.freeze({ passed: findings.length === 0, findings: Object.freeze([...new Set(findings)]), total_cases: corpus?.cases?.length || 0 });
}

module.exports = { CATEGORY_REQUIREMENTS, writerInput, syntheticTurns, blueprint, createBakeoffCorpus, validateBakeoffCorpus };
