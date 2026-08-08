'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { HomologationService } = require('../../tools/conversation-crm/homologation/service');
const { CustomerMenuHomologationService } = require('../../tools/conversation-crm/customer-menu/service');
const { validatePostComposition } = require('../../src/conversation-crm/native/post-composition-validator');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const INTERNAL_LANGUAGE = /(?:evid[eê]ncia p[uú]blica|filtros? confirmados?|crit[eé]rios? confirmados?|fonte p[uú]blica|\bcandidat[oa]s?\b|\bconfidence\b|\binfer[eê]ncia\b|\bprovenance\b|\bjourney\b|approved envelope|response plan|\bfallback\b|pattern engine|\bwriter\b|mantive (?:os )?crit[eé]rios)/iu;

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'deliveryos-human-experience-01-'));
  const customerMenu = new CustomerMenuHomologationService();
  const homologation = new HomologationService({
    projectRoot: PROJECT_ROOT,
    feedbackRoot: path.join(root, 'feedback'),
    chatRuntimeRoot: path.join(root, 'chat-runtime'),
    customerMenu
  });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return {
    homologation,
    send(message) { return homologation.chatExecution({ message }); }
  };
}

function publicTurn(execution) {
  return execution.publicResult.turn;
}

test('compound_customer_turn preserva todos os fatos e responde sem colapsar na última subintenção', (t) => {
  const { send } = fixture(t);
  const execution = send(`Boa noite, quero pedir alguma coisa com salmão
pelo iFood
queria algo mais leve
não curto muito cream cheese
somos duas pessoas
o que você me indica?
essa segunda opção é crua?
quanto custa?
e tem alguma bebida que combina?`);
  const turn = publicTurn(execution);

  assert.equal(turn.diagnostic.channel, 'ifood');
  assert.equal(turn.diagnostic.hospitality_context.number_of_people, 2);
  assert.deepEqual(turn.diagnostic.hospitality_context.preferred_ingredients, ['salmon']);
  assert.ok(turn.diagnostic.hospitality_context.flavor_preferences.includes('light'));
  assert.ok(turn.diagnostic.hospitality_context.preparation_preferences.includes('without_cream_cheese'));
  assert.equal(turn.diagnostic.turn_analysis.goal, 'recommendation');
  assert.deepEqual(turn.diagnostic.turn_analysis.questions, ['recommendation', 'raw_preparation', 'price', 'drink_pairing']);
  assert.equal(turn.diagnostic.turn_analysis.unresolved_reference.reason, 'no_prior_option_list');
  assert.ok(turn.diagnostic.candidates_found.length >= 2);
  assert.match(turn.response, /salm[aã]o/iu);
  assert.match(turn.response, /segunda op[cç][aã]o/iu);
  assert.match(turn.response, /cream cheese/iu);
  assert.match(turn.response, /bebida|harmoniza/iu);
  assert.doesNotMatch(turn.response, INTERNAL_LANGUAGE);
  assert.doesNotMatch(turn.response, /Ainda não há uma harmonização aprovada para a opção selecionada/iu);
  assert.ok(turn.response.length <= 700);
  assert.ok((turn.response.match(/\?/gu) || []).length <= 1);

  const envelope = execution.result.approved_response_envelope;
  assert.equal(envelope.customer_goal, 'recommendation');
  assert.ok(envelope.active_preferences.includes('light'));
  assert.ok(envelope.active_preferences.includes('without_cream_cheese'));
  assert.ok(envelope.candidate_options.length >= 2);
  assert.deepEqual(envelope.questions_answerable_now, ['recommendation', 'price', 'drink_pairing']);
  assert.equal(envelope.unresolved_reference.reason, 'no_prior_option_list');
});

test('compound_customer_turn reconhece paráfrase sem depender da frase literal', (t) => {
  const { send } = fixture(t);
  const turn = publicTurn(send('Quero um jantar pra duas pessoas pelo aplicativo do iFood, gosto de salmão, queria uma coisa menos pesada e não sou muito fã de cream cheese. O que você sugere e quanto fica?'));
  assert.equal(turn.diagnostic.channel, 'ifood');
  assert.equal(turn.diagnostic.hospitality_context.number_of_people, 2);
  assert.ok(turn.diagnostic.hospitality_context.flavor_preferences.includes('light'));
  assert.ok(turn.diagnostic.hospitality_context.preparation_preferences.includes('without_cream_cheese'));
  assert.ok(turn.diagnostic.candidates_found.length > 0);
  assert.match(turn.response, /salm[aã]o/iu);
  assert.doesNotMatch(turn.response, INTERNAL_LANGUAGE);
});

test('light_preference_replans e muda materialmente a orientação sem inventar leveza', (t) => {
  const { send } = fixture(t);
  const before = publicTurn(send('Boa noite, quero pedir alguma coisa com salmão pelo iFood'));
  const after = publicTurn(send('queria algo mais leve'));
  assert.notEqual(after.response, before.response);
  assert.ok(after.diagnostic.hospitality_context.flavor_preferences.includes('light'));
  assert.match(after.response, /n[aã]o (?:consigo|d[aá] para) afirmar|n[aã]o confirma/iu);
  assert.match(after.response, /cru|ma[cç]aricado|fritura|preparo/iu);
  assert.doesNotMatch(after.response, /(?:é|são) (?:a |as )?mais leve/iu);
  assert.doesNotMatch(after.response, INTERNAL_LANGUAGE);
});

test('cream_cheese_preference_replans / preference_delta_changes_response_when_material / preference_delta_preserves_previous_context', (t) => {
  const { send } = fixture(t);
  publicTurn(send('Boa noite, quero pedir alguma coisa com salmão pelo iFood'));
  const light = publicTurn(send('queria algo mais leve'));
  const cream = publicTurn(send('não curto muito cream cheese'));
  assert.notEqual(cream.response, light.response);
  assert.deepEqual(cream.diagnostic.preferences.preferred_ingredients, ['salmon']);
  assert.equal(cream.diagnostic.preferences.cream_cheese, 'without');
  assert.ok(cream.diagnostic.hospitality_context.flavor_preferences.includes('light'));
  assert.ok(cream.diagnostic.hospitality_context.preparation_preferences.includes('without_cream_cheese'));
  assert.match(cream.response, /cream cheese/iu);
  assert.doesNotMatch(cream.response, /(?:n[aã]o leva|sem cream cheese)/iu);
  assert.doesNotMatch(cream.response, INTERNAL_LANGUAGE);
});

for (const message of [
  'Oi, nunca pedi no Tatá e não entendo muito de japonês',
  'nunca pedi aí',
  'é minha primeira vez',
  'não conheço o Tatá',
  'não entendo nada de japonês',
  'nunca comi sushi',
  'quero experimentar mas não sei o que pedir',
  'não conheço esses nomes',
  'me ajuda a escolher porque eu não entendo muito'
]) {
  test(`first_visit inicia hospitalidade sem fallback: ${message}`, (t) => {
    const { send } = fixture(t);
    const turn = publicTurn(send(message));
    assert.equal(turn.diagnostic.hospitality_context.occasion, 'first_visit');
    assert.equal(turn.diagnostic.hospitality_context.experience_level, 'first_time');
    assert.equal(turn.diagnostic.turn_analysis.goal, 'menu_discovery');
    assert.match(turn.response, /ajud|escolh|come[cç]ar/iu);
    assert.match(turn.response, /familiar|cru|cozido/iu);
    assert.doesNotMatch(turn.response, /Ainda não tenho uma confirmação segura|dúvida é sobre o restaurante/iu);
    assert.doesNotMatch(turn.response, INTERNAL_LANGUAGE);
    assert.ok((turn.response.match(/\?/gu) || []).length <= 1);
  });
}

test('referência ordinal válida usa a lista anterior; referência sem lista não é inventada', (t) => {
  const valid = fixture(t);
  const list = publicTurn(valid.send('Quero salmão pelo iFood, o que você indica?'));
  assert.ok(list.diagnostic.candidates_found.length >= 2);
  const referenced = publicTurn(valid.send('essa segunda opção é crua e quanto custa?'));
  assert.equal(referenced.diagnostic.turn_analysis.resolved_reference.position, 2);
  assert.match(referenced.response, /segunda op[cç][aã]o/iu);
  assert.match(referenced.response, /R\$/u);

  const invalid = fixture(t);
  const missing = publicTurn(invalid.send('essa segunda opção é crua?'));
  assert.equal(missing.diagnostic.turn_analysis.unresolved_reference.reason, 'no_prior_option_list');
  assert.doesNotMatch(missing.response, /(?:é crua|não é crua)/iu);
});

test('negação material remove salmão e replana sem preservar preferência anterior', (t) => {
  const { send } = fixture(t);
  publicTurn(send('Quero salmão pelo iFood, o que você indica?'));
  const turn = publicTurn(send('na verdade não quero salmão'));
  assert.deepEqual(turn.diagnostic.preferences.preferred_ingredients, []);
  assert.ok(turn.diagnostic.hospitality_context.excluded_ingredients.includes('salmon'));
  assert.doesNotMatch(turn.response, /Salmão Grelhado/iu);
});

test('challenger H preserva primeira visita e alergia sem recomendar segurança inexistente', (t) => {
  const { send } = fixture(t);
  const turn = publicTurn(send('É minha primeira vez e tenho alergia a camarão. Pode me ajudar a escolher?'));
  assert.equal(turn.diagnostic.hospitality_context.occasion, 'first_visit');
  assert.ok(turn.diagnostic.hospitality_context.allergies.includes('crustacean'));
  assert.match(turn.response, /contaminação cruzada|confirmad[oa] com a equipe/iu);
  assert.doesNotMatch(turn.response, /segur[oa] para você|não contém/iu);
  assert.doesNotMatch(turn.response, INTERNAL_LANGUAGE);
});

test('challenger I inicia primeira visita no iFood sem pular para lista arbitrária', (t) => {
  const { send } = fixture(t);
  const turn = publicTurn(send('É minha primeira vez e quero pedir pelo iFood'));
  assert.equal(turn.diagnostic.channel, 'ifood');
  assert.equal(turn.diagnostic.hospitality_context.occasion, 'first_visit');
  assert.match(turn.response, /familiar|cru|cozido/iu);
  assert.doesNotMatch(turn.response, /Encontrei .* no cardápio/iu);
});

test('challenger J troca iFood por salão e recalcula somente no novo canal', (t) => {
  const { send } = fixture(t);
  publicTurn(send('Quero salmão pelo iFood, o que você indica?'));
  const turn = publicTurn(send('na verdade, quero ver para o salão'));
  assert.equal(turn.diagnostic.channel, 'dining_room');
  assert.match(turn.response, /cardápio do salão/iu);
  assert.doesNotMatch(turn.response, /cardápio do iFood/iu);
});

test('challenger G responde referência coletiva e preserva desconhecido factual', (t) => {
  const { send } = fixture(t);
  publicTurn(send('Quero salmão pelo iFood, o que você indica?'));
  const turn = publicTurn(send('qual deles é cru?'));
  assert.equal(turn.diagnostic.turn_analysis.resolved_group_reference.kind, 'presented_options');
  assert.match(turn.response, /cru/iu);
  assert.doesNotMatch(turn.response, /(?:todos|nenhum) (?:são|é) cru/iu);
  assert.doesNotMatch(turn.response, INTERNAL_LANGUAGE);
});

test('customer_facing_internal_language_leak reprova linguagem direta e indireta', () => {
  const plan = {
    gravity: 'informational', direct_answer: [], direction: [], mandatory_questions: [],
    authorized_surface: { links: [], numbers: [] }, known_facts: [], new_facts: [],
    verified_actions: [], prohibited_claims: [], length: 'medium', emoji_policy: 'none',
    strategy_id: 'recommendation', strategy_contract: { mandatory_components: [] }
  };
  for (const text of [
    'Há evidência pública compatível com os filtros confirmados.',
    'Mantive os critérios confirmados e reordenei os candidatos.',
    'O response plan preservou a provenance da fonte.'
  ]) {
    const result = validatePostComposition({ text, plan });
    assert.equal(result.passed, false);
    assert.ok(result.finding_codes.includes('CUSTOMER_FACING_INTERNAL_LANGUAGE_LEAK'));
  }
});
