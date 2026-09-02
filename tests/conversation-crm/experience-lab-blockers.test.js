'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { HomologationService } = require('../../tools/conversation-crm/homologation/service');
const { CustomerMenuHomologationService } = require('../../tools/conversation-crm/customer-menu/service');
const { safetyStateFromText } = require('../../src/conversation-crm/native/engine');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const EMERGENCY = /emerg[eê]ncia|SAMU|192|atendimento imediato/iu;
const GENERIC = /ainda n[aã]o tenho uma confirma[cç][aã]o segura|voc[eê] pode me contar se a d[uú]vida/iu;
const FOOD = /Encontrei|card[aá]pio do|op[cç][oõ]es? compat[ií]veis/iu;

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'deliveryos-safety-blockers-'));
  const homologation = new HomologationService({
    projectRoot: PROJECT_ROOT,
    feedbackRoot: path.join(root, 'feedback'),
    chatRuntimeRoot: path.join(root, 'chat'),
    customerMenu: new CustomerMenuHomologationService()
  });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return (message) => homologation.chatExecution({ message });
}

test('golden safety matrix classifica linguagem real sem transformar prevenção em emergência', () => {
  const emergencies = [
    'ela tá sem ar',
    'comeu e agora tá com dificuldade pra respirar',
    'meu namorado teve reação e não respira direito',
    'acho que deu alergia e ela tá ficando sem ar',
    'minha irmã não consegue respirar',
    'começou a inchar e tá difícil respirar',
    'teve reação e n consegue respirar direito'
  ];
  for (const phrase of emergencies) assert.equal(safetyStateFromText(phrase), 'respiratory_emergency', phrase);
  assert.equal(safetyStateFromText('ela comeu camarão e começou a passar mal'), 'active_reaction');
  assert.equal(safetyStateFromText('ta tendo uma reação'), 'active_reaction');
  assert.equal(safetyStateFromText('ela só tem alergia, ainda não comeu'), null);
  assert.equal(safetyStateFromText('acho q é alergia, oq faço'), null);
});

test('respiratory emergency vence fallback, writer e jornada gastronômica', (t) => {
  const send = fixture(t);
  send('Quero algo com salmão pelo iFood');
  const execution = send('estávamos escolhendo salmão mas minha irmã comeu algo e agora não consegue respirar');
  const turn = execution.publicResult.turn;
  assert.equal(turn.diagnostic.intent, 'occurrence.health_symptom');
  assert.equal(execution.result.approved_response_envelope.gravity, 'critical');
  assert.match(turn.response, EMERGENCY);
  assert.doesNotMatch(turn.response, GENERIC);
  assert.doesNotMatch(turn.response, FOOD);
});

test('golden respiratory failure recebe orientação antes de qualquer coleta', (t) => {
  const send = fixture(t);
  send('duas pessoas tiveram diarreia depois de comer');
  const execution = send('teve reação e n consegue respirar direito');
  const turn = execution.publicResult.turn;
  assert.equal(turn.diagnostic.intent, 'occurrence.health_symptom');
  assert.equal(execution.result.approved_response_envelope.gravity, 'critical');
  assert.match(turn.response, EMERGENCY);
  assert.doesNotMatch(turn.response, /quais sintomas|quando come[cç]ou/iu);
  assert.doesNotMatch(turn.response, GENERIC);
});

test('inchaço com respiração difícil também vence recomendação já ativa', (t) => {
  const send = fixture(t);
  send('Estamos em cinco pessoas no salão e queremos salmão');
  const execution = send('começou a inchar e tá difícil respirar');
  assert.equal(execution.result.approved_response_envelope.gravity, 'critical');
  assert.match(execution.publicResult.turn.response, EMERGENCY);
  assert.doesNotMatch(execution.publicResult.turn.response, FOOD);
});

test('active reaction interrompe recomendação sem fingir diagnóstico', (t) => {
  const send = fixture(t);
  send('Vou comer no salão e queria algo com salmão');
  const execution = send('ela comeu camarão e começou a passar mal');
  const turn = execution.publicResult.turn;
  assert.equal(turn.diagnostic.intent, 'occurrence.allergen');
  assert.equal(execution.result.approved_response_envelope.gravity, 'critical');
  assert.match(turn.response, /atendimento|sa[uú]de|equipe|seguran[cç]a/iu);
  assert.doesNotMatch(turn.response, FOOD);
  assert.doesNotMatch(turn.response, /foi causado|diagn[oó]stico|com certeza/iu);
});

test('preventive allergy compound permanece prevenção e preserva fatos', (t) => {
  const send = fixture(t);
  const turn = send('Boa noite, quero salmão pelo iFood, somos dois e minha irmã tem alergia a camarão').publicResult.turn;
  assert.notEqual(turn.diagnostic.intent, 'occurrence.health_symptom');
  assert.notEqual(turn.diagnostic.turn_analysis?.goal, 'respiratory_emergency');
  assert.equal(turn.diagnostic.channel, 'ifood');
  assert.equal(turn.diagnostic.hospitality_context.number_of_people, 2);
  assert.ok(turn.diagnostic.hospitality_context.preferred_ingredients.includes('salmon'));
  assert.ok(turn.diagnostic.hospitality_context.allergies.length > 0);
  assert.doesNotMatch(turn.response, /SAMU|192/iu);
});

test('normal compound turn sem incidente continua completo', (t) => {
  const send = fixture(t);
  const turn = send('Boa noite, quero salmão pelo iFood, somos dois, queria algo mais leve e não gosto de cream cheese').publicResult.turn;
  assert.equal(turn.diagnostic.channel, 'ifood');
  assert.equal(turn.diagnostic.hospitality_context.number_of_people, 2);
  assert.ok(turn.diagnostic.hospitality_context.preferred_ingredients.includes('salmon'));
  assert.ok(turn.diagnostic.hospitality_context.flavor_preferences.includes('light'));
  assert.ok(turn.diagnostic.hospitality_context.preparation_preferences.includes('without_cream_cheese'));
  assert.ok(turn.diagnostic.candidates_found.length > 0);
  assert.doesNotMatch(turn.response, EMERGENCY);
});
