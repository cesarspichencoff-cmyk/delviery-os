'use strict';

const crypto = require('node:crypto');
const { writerInput } = require('./corpus');
const { validateWriterInput } = require('../dialogue/writer-contract');

function caseItem(id, category, turns, input, deterministicResponse) {
  return Object.freeze({
    schema_version: 'deliveryos-local-ai-diagnostic-case-v1',
    case_id: `LDIAG-${String(id).padStart(3, '0')}`,
    category,
    turns: Object.freeze(turns.map((turn) => Object.freeze({ ...turn }))),
    writer_input: Object.freeze(writerInput(input)),
    deterministic_response: deterministicResponse,
    expected_controls: Object.freeze(['no_unapproved_fact', 'no_unverified_action', 'no_pii', 'preserve_context'])
  });
}

function customer(text) { return { role: 'customer', text }; }
function assistant(text) { return { role: 'assistant', text }; }

function createDiagnosticCorpus() {
  const cases = [
    caseItem(1, 'greetings', [customer('oi')], { direct_response: ['Oi! Que bom receber sua mensagem.'], social_context: 'saudação curta e informal' }, 'Oi! Como posso ajudar?'),
    caseItem(2, 'greetings', [customer('boa noite')], { direct_response: ['Boa noite! Que bom receber sua mensagem.'], social_context: 'saudação noturna' }, 'Boa noite! Como posso ajudar?'),
    caseItem(3, 'greetings', [customer('tudo bem?')], { direct_response: ['Tudo bem por aqui, obrigado por perguntar.'], required_question: 'Como posso ajudar você?', social_context: 'conversa social breve' }, 'Tudo bem por aqui! Como posso ajudar você?'),
    caseItem(4, 'greetings', [customer('oi, tudo bem?')], { direct_response: ['Oi! Tudo bem por aqui, obrigado por perguntar.'], required_question: 'Como posso ajudar você?', social_context: 'saudação e pergunta social' }, 'Oi! Tudo bem por aqui. Como posso ajudar você?'),
    caseItem(5, 'greetings', [customer('boa noite, queria reservar')], { direct_response: ['Boa noite! Vamos continuar com a reserva.'], required_question: 'Para qual dia seria?', social_context: 'saudação que também inicia reserva' }, 'Boa noite! Para qual dia seria a reserva?'),
    caseItem(6, 'greetings', [customer('Quero reservar.'), assistant('Claro. Para qual dia seria?'), customer('Oi de novo')], { direct_response: ['Oi de novo! Podemos continuar de onde paramos.'], required_question: 'Para qual dia seria?', social_context: 'saudação durante jornada de reserva' }, 'Oi de novo! Para qual dia seria a reserva?'),
    caseItem(7, 'greetings', [customer('Quero reservar.'), assistant('Para qual dia seria?'), customer('Precisei sair.'), assistant('Sem problema.'), customer('Voltei')], { direct_response: ['Que bom que voltou. Podemos retomar de onde paramos.'], required_question: 'Para qual dia seria?', social_context: 'cliente retornou após pausa' }, 'Que bom que voltou. Para qual dia seria a reserva?'),

    caseItem(8, 'continuations', [assistant('A reserva seria para amanhã?'), customer('sim')], { direct_response: ['Certo, será para amanhã.'], required_question: 'Qual horário você prefere?', social_context: 'confirmação curta da data' }, 'Certo, será para amanhã. Qual horário você prefere?'),
    caseItem(9, 'continuations', [assistant('Para quantas pessoas?'), customer('quatro')], { authorized_facts: [{ field: 'party_size', value: 4 }], authorized_numbers: ['4'], required_question: 'Qual horário você prefere?', social_context: 'quantidade respondida em turno curto' }, 'Certo, serão 4 pessoas. Qual horário você prefere?'),
    caseItem(10, 'continuations', [assistant('Para qual dia seria?'), customer('amanhã')], { authorized_facts: [{ field: 'reservation_day', value: 'amanhã' }], required_question: 'Qual horário você prefere?', social_context: 'data respondida em turno curto' }, 'Certo, será para amanhã. Qual horário você prefere?'),
    caseItem(11, 'continuations', [assistant('Você quer continuar com a retirada?'), customer('isso')], { direct_response: ['Certo, vamos continuar com a retirada.'], required_question: 'Qual item você gostaria de retirar?', social_context: 'referência curta resolvida pelo turno anterior' }, 'Certo, vamos continuar com a retirada. Qual item você gostaria de retirar?'),
    caseItem(12, 'continuations', [assistant('Você prefere a primeira ou a segunda opção?'), customer('o segundo')], { authorized_facts: [{ field: 'selected_option', value: 'segunda opção' }], required_question: 'Quer confirmar essa escolha?', social_context: 'seleção por referência ordinal resolvida' }, 'Entendi, você escolheu a segunda opção. Quer confirmar essa escolha?'),
    caseItem(13, 'continuations', [assistant('Qual é o canal do pedido?'), customer('como falei, foi pelo iFood')], { authorized_facts: [{ field: 'order_channel', value: 'iFood' }], required_question: 'Qual é o número do pedido?', social_context: 'cliente repete dado já informado; não perguntar canal novamente' }, 'Entendi, o pedido foi pelo iFood. Qual é o número do pedido?'),
    caseItem(14, 'continuations', [assistant('Qual é o número do pedido?'), customer('já te passei')], { direction: ['Reconhecer que o dado já foi recebido e não solicitar novamente.'], required_question: 'Qual item foi afetado?', social_context: 'cliente aponta pergunta repetida' }, 'Você tem razão, esse dado já foi informado. Qual item foi afetado?'),
    caseItem(15, 'continuations', [assistant('Vamos continuar no mesmo pedido?'), customer('não, é outro pedido')], { direction: ['Separar o novo caso do pedido anterior.'], required_question: 'Qual é o número do outro pedido?', social_context: 'cliente inicia ocorrência de outro pedido' }, 'Entendi, é outro pedido. Qual é o número dele?'),

    caseItem(16, 'side_questions', [customer('Quero reservar.'), assistant('Para qual horário?'), customer('Antes, vocês têm valet?')], { direct_response: ['Temos valet em frente ao restaurante por R$ 45.'], authorized_numbers: ['R$ 45'], required_question: 'E para a reserva, qual horário você prefere?', social_context: 'pergunta lateral sobre valet com retomada de reserva' }, 'Temos valet em frente ao restaurante por R$ 45. E para a reserva, qual horário você prefere?'),
    caseItem(17, 'side_questions', [customer('Veio outro item no pedido.'), assistant('Qual item veio errado?'), customer('Antes, que horas vocês fecham?')], { direct_response: ['O horário precisa ser consultado conforme o dia e a unidade.'], required_question: 'Depois disso, qual item veio errado?', social_context: 'pergunta lateral sobre horário durante ocorrência' }, 'O horário depende do dia e da unidade. Depois disso, qual item veio errado?'),
    caseItem(18, 'side_questions', [customer('Quero informações para um evento.'), assistant('Qual é a data?'), customer('Antes, quais pagamentos aceitam?')], { direct_response: ['As formas de pagamento precisam ser confirmadas para a unidade.'], required_question: 'E qual é a data do evento?', social_context: 'pergunta lateral de pagamento durante evento' }, 'As formas de pagamento precisam ser confirmadas para a unidade. E qual é a data do evento?'),
    caseItem(19, 'side_questions', [customer('Tive um problema no iFood.'), assistant('Qual foi o problema?'), customer('Antes, vocês têm retirada?')], { direct_response: ['Sim, existe atendimento para retirada conforme a operação disponível.'], required_question: 'E sobre o iFood, qual foi o problema?', social_context: 'pergunta lateral e retomada de ocorrência iFood' }, 'Sim, existe atendimento para retirada. E sobre o iFood, qual foi o problema?'),

    caseItem(20, 'corrections', [customer('Somos sete.'), assistant('Certo, sete pessoas.'), customer('Na verdade, somos dez.')], { authorized_facts: [{ field: 'party_size', value: 10 }], authorized_numbers: ['10'], required_question: 'Qual horário vocês preferem?', social_context: 'correção de quantidade' }, 'Entendi a correção: são 10 pessoas. Qual horário vocês preferem?'),
    caseItem(21, 'corrections', [customer('Seria amanhã.'), assistant('Certo, amanhã.'), customer('Corrigindo, é depois de amanhã.')], { authorized_facts: [{ field: 'reservation_day', value: 'depois de amanhã' }], required_question: 'Qual horário você prefere?', social_context: 'correção de data' }, 'Entendi, será depois de amanhã. Qual horário você prefere?'),
    caseItem(22, 'corrections', [customer('Faltou a sobremesa.'), assistant('Entendi a falta da sobremesa.'), customer('Na verdade, foi a bebida.')], { authorized_facts: [{ field: 'item_name', value: 'bebida' }], required_question: 'Qual é o número do pedido?', gravity: 'sensitive', social_context: 'correção do item afetado' }, 'Entendi a correção: o item afetado foi a bebida. Qual é o número do pedido?'),
    caseItem(23, 'corrections', [customer('Foi no delivery.'), assistant('Certo, no delivery.'), customer('Corrigindo, foi no iFood.')], { authorized_facts: [{ field: 'order_channel', value: 'iFood' }], required_question: 'Qual é o número do pedido?', gravity: 'sensitive', social_context: 'correção do canal do pedido' }, 'Entendi, o canal correto é o iFood. Qual é o número do pedido?'),
    caseItem(24, 'corrections', [customer('Pode ser às sete.'), assistant('Certo, às sete.'), customer('Melhor às oito.')], { authorized_facts: [{ field: 'reservation_time', value: 'oito da noite' }], required_question: 'Para quantas pessoas será?', social_context: 'correção de horário sem expor número não autorizado' }, 'Entendi, o horário mudou para oito da noite. Para quantas pessoas será?'),
    caseItem(25, 'corrections', [customer('Queria pedir delivery.'), assistant('Posso ajudar com o pedido.'), customer('Na verdade, quero retirar.')], { direction: ['Mudar a jornada para retirada sem manter a intenção anterior.'], required_question: 'O que você gostaria de retirar?', social_context: 'correção de intenção' }, 'Entendi, você prefere retirar. O que gostaria de pedir?'),

    caseItem(26, 'reformulations', [assistant('A solicitação precisa ser acompanhada no canal do pedido.'), customer('não entendi')], { direct_response: ['Posso explicar de forma mais simples.'], direction: ['Reformular sem adicionar fatos.'], social_context: 'cliente não entendeu a orientação' }, 'Claro. Posso explicar de um jeito mais simples, sem mudar a informação.'),
    caseItem(27, 'reformulations', [assistant('A disponibilidade precisa ser confirmada antes de qualquer compromisso.'), customer('explica melhor')], { direction: ['Explicar com palavras simples sem confirmar disponibilidade.'], social_context: 'pedido de explicação mais clara' }, 'Claro. Primeiro precisamos confirmar a disponibilidade; só depois é possível dar uma resposta segura.'),
    caseItem(28, 'reformulations', [assistant('Vou registrar a ocorrência para acompanhamento.'), customer('como assim?')], { direction: ['Explicar que o relato será encaminhado, sem prometer solução.'], social_context: 'cliente pede esclarecimento sobre registro' }, 'Quer dizer que o relato será registrado e encaminhado para acompanhamento, sem prometer um resultado antes da análise.'),
    caseItem(29, 'reformulations', [assistant('O caso exige validação da equipe.'), customer('fala de outro jeito')], { direction: ['Reformular com linguagem natural e curta.'], social_context: 'cliente pede outra formulação' }, 'Claro. A equipe precisa conferir a situação antes de responder com segurança.'),

    caseItem(30, 'greetings', [customer('bom dia, preciso de ajuda')], { direct_response: ['Bom dia! Estou por aqui para ajudar.'], required_question: 'O que aconteceu?', social_context: 'saudação com pedido genérico de ajuda' }, 'Bom dia! Estou por aqui para ajudar. O que aconteceu?'),
    caseItem(31, 'continuations', [customer('Quero reservar.'), assistant('Para quantas pessoas?'), customer('quatro'), assistant('Qual dia?'), customer('como falei, amanhã')], { authorized_facts: [{ field: 'party_size', value: 4 }, { field: 'reservation_day', value: 'amanhã' }], authorized_numbers: ['4'], required_question: 'Qual horário você prefere?', social_context: 'continuidade com dois fatos já coletados; não repetir perguntas' }, 'Certo: 4 pessoas, amanhã. Qual horário você prefere?'),
    caseItem(32, 'side_questions', [customer('Meu pedido veio errado.'), assistant('Qual item?'), customer('Vocês abrem amanhã?'), assistant('O horário depende da unidade.'), customer('Voltando, veio outro acompanhamento.')], { authorized_facts: [{ field: 'item_name', value: 'acompanhamento' }], required_question: 'Qual é o número do pedido?', gravity: 'sensitive', social_context: 'retomada explícita após pergunta lateral' }, 'Entendi: veio outro acompanhamento. Qual é o número do pedido?')
  ];
  return Object.freeze({
    schema_version: 'deliveryos-local-ai-diagnostic-corpus-v1',
    seed: 'TATA-LOCAL-AI-DIAGNOSTIC-V1',
    total_cases: cases.length,
    canonical_hash: crypto.createHash('sha256').update(JSON.stringify(cases)).digest('hex'),
    cases: Object.freeze(cases)
  });
}

function validateDiagnosticCorpus(corpus) {
  const findings = [];
  if (corpus?.schema_version !== 'deliveryos-local-ai-diagnostic-corpus-v1') findings.push('DIAGNOSTIC_SCHEMA_INVALID');
  if (!Array.isArray(corpus?.cases) || corpus.cases.length === 0 || corpus.cases.length > 40) findings.push('DIAGNOSTIC_SIZE_INVALID');
  const ids = new Set();
  for (const item of corpus?.cases || []) {
    if (ids.has(item.case_id)) findings.push(`DIAGNOSTIC_ID_DUPLICATED:${item.case_id}`);
    ids.add(item.case_id);
    if (!validateWriterInput(item.writer_input).accepted) findings.push(`DIAGNOSTIC_WRITER_INPUT_INVALID:${item.case_id}`);
    const serialized = JSON.stringify(item);
    if (/C:\\Users\\|\b\d{3}[. ]?\d{3}[. ]?\d{3}[- ]?\d{2}\b|\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu.test(serialized)) findings.push(`DIAGNOSTIC_PII_PATTERN:${item.case_id}`);
  }
  return Object.freeze({ passed: findings.length === 0, findings: Object.freeze(findings), total_cases: corpus?.cases?.length || 0 });
}

module.exports = { createDiagnosticCorpus, validateDiagnosticCorpus };
