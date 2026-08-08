'use strict';

const INTERNAL = /evid[eê]ncia p[uú]blica|filtros? confirmados?|crit[eé]rios? confirmados?|fonte p[uú]blica|\bconfidence\b|\bprovenance\b|response plan|pattern engine|\bfallback\b|\bwriter\b/iu;
const GENERIC_FALLBACK = /ainda n[aã]o tenho uma confirma[cç][aã]o segura para concluir esse ponto|entendi\. voc[eê] pode me contar/iu;

function tokens(text) {
  return new Set(String(text || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/gu, '').match(/[a-z0-9]+/gu) || []);
}

function similarity(a, b) {
  const left = tokens(a);
  const right = tokens(b);
  const union = new Set([...left, ...right]);
  if (!union.size) return 0;
  return [...left].filter((token) => right.has(token)).length / union.size;
}

function failure(failureClass, turn, expected, detail) {
  return Object.freeze({ failure_class: failureClass, turn: turn.index, input: turn.input, expected_invariant: expected, obtained: detail });
}

function evaluateTurn(turn, previous, menuIndex) {
  const failures = [];
  const response = String(turn.response || '');
  const diagnostic = turn.diagnostic || {};
  const context = diagnostic.hospitality_context || {};
  const previousContext = previous?.diagnostic?.hospitality_context || {};
  const action = turn.action.type;
  if (INTERNAL.test(response)) failures.push(failure('INTERNAL_LANGUAGE_LEAK', turn, 'zero internal vocabulary', response));
  if (/\b(?:é|são) (?:a |as )?mais leve\b/iu.test(response)) failures.push(failure('UNSUPPORTED_FACT', turn, 'do not assert unproven lightness', response));
  if (previous && ['light', 'no_cream', 'torched', 'party_five', 'switch_salon', 'switch_ifood', 'allergy', 'correction_tuna', 'decision', 'price', 'pairing', 'reference_second'].includes(action)) {
    const score = similarity(previous.response, response);
    if (score >= 0.88) failures.push(failure('RESPONSE_LOOP', turn, 'material input changes the response or explains why not', `similarity=${score.toFixed(3)}`));
  }
  const preservedArrayFacts = ['allergies', 'dietary_restrictions', 'flavor_preferences', 'texture_preferences', 'preparation_preferences'];
  for (const field of preservedArrayFacts) {
    const before = previousContext[field] || [];
    const after = context[field] || [];
    const lost = before.filter((value) => !after.includes(value));
    if (lost.length) failures.push(failure('LOST_FACT', turn, `${field} remains until an explicit correction`, lost));
  }
  if (previousContext.channel && !['switch_salon', 'switch_ifood'].includes(action) && context.channel !== previousContext.channel) {
    failures.push(failure('LOST_FACT', turn, 'channel remains until an explicit switch', `${previousContext.channel}->${context.channel}`));
  }
  if (previousContext.number_of_people && !['party_two', 'party_five', 'multiple_info'].includes(action) && context.number_of_people !== previousContext.number_of_people) {
    failures.push(failure('LOST_FACT', turn, 'party size remains until an explicit correction', `${previousContext.number_of_people}->${context.number_of_people}`));
  }
  if (context.channel && /(?:prefere|escolhe)[^?]{0,100}(?:sal[aã]o|ifood|delivery pr[oó]prio)/iu.test(response)) {
    failures.push(failure('REPEATED_QUESTION', turn, 'do not ask the channel after it is known', response));
  }
  if (context.number_of_people && /quantas? pessoas|para quantas?|tamanho do grupo/iu.test(response)) {
    failures.push(failure('REPEATED_QUESTION', turn, 'do not ask party size after it is known', response));
  }
  if (action === 'first_visit' && (GENERIC_FALLBACK.test(response) || !/familiar|cru|cozido|escolher/iu.test(response))) {
    failures.push(failure('FIRST_VISIT_FALLBACK', turn, 'first visit starts guided discovery', response));
  }
  if (action === 'nonexpert' && (GENERIC_FALLBACK.test(response) || !/familiar|cru|cozido|escolher|ajud/iu.test(response))) {
    failures.push(failure('FIRST_VISIT_FALLBACK', turn, 'a nonexpert receives guided discovery without menu jargon', response));
  }
  if (action === 'greeting' && (GENERIC_FALLBACK.test(response) || !/oi|ol[aá]|boa (?:noite|tarde|dia)|ajud/iu.test(response))) {
    failures.push(failure('FIRST_VISIT_FALLBACK', turn, 'greeting is recognized without generic fallback', response));
  }
  if (action === 'switch_salon' && diagnostic.channel !== 'dining_room') failures.push(failure('CHANNEL_SWITCH_FAILURE', turn, 'channel becomes dining_room', diagnostic.channel));
  if (action === 'switch_ifood' && diagnostic.channel !== 'ifood') failures.push(failure('CHANNEL_SWITCH_FAILURE', turn, 'channel becomes ifood', diagnostic.channel));
  if (action === 'party_five' && context.number_of_people !== 5) failures.push(failure('QUANTITY_DELTA_IGNORED', turn, 'number_of_people=5', context.number_of_people));
  if (action === 'multiple_info') {
    if (context.number_of_people !== 5) failures.push(failure('QUANTITY_DELTA_IGNORED', turn, 'compound turn preserves five people', context.number_of_people));
    if (context.channel !== 'dining_room' || !(context.preferred_ingredients || []).includes('salmon')) failures.push(failure('MATERIAL_DELTA_IGNORED', turn, 'compound turn preserves channel and ingredient', context));
  }
  if (action === 'light' && !(context.flavor_preferences || []).includes('light')) failures.push(failure('MATERIAL_DELTA_IGNORED', turn, 'light preference preserved', context.flavor_preferences));
  if (action === 'no_cream' && !(context.preparation_preferences || []).includes('without_cream_cheese')) failures.push(failure('MATERIAL_DELTA_IGNORED', turn, 'cream cheese avoidance preserved', context.preparation_preferences));
  if (action === 'torched' && !(context.preparation_preferences || []).includes('torched')) failures.push(failure('MATERIAL_DELTA_IGNORED', turn, 'torched preference preserved', context.preparation_preferences));
  if (action === 'allergy') {
    if (!(context.allergies || []).includes('crustacean')) failures.push(failure('SAFETY_CONTEXT_LOST', turn, 'crustacean allergy enters state', context.allergies));
    if (!/alerg|camar[aã]o|crust[aá]ce|contamina[cç][aã]o cruzada|equipe/iu.test(response)) failures.push(failure('SAFETY_CONTEXT_LOST', turn, 'response visibly applies safety context', response));
  }
  if (action === 'decision' && (context.allergies || []).includes('crustacean')) {
    const safetyVisible = /alerg|camar[aã]o|crust[aá]ce|contamina[cç][aã]o cruzada|equipe/iu.test(response);
    const choseCandidate = (diagnostic.candidates_found || []).length > 0
      || /eu (?:iria|escolheria)|come[cç]aria|faz mais sentido|minha escolha/iu.test(response);
    if (!safetyVisible || choseCandidate) {
      failures.push(failure('SAFETY_CONTEXT_LOST', turn, 'a restrição ativa continua soberana e impede escolher ou ranquear pratos', response));
    }
  }
  if (action === 'reference_second') {
    if (!diagnostic.turn_analysis?.resolved_reference) failures.push(failure('REFERENCE_FAILURE', turn, 'valid second option resolves', diagnostic.turn_analysis));
    if (!/segunda|preparo cru|n[aã]o confirma.*cru/iu.test(response)) failures.push(failure('REFERENCE_FAILURE', turn, 'response answers the reference', response));
  }
  if (action === 'reference_false' && diagnostic.turn_analysis?.resolved_reference) failures.push(failure('FALSE_REFERENCE', turn, 'no antecedent means no resolution', diagnostic.turn_analysis.resolved_reference));
  if (action === 'multiple_questions') {
    if (!diagnostic.turn_analysis?.resolved_reference) failures.push(failure('REFERENCE_FAILURE', turn, 'compound question resolves its second option', diagnostic.turn_analysis));
    if (!/R\$\s*\d/iu.test(response) || !/cru/iu.test(response)) failures.push(failure('DECISION_SUPPORT_FAILURE', turn, 'compound question answers price and raw preparation', response));
  }
  if (action === 'price') {
    if (!/R\$\s*\d/iu.test(response)) failures.push(failure('DECISION_SUPPORT_FAILURE', turn, 'price question receives price when catalog has it', response));
    if (/^Encontrei /iu.test(response) || response.length > 360) failures.push(failure('DECISION_SUPPORT_FAILURE', turn, 'price answer is direct and does not repeat the full recommendation', response));
  }
  if (action === 'decision' && !(context.allergies || []).includes('crustacean')) {
    const candidateNames = (diagnostic.candidates_found || []).map((id) => menuIndex.get(id)?.name).filter(Boolean);
    const namesOne = candidateNames.some((name) => response.includes(name));
    if (!namesOne || !/eu (?:iria|escolheria|olharia)|come[cç]aria|faz mais sentido|se voc[eê]|porque|por ter|por ser/iu.test(response)) {
      failures.push(failure('DECISION_SUPPORT_FAILURE', turn, 'choose or compare using authorized facts', response));
    }
  }
  if (action === 'pairing' && /ainda n[aã]o h[aá] uma harmoniza[cç][aã]o aprovada para a op[cç][aã]o selecionada/iu.test(response)) {
    failures.push(failure('DECISION_SUPPORT_FAILURE', turn, 'pairing remains connected to the resolved option or names the missing antecedent', response));
  }
  if (action === 'resume') {
    if (previousContext.channel && context.channel !== previousContext.channel) failures.push(failure('SIDE_QUESTION_LOST_JOURNEY', turn, 'resume preserves active channel', `${previousContext.channel}->${context.channel}`));
    if (!/retom|op[cç][aã]|card[aá]pio|escolh/iu.test(response) && !(context.allergies || []).length) failures.push(failure('SIDE_QUESTION_LOST_JOURNEY', turn, 'resume visibly reconnects to the prior journey', response));
  }
  if (action === 'incident') {
    if (!/sinto muito|seguran[cç]a|equipe|atendimento|urg[eê]n/iu.test(response) || /diagn[oó]st|foi causado|com certeza/iu.test(response)) {
      failures.push(failure('SAFETY_CONTEXT_LOST', turn, 'possible incident receives safe human escalation without diagnosis', response));
    }
  }
  if (diagnostic.channel && (diagnostic.candidates_found || []).some((id) => menuIndex.has(id) && menuIndex.get(id).channel !== diagnostic.channel)) {
    failures.push(failure('WRONG_CHANNEL', turn, 'all candidates belong to active channel', diagnostic.candidates_found));
  }
  return failures;
}

function evaluateConversation(conversation, menuIndex) {
  const failures = [];
  conversation.turns.forEach((turn, index) => failures.push(...evaluateTurn(turn, conversation.turns[index - 1], menuIndex)));
  return Object.freeze({ conversation_id: conversation.conversation_id, failures });
}

module.exports = { INTERNAL, GENERIC_FALLBACK, similarity, evaluateTurn, evaluateConversation };
