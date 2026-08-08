'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createNativeServer } = require('../../tools/conversation-crm/native-server');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const GOLDEN = 'Boa noite, quero pedir algo com salmão';
const FORBIDDEN_GENERIC = /(?:Ainda não tenho uma confirmação segura|Vou manter essa preferência|Registrei sua escolha|Posso te ajudar a escolher a experiência)/iu;

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'deliveryos-official-golden-'));
  const server = createNativeServer({
    projectRoot: PROJECT_ROOT,
    runtimeRoot: path.join(root, 'runtime'),
    feedbackRoot: path.join(root, 'feedback'),
    menuReviewRoot: path.join(root, 'review'),
    enableLocalWriter: false
  });
  t.after(() => {
    if (server.listening) server.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  const send = (message) => server.homologation.chatExecution({ message }).publicResult.turn;
  return { server, send };
}

function menuItems(server, ids) {
  const items = server.customerMenu.bootstrap().menu.items;
  return ids.map((id) => items.find((item) => item.item_id === id));
}

test('426 registros oficiais preservam variantes, canais e desconhecidos protegidos', (t) => {
  const { server } = fixture(t);
  const bootstrap = server.customerMenu.bootstrap();
  const publicRecords = server.customerMenu.menuReview.listPublic();
  assert.equal(bootstrap.menu.catalog_mode, 'real_public_official_source_verified');
  assert.equal(bootstrap.menu.items.length, 426);
  assert.equal(new Set(publicRecords.map((item) => item.public_record_id)).size, 426);
  assert.equal(publicRecords.filter((item) => item.fields.variant?.value).length, 43);
  assert.equal(publicRecords.every((item) => item.certification.status === 'verified_official_public_source'), true);
  assert.equal(publicRecords.every((item) => item.protected_unknowns.includes('allergens')), true);
  assert.deepEqual(bootstrap.menu_review.summary.internal_linking, {
    total: 199, auto_linked_exact: 154, auto_linked_strong_variant: 16,
    human_review: 10, not_found: 19
  });
  assert.equal(bootstrap.menu_review.proposals.filter((item) => item.kind === 'item').length, 29);
});

test('golden failure responde, preserva salmão e pergunta somente o canal', (t) => {
  const { send } = fixture(t);
  const turn = send(GOLDEN);
  assert.equal(turn.response, 'Boa noite! Claro. Você está escolhendo para o salão, para pedir pelo iFood ou pelo delivery próprio?');
  assert.deepEqual(turn.diagnostic.preferences.preferred_ingredients, ['salmon']);
  assert.equal(turn.diagnostic.pending_question, 'menu_channel');
  assert.doesNotMatch(turn.response, FORBIDDEN_GENERIC);
  assert.equal((turn.response.match(/\?/gu) || []).length, 1);
});

test('seis mensagens idênticas não duplicam fatos nem avançam a jornada', (t) => {
  const { send } = fixture(t);
  const turns = Array.from({ length: 6 }, () => send(GOLDEN));
  for (const turn of turns) {
    assert.deepEqual(turn.diagnostic.preferences.preferred_ingredients, ['salmon']);
    assert.equal(turn.diagnostic.pending_question, 'menu_channel');
    assert.equal(turn.diagnostic.channel, 'unknown');
    assert.doesNotMatch(turn.response, FORBIDDEN_GENERIC);
  }
  assert.deepEqual(turns[0].diagnostic.facts_added, [{ field: 'preferred_ingredient', value: 'salmon' }]);
  assert.equal(turns.slice(1).every((turn) => turn.diagnostic.facts_added.length === 0), true);
});

test('saudação dentro da jornada retoma a pergunta sem apagar contexto', (t) => {
  const { send } = fixture(t);
  send(GOLDEN);
  const turn = send('oi');
  assert.match(turn.response, /^Olá!/u);
  assert.match(turn.response, /Seguimos escolhendo algo com salmão/u);
  assert.match(turn.response, /salão, iFood ou delivery próprio/u);
  assert.deepEqual(turn.diagnostic.preferences.preferred_ingredients, ['salmon']);
  assert.equal(turn.diagnostic.journey, 'restaurant_information');
  assert.doesNotMatch(turn.response, FORBIDDEN_GENERIC);
});

test('iFood consulta somente itens oficiais do iFood e não repete o canal', (t) => {
  const { server, send } = fixture(t);
  send(GOLDEN);
  const turn = send('iFood');
  const items = menuItems(server, turn.diagnostic.candidates_found);
  assert.equal(items.length, 3);
  assert.equal(items.every((item) => item && item.channel === 'ifood'), true);
  assert.equal(items.every((item) => item.source_records.includes('menu-source-ifood-v1')), true);
  assert.match(turn.response, /Salmão/iu);
  assert.doesNotMatch(turn.response, /salão, iFood ou delivery próprio/iu);
  assert.doesNotMatch(turn.response, FORBIDDEN_GENERIC);
});

test('leve, sem fritura, maçaricado e duas pessoas refinam sem inventar certeza', (t) => {
  const { server, send } = fixture(t);
  send(GOLDEN);
  send('iFood');
  const light = send('quero algo mais leve');
  assert.match(light.response, /fonte pública não classifica essas opções como leves/iu);
  const notFried = send('sem fritura');
  assert.equal(notFried.diagnostic.preferences.fried, false);
  assert.match(notFried.response, /não confirma o método de preparo como sem fritura/iu);
  const torched = send('pode ser maçaricado');
  assert.equal(menuItems(server, torched.diagnostic.candidates_found).every((item) => item.preparation.torched === true), true);
  const forTwo = send('somos dois');
  assert.equal(menuItems(server, forTwo.diagnostic.candidates_found).every((item) => item.quantity?.people === 2), true);
  assert.equal(forTwo.diagnostic.hospitality_context.number_of_people, 2);
});

test('alergia preventiva não vira incidente nem alegação de segurança', (t) => {
  const { send } = fixture(t);
  send(GOLDEN);
  send('iFood');
  const turn = send('tenho alergia a camarão');
  assert.match(turn.response, /restrição preventiva/iu);
  assert.match(turn.response, /contaminação cruzada/iu);
  assert.match(turn.response, /confirmados com a equipe/iu);
  assert.notEqual(turn.diagnostic.journey, 'food_safety');
  assert.doesNotMatch(turn.response, /segur[oa] para você|não contém/iu);
});

test('pergunta lateral, retomada, troca de canal, correção e reset preservam limites', (t) => {
  const { server, send } = fixture(t);
  send(GOLDEN);
  send('iFood');
  const side = send('vocês têm valet?');
  assert.match(side.response, /valet custa R\$ 45/iu);
  assert.doesNotMatch(side.response, /Salmão Grelhado/iu);
  const resumed = send('voltando ao cardápio');
  assert.match(resumed.response, /retomar de onde paramos/iu);
  assert.match(resumed.response, /cardápio oficial deste canal/iu);
  const corrected = send('na verdade atum');
  assert.deepEqual(corrected.diagnostic.preferences.preferred_ingredients, ['tuna']);
  assert.equal(menuItems(server, corrected.diagnostic.candidates_found).every((item) => item.ingredients.some((ingredient) => ingredient.name === 'tuna')), true);
  const dining = send('no salão mesmo');
  assert.equal(menuItems(server, dining.diagnostic.candidates_found).every((item) => item.channel === 'dining_room'), true);
  server.homologation.resetChat();
  const clean = send('oi');
  assert.deepEqual(clean.diagnostic.preferences.preferred_ingredients, []);
  assert.equal(clean.diagnostic.pending_question, null);
});

test('pergunta lateral natural sobre endereço não repete recomendações', (t) => {
  const { send } = fixture(t);
  send(GOLDEN);
  send('iFood');
  const side = send('Onde vocês ficam?');
  assert.match(side.response, /R\. João Cachoeira, 278/iu);
  assert.doesNotMatch(side.response, /Salmão Grelhado|opções com evidência pública/iu);
  assert.equal(side.diagnostic.intent, 'information.address');
  assert.equal(side.diagnostic.pattern, 'side_question');
  const resumed = send('voltando ao cardápio');
  assert.match(resumed.response, /retomar de onde paramos/iu);
  assert.match(resumed.response, /cardápio oficial deste canal/iu);
});
