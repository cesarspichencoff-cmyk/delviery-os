'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { validatePlan } = require('../../tools/conversation-crm/cognitive-authority/b2/contract');
const { approvePlan } = require('../../tools/conversation-crm/cognitive-authority/b2/authority');
const { DeterministicB2Writer, validateWriterText } = require('../../tools/conversation-crm/cognitive-authority/b2/writer');
const { B2Pipeline } = require('../../tools/conversation-crm/cognitive-authority/b2/pipeline');

function plan(overrides = {}) {
  return {
    relation_to_history: 'CONTINUE',
    conversational_move: 'ANSWER',
    tool_requirement: 'CATALOG_SEARCH',
    user_goal: 'escolher uma refeição adequada',
    what_changed: 'a pessoa informou critérios para a escolha',
    repair: { required: false, acknowledgement: null },
    reference: { required: true, status: 'RESOLVED', target: 'a refeição solicitada' },
    safety_priority: 'NONE',
    next_best_step: 'consultar o catálogo antes de sugerir opções',
    ...overrides
  };
}

function pipelineFor(rawPlan, writer) {
  return new B2Pipeline({
    planner: { async plan() { return { accepted: true, plan: rawPlan, adapter_id: 'directed-proof' }; } },
    writer
  });
}

test('NEEDS_TOOL com resultado autorizado publica progresso factual', async () => {
  const output = await pipelineFor(plan()).execute({
    planner_packet: { current_message: 'O que você encontrou?' },
    authority_context: {
      tool_results: { CATALOG_SEARCH: { facts: [{ field: 'option', value: 'Hot roll de legumes' }] } }
    }
  });
  assert.equal(output.accepted, true);
  assert.equal(output.response_plan.publication_outcome, 'AUTHORIZED_RESULT');
  assert.match(output.response, /Hot roll de legumes/u);
});

test('resultado vazio ou falho de ferramenta nunca é tratado como fato aprovado', async () => {
  for (const toolResult of [
    { status: 'completed', facts: [], knowledge: [] },
    { status: 'failed', facts: [{ field: 'option', value: 'Resultado não utilizável' }] }
  ]) {
    const output = await pipelineFor(plan()).execute({
      planner_packet: { current_message: 'Já terminou?' },
      authority_context: { tool_results: { CATALOG_SEARCH: toolResult } }
    });
    assert.equal(output.accepted, true);
    assert.equal(output.response_plan.publication_outcome, 'EXPLICIT_LIMITATION');
    assert.equal(output.response_plan.approved_tool_result, null);
    assert.deepEqual(output.response_plan.approved_facts, []);
    assert.doesNotMatch(output.response, /Resultado não utilizável/u);
  }
});

test('NEEDS_TOOL sem executor publica limitação honesta, sem promessa futura', async () => {
  const output = await pipelineFor(plan()).execute({
    planner_packet: { current_message: 'O que você encontrou?' },
    authority_context: {}
  });
  assert.equal(output.accepted, true);
  assert.equal(output.response_plan.publication_outcome, 'EXPLICIT_LIMITATION');
  assert.match(output.response, /não consigo (?:consultar|acessar)/iu);
  assert.doesNotMatch(output.response, /vou (?:conferir|verificar|consultar)|fico no aguardo/iu);
});

test('dois turnos idênticos sem mudança de estado não podem publicar a mesma espera', async () => {
  const pipeline = pipelineFor(plan());
  const first = await pipeline.execute({ planner_packet: { current_message: 'Pode ver?' }, authority_context: {} });
  const second = await pipeline.execute({
    planner_packet: { current_message: 'E agora?' },
    authority_context: {},
    previous_publication: { response: first.response, progress_state_hash: first.progress_state_hash }
  });
  assert.equal(first.accepted, true);
  assert.equal(second.accepted, false);
  assert.equal(second.stage, 'validator');
  assert.equal(second.reason, 'B2_NO_PROGRESS_WITHOUT_STATE_CHANGE');
});

test('reformular a espera sem mudança de estado também não conta como progresso', async () => {
  let attempt = 0;
  const pipeline = pipelineFor(plan(), {
    async write() {
      attempt += 1;
      return {
        accepted: true,
        source: 'primary',
        text: attempt === 1
          ? 'Não consigo consultar o cardápio agora. Posso organizar seus critérios.'
          : 'A consulta segue indisponível. Posso deixar seus critérios organizados.'
      };
    }
  });
  const first = await pipeline.execute({ planner_packet: { current_message: 'Pode consultar?' }, authority_context: {} });
  const second = await pipeline.execute({
    planner_packet: { current_message: 'E se disser de outro jeito?' },
    authority_context: {},
    previous_publication: { response: first.response, progress_state_hash: first.progress_state_hash }
  });
  assert.equal(first.accepted, true);
  assert.equal(second.accepted, false);
  assert.equal(second.reason, 'B2_NO_PROGRESS_WITHOUT_STATE_CHANGE');
});

test('mudança real de operação não é bloqueada como repetição de estado', async () => {
  const pipeline = pipelineFor(plan());
  const first = await pipeline.execute({
    planner_packet: { current_message: 'Quero saber do combinado.' },
    authority_context: {
      operation_fingerprint: 'operation-combinado',
      tool_results: {
        CATALOG_SEARCH: {
          status: 'completed', request_fingerprint: 'operation-combinado', result_fingerprint: 'operation-combinado',
          knowledge: ['Ainda não há preço confirmado para o combinado.']
        }
      }
    }
  });
  const second = await pipeline.execute({
    planner_packet: { current_message: 'Quero saber do menu executivo.' },
    authority_context: {
      operation_fingerprint: 'operation-menu-executivo',
      tool_results: {
        CATALOG_SEARCH: {
          status: 'completed', request_fingerprint: 'operation-menu-executivo', result_fingerprint: 'operation-menu-executivo',
          knowledge: ['Ainda não há preço confirmado para o combinado.']
        }
      }
    },
    previous_publication: {
      response: first.response,
      progress_state_hash: first.progress_state_hash,
      operation_fingerprint: first.response_plan.operation_fingerprint
    }
  });
  assert.equal(first.accepted, true);
  assert.equal(second.accepted, true);
  assert.notEqual(first.progress_state_hash, second.progress_state_hash);
});

test('resultado factual ligado a outra consulta é removido antes da publicação', async () => {
  const output = await pipelineFor(plan({
    required_response_commitments: [{ kind: 'GOAL', content: 'preço do rodízio' }]
  })).execute({
    planner_packet: { current_message: 'Quanto custa o rodízio?' },
    authority_context: {
      operation_fingerprint: 'price:rodizio',
      tool_results: {
        CATALOG_SEARCH: {
          status: 'completed',
          request_fingerprint: 'price:itens-anteriores',
          result_fingerprint: 'price:itens-anteriores',
          knowledge: ['Salmão R$ 92,00, Hot Roll R$ 46,00 e Ebi R$ 80,00.']
        }
      }
    }
  });
  assert.equal(output.accepted, true);
  assert.equal(output.response_plan.publication_outcome, 'EXPLICIT_LIMITATION');
  assert.equal(output.response_plan.fact_boundary_reason, 'STALE_FACT_RESULT_REUSE');
  assert.equal(output.response_plan.approved_tool_result, null);
  assert.doesNotMatch(output.response, /R\$\s*(?:92|46|80)/u);
  assert.match(output.response, /rodízio/iu);
});

test('cada token de preço publicado precisa existir na autoridade', () => {
  const approved = approvePlan(plan(), {
    tool_results: {
      CATALOG_SEARCH: { status: 'completed', knowledge: ['O combinado custa R$ 92,00.'] }
    }
  }).response_plan;
  assert.equal(validateWriterText('O combinado custa R$ 92,00.', approved).accepted, true);
  const mixed = validateWriterText('O combinado custa R$ 92,00 e o rodízio custa R$ 180,00.', approved);
  assert.equal(mixed.accepted, false);
  assert.equal(mixed.reason, 'B2_WRITER_UNSUPPORTED_PRICE');
});

test('pergunta específica necessária sobrevive até a publicação', async () => {
  const rawPlan = plan({
    conversational_move: 'CLARIFY',
    tool_requirement: 'RESTAURANT_INFO',
    reference: { required: true, status: 'NEEDS_CLARIFICATION', target: 'o nome do bairro correto de entrega' },
    next_best_step: 'pedir o nome do bairro correto e depois consultar a área atendida'
  });
  const output = await pipelineFor(rawPlan).execute({ planner_packet: { current_message: 'É o bairro correto.' } });
  assert.equal(output.accepted, true);
  assert.match(output.response, /nome do bairro correto/iu);
  assert.equal(output.response_plan.publication_outcome, 'CONCRETE_NEXT_STEP');
});

test('pergunta específica remove instruções posteriores do próximo passo', async () => {
  const output = await pipelineFor(plan({
    conversational_move: 'CLARIFY',
    tool_requirement: 'OTHER_ALLOWED_TOOL',
    reference: { required: true, status: 'NEEDS_CONTEXT_LOOKUP', target: 'o pedido atual' },
    next_best_step: 'Solicitar os dados mínimos para localizar o pedido e o número correto; então usar a capacidade autorizada'
  })).execute({ planner_packet: { current_message: 'O número está errado.' } });
  assert.equal(output.accepted, true);
  assert.equal(output.response_plan.required_question, 'Você pode informar os dados mínimos para localizar o pedido e o número correto?');
  assert.doesNotMatch(output.response, /capacidade autorizada/iu);
});

test('restrição material explícita sobrevive no Writer principal e fallback', async () => {
  const rawPlan = plan({
    required_response_commitments: [{ kind: 'CONSTRAINT', content: 'sem peixe cru' }]
  });
  const primary = await pipelineFor(rawPlan, {
    async write() { return { accepted: true, source: 'primary', text: 'Posso ajudar com a escolha.' }; }
  }).execute({ planner_packet: { current_message: 'Sem peixe cru.' }, authority_context: {} });
  assert.equal(primary.accepted, true);
  assert.equal(primary.writer_source, 'deterministic_b2_writer');
  assert.equal(primary.writer_limit, 'B2_WRITER_DROPPED_REQUIRED_COMMITMENT');
  assert.match(primary.response, /sem peixe cru/iu);
});

test('repair e referência relevantes sobrevivem até a publicação', async () => {
  const rawPlan = plan({
    relation_to_history: 'CORRECT',
    conversational_move: 'CLARIFY',
    tool_requirement: 'OTHER_ALLOWED_TOOL',
    repair: { required: true, acknowledgement: 'Desculpe por não ter pedido isso claramente antes.' },
    reference: { required: true, status: 'NEEDS_CONTEXT_LOOKUP', target: 'o número correto do endereço' },
    next_best_step: 'pedir o número correto do endereço antes de localizar o pedido',
    required_response_commitments: [{ kind: 'REFERENCE', content: 'número correto do endereço' }]
  });
  const output = await pipelineFor(rawPlan).execute({ planner_packet: { current_message: 'O que falta?' } });
  assert.equal(output.accepted, true);
  assert.match(output.response, /Desculpe/iu);
  assert.match(output.response, /número correto do endereço/iu);
});

test('resultado autorizado resolve referência que exigia lookup', async () => {
  const output = await pipelineFor(plan({
    tool_requirement: 'OTHER_ALLOWED_TOOL',
    reference: { required: true, status: 'NEEDS_CONTEXT_LOOKUP', target: 'o pedido atual' }
  })).execute({
    planner_packet: { current_message: 'Conseguiu localizar?' },
    authority_context: { tool_results: { OTHER_ALLOWED_TOOL: { status: 'completed', knowledge: ['O pedido atual foi localizado.'] } } }
  });
  assert.equal(output.accepted, true);
  assert.equal(output.response_plan.status, 'APPROVED');
  assert.equal(output.response_plan.publication_outcome, 'AUTHORIZED_RESULT');
  assert.match(output.response, /pedido atual foi localizado/iu);
});

test('repair sobrevive também quando a ferramenta não retorna resultado', async () => {
  const output = await pipelineFor(plan({
    relation_to_history: 'CORRECT',
    repair: { required: true, acknowledgement: 'Sinto muito pela demora e pela falta de atualização.' },
    required_response_commitments: [{ kind: 'GOAL', content: 'previsão concreta para decidir se ainda espera' }]
  })).execute({ planner_packet: { current_message: 'Ainda estou esperando.' }, authority_context: {} });
  assert.equal(output.accepted, true);
  assert.match(output.response, /Sinto muito pela demora/iu);
  assert.match(output.response, /previsão concreta/iu);
  assert.match(output.response, /não consigo consultar/iu);
});

test('Validator bloqueia perda material de commitment mesmo com pergunta qualquer', () => {
  const approved = approvePlan(plan({
    conversational_move: 'CLARIFY',
    reference: { required: true, status: 'NEEDS_CLARIFICATION', target: 'o teto máximo de gasto' },
    next_best_step: 'pedir o teto máximo de gasto',
    required_response_commitments: [{ kind: 'CONSTRAINT', content: 'itens vegetarianos' }]
  }), {}).response_plan;
  assert.equal(validateWriterText('Qual é o seu nome?', approved).reason, 'B2_WRITER_DROPPED_REQUIRED_COMMITMENT');
});

test('Validator preserva valor numérico e sentido negativo de restrições', () => {
  const approved = approvePlan(plan({
    required_response_commitments: [
      { kind: 'CONSTRAINT', content: 'limite de gasto: R$ 120' },
      { kind: 'CONSTRAINT', content: 'sem peixe cru' }
    ]
  }), {}).response_plan;
  assert.equal(validateWriterText('Entendi o limite de gasto e a preferência por peixe cru.', approved).reason, 'B2_WRITER_DROPPED_REQUIRED_COMMITMENT');
  assert.equal(validateWriterText('Entendi: limite de gasto R$ 120 e sem peixe cru.', approved).accepted, true);
});

test('commitments não autorizam invenção factual', async () => {
  const rawPlan = plan({ required_response_commitments: [{ kind: 'CONSTRAINT', content: 'sem peixe cru' }] });
  const output = await pipelineFor(rawPlan, {
    async write() { return { accepted: true, source: 'primary', text: 'Entendi: sem peixe cru. O combinado está disponível por R$ 49,90.' }; }
  }).execute({ planner_packet: { current_message: 'Sem peixe cru.' }, authority_context: { prohibited_claims: ['preço confirmado'] } });
  assert.equal(output.accepted, true);
  assert.equal(output.writer_source, 'deterministic_b2_writer');
  assert.match(output.response, /não consigo consultar/iu);
  assert.doesNotMatch(output.response, /R\$/u);
});

test('Contract V2 aceita commitments opcionais e rejeita kind desconhecido', () => {
  assert.equal(validatePlan(plan({ required_response_commitments: [{ kind: 'CONSTRAINT', content: 'sem fritura' }] })).accepted, true);
  assert.equal(validatePlan(plan({ required_response_commitments: [{ kind: 'DIAGNOSIS', content: 'alergia presumida' }] })).reason, 'B2_COMMITMENTS_INVALID');
});
