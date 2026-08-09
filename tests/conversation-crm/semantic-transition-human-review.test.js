'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { HomologationService } = require('../../tools/conversation-crm/homologation/service');
const { CustomerMenuHomologationService } = require('../../tools/conversation-crm/customer-menu/service');
const { itemMatchesRequestedCategory } = require('../../src/conversation-crm/menu-intelligence/recommendation');
const { evaluateConversation } = require('../../tools/conversation-crm/experience-lab/hard-evaluator');
const { buildSemanticTransitionCatalog } = require('../../tools/conversation-crm/experience-lab/semantic-transition-catalog');
const { FreeSyntheticCustomer } = require('../../tools/conversation-crm/experience-lab/synthetic-customer');
const { runExperienceLab } = require('../../tools/conversation-crm/experience-lab/runner');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const GENERIC = /ainda n[aã]o tenho uma confirma[cç][aã]o segura|restaurante, uma reserva ou um pedido/iu;

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'deliveryos-semantic-transition-'));
  const customerMenu = new CustomerMenuHomologationService({
    projectRoot: PROJECT_ROOT,
    menuReviewRoot: path.join(root, 'review')
  });
  const homologation = new HomologationService({
    projectRoot: PROJECT_ROOT,
    feedbackRoot: path.join(root, 'feedback'),
    chatRuntimeRoot: path.join(root, 'chat'),
    customerMenu
  });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return {
    customerMenu,
    send(message) { return homologation.chatExecution({ message }); }
  };
}

test('primeira divergência humana reconhece saudação com intenção de sair para comer', (t) => {
  const { send } = fixture(t);
  const turn = send('Boa noite, tudo bem? Preciso muito de um lugar para comer hoje').publicResult.turn;
  assert.equal(turn.diagnostic.turn_analysis.goal, 'dine_out');
  assert.equal(turn.diagnostic.journey, 'restaurant_information');
  assert.match(turn.response, /TATÁ|unidade|reserva/iu);
  assert.doesNotMatch(turn.response, GENERIC);
});

test('linguagem aberta de jantar e visita entra em descoberta do restaurante', (t) => {
  const variants = [
    'quero um lugar pra jantar hoje',
    'tô procurando onde comer hoje',
    'quero sair pra comer',
    'queria comer japonês hoje',
    'queria ir no Tatá hoje',
    'como faço pra ir aí?'
  ];
  for (const message of variants) {
    const { send } = fixture(t);
    const turn = send(message).publicResult.turn;
    assert.equal(turn.diagnostic.turn_analysis.goal, 'dine_out', message);
    assert.doesNotMatch(turn.response, GENERIC, message);
  }
});

test('USER_REPAIR_SIGNAL rejeita a hipótese anterior e não repete o fallback', (t) => {
  const { send } = fixture(t);
  send('Preciso de um lugar para comer hoje');
  const repaired = send('estou dizendo que quero comer amigo, voce nao esta entendendo?').publicResult.turn;
  assert.equal(repaired.diagnostic.user_repair_signal, true);
  assert.equal(repaired.diagnostic.semantic_transition, 'CORRECT');
  assert.match(repaired.response, /corre[cç][aã]o|lugar para comer|ida ao TATÁ/iu);
  assert.doesNotMatch(repaired.response, GENERIC);
});

test('categoria sushi restringe candidatos e não despeja fritura ou disponibilidade irrelevante', (t) => {
  const { send, customerMenu } = fixture(t);
  send('quero comer sushi');
  send('iFood');
  const repaired = send('Mas quem falou em fritura? Eu falei sushi.').publicResult.turn;
  const byId = new Map(customerMenu.menuCatalog.snapshot().items.map((item) => [item.item_id, item]));
  const candidates = repaired.diagnostic.candidates_found.map((id) => byId.get(id));
  assert.equal(repaired.diagnostic.turn_analysis.requested_category, 'sushi');
  assert.equal(repaired.diagnostic.user_repair_signal, true);
  assert.ok(candidates.length > 0);
  assert.equal(candidates.every((item) => itemMatchesRequestedCategory(item, 'sushi')), true);
  assert.doesNotMatch(repaired.response, /fritura|disponibilidade/iu);
});

test('feedback negativo repara a interação em vez de repetir recomendação rejeitada', (t) => {
  const { send } = fixture(t);
  send('quero comer sushi');
  send('iFood');
  const rejected = send('Mas quem falou em fritura? Eu falei sushi.').publicResult.turn;
  const feedback = send('já vi que você não sabe de nada').publicResult.turn;
  assert.equal(feedback.diagnostic.negative_feedback_signal, true);
  assert.equal(feedback.diagnostic.semantic_transition, 'CORRECT');
  assert.notEqual(feedback.response, rejected.response);
  assert.match(feedback.response, /sushi|corrigir|sa[ií] do que/iu);
});

test('intenção explícita de reserva vence recomendação anterior imediatamente', (t) => {
  const { send } = fixture(t);
  send('quero comer sushi');
  send('iFood');
  const turn = send('Pode me dizer como faço para reservar para 7 pessoas').publicResult.turn;
  assert.equal(turn.diagnostic.intent, 'reservation.create');
  assert.equal(turn.diagnostic.journey, 'reservation');
  assert.equal(turn.diagnostic.semantic_transition, 'SWITCH');
  assert.equal(turn.diagnostic.candidates_found.length, 0);
  assert.match(turn.response, /7 pessoas|reserva|reservation\.getin\.app/iu);
  assert.doesNotMatch(turn.response, /Sushi de|Hot Roll|card[aá]pio do iFood/iu);
});

test('variações explícitas de reserva superam estado gastronômico stale', (t) => {
  const variants = [
    'quero reservar',
    'como reserva?',
    'tem mesa pra 7?',
    'quero ir aí com 7 pessoas',
    'esquece o delivery, quero reservar',
    'esquece isso, quero reservar agora',
    'acho que vou pessoalmente',
    'vou no restaurante então'
  ];
  for (const message of variants) {
    const { send } = fixture(t);
    send('quero comer sushi');
    send('iFood');
    const turn = send(message).publicResult.turn;
    assert.equal(turn.diagnostic.journey, 'reservation', message);
    assert.equal(turn.diagnostic.candidates_found.length, 0, message);
    assert.doesNotMatch(turn.response, /Sushi de|Hot Roll|card[aá]pio do iFood/iu, message);
  }
});

test('transcript humano reprovado diverge positivamente e termina em reserva', (t) => {
  const { send } = fixture(t);
  const messages = [
    'Boa noite, tudo bem? Preciso muito de um lugar para comer hoje',
    'Preciso de um lugar para comer hoje',
    'Preciso de um lugar para comer hoje',
    'estou dizendo que quero comer amigo, voce nao esta entendendo?',
    'quero comer sushi',
    'Ifood',
    'Mas quem falou em fritura?, falei sushi',
    'ja vi que voce nao sabe de nada',
    'Pode me dizer como faco para reservar para 7 pessoas'
  ];
  const turns = messages.map((message) => send(message).publicResult.turn);
  assert.doesNotMatch(turns[0].response, GENERIC);
  assert.notEqual(turns[6].response, turns[5].response);
  assert.notEqual(turns[7].response, turns[6].response);
  assert.equal(turns[8].diagnostic.journey, 'reservation');
  assert.match(turns[8].response, /reserva|reservation\.getin\.app/iu);
});

test('semântica de categoria não trata prato japonês genérico como sushi', () => {
  assert.equal(itemMatchesRequestedCategory({ name: 'Salmão Grelhado', category: 'Pratos Quentes' }, 'sushi'), false);
  assert.equal(itemMatchesRequestedCategory({ name: 'Salmão', category: 'Sushis' }, 'sushi'), true);
  assert.equal(itemMatchesRequestedCategory({ name: 'Salmão', category: 'Sashimis' }, 'sushi'), false);
  assert.equal(itemMatchesRequestedCategory({ name: 'Temaki de Salmão', category: 'Temakis' }, 'temaki'), true);
  assert.equal(itemMatchesRequestedCategory({ name: 'Hot Roll Tatá', category: 'Sushis especiais' }, 'hot_roll'), true);
});

test('evaluator reprova reparo ignorado, resposta rejeitada repetida e switch stale', () => {
  const turns = [
    {
      index: 1,
      action: { type: 'category_sushi' },
      input: 'quero sushi',
      response: 'Encontrei A, B e C.',
      diagnostic: { turn_analysis: { requested_category: 'sushi' }, candidates_found: [] }
    },
    {
      index: 2,
      action: { type: 'user_repair' },
      input: 'não, eu falei sushi',
      response: 'Encontrei A, B e C.',
      diagnostic: { user_repair_signal: true, semantic_transition: 'CORRECT', turn_analysis: { requested_category: 'sushi' }, candidates_found: [] }
    },
    {
      index: 3,
      action: { type: 'reservation_switch' },
      input: 'quero reservar',
      response: 'Encontrei A, B e C.',
      diagnostic: { intent: 'reservation.create', journey: 'reservation', semantic_transition: 'SWITCH', candidates_found: ['STALE'] }
    },
    {
      index: 4,
      action: { type: 'open_dining' },
      input: 'preciso de um lugar para comer hoje',
      response: 'Ainda não tenho uma confirmação segura para concluir esse ponto.',
      diagnostic: { turn_analysis: { goal: null }, journey: null, candidates_found: [] }
    },
    {
      index: 5,
      action: { type: 'negative_feedback' },
      input: 'você não está ajudando',
      response: 'Ainda não tenho uma confirmação segura para concluir esse ponto.',
      diagnostic: { negative_feedback_signal: false, candidates_found: [] }
    }
  ];
  const result = evaluateConversation({ conversation_id: 'NEGATIVE-CONTROL', turns }, new Map());
  const classes = new Set(result.failures.map((item) => item.failure_class));
  assert.ok(classes.has('USER_REPAIR_IGNORED'));
  assert.ok(classes.has('REJECTED_RESPONSE_REPEATED'));
  assert.ok(classes.has('STALE_JOURNEY_RESPONSE'));
  assert.ok(classes.has('RESERVATION_SWITCH_FAILURE'));
});

test('catálogo dirigido contém 100 transitions, 100 categorias, 100 adversariais e 100 livres', () => {
  const catalog = buildSemanticTransitionCatalog({ seed: 'SEMANTIC-CATALOG-TEST', countPerGroup: 100, freeCount: 100 });
  assert.equal(catalog.transitions.length, 100);
  assert.equal(catalog.categories.length, 100);
  assert.equal(catalog.adversarial.length, 100);
  assert.equal(catalog.free.length, 100);
  assert.equal(catalog.all.length, 400);
  assert.equal(catalog.free.every((item) => !Object.hasOwn(item, 'actions') && item.free_customer.persona && item.free_customer.goal), true);
  assert.deepEqual(catalog, buildSemanticTransitionCatalog({ seed: 'SEMANTIC-CATALOG-TEST', countPerGroup: 100, freeCount: 100 }));
  assert.notDeepEqual(catalog, buildSemanticTransitionCatalog({ seed: 'SEMANTIC-CATALOG-OTHER', countPerGroup: 100, freeCount: 100 }));
});

test('cliente livre recebe apenas persona, objetivo, humor e restrições e reage à resposta', () => {
  const scenario = buildSemanticTransitionCatalog({ seed: 'SEMANTIC-FREE-TEST', countPerGroup: 1, freeCount: 1 }).free[0];
  assert.deepEqual(Object.keys(scenario.free_customer).sort(), ['constraints', 'goal', 'maximum_turns', 'mood', 'persona']);
  const first = new FreeSyntheticCustomer(scenario, 'FREE-SEED');
  const replay = new FreeSyntheticCustomer(scenario, 'FREE-SEED');
  const opening = first.nextTurn();
  assert.deepEqual(opening, replay.nextTurn());
  const reaction = first.nextTurn({ response: 'Você prefere salão, iFood ou delivery próprio?' });
  assert.match(reaction.message, /iFood|sal[aã]o|restaurante/iu);
});

test('mini campanha semântica percorre as quatro famílias sem falha crítica ou alta', async () => {
  const report = await runExperienceLab({
    seed: 'SEMANTIC-MINI-UNSEEN',
    profile: 'semantic-transition',
    countPerGroup: 2,
    freeCount: 2
  });
  assert.equal(report.metrics.conversations_run, 8);
  assert.equal(report.metrics.transition_conversations, 2);
  assert.equal(report.metrics.category_conversations, 2);
  assert.equal(report.metrics.adversarial_conversations, 2);
  assert.equal(report.metrics.free_conversations, 2);
  assert.equal(report.metrics.critical_failures, 0);
  assert.equal(report.metrics.high_failures, 0);
});
