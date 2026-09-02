'use strict';

const { itemMatchesRequestedCategory } = require('../../../src/conversation-crm/menu-intelligence/recommendation');

const INTERNAL = /evid[eê]ncia p[uú]blica|filtros? confirmados?|crit[eé]rios? confirmados?|fonte p[uú]blica|\bconfidence\b|\bprovenance\b|response plan|pattern engine|\bfallback\b|\bwriter\b/iu;
const GENERIC_FALLBACK = /ainda n[aã]o tenho uma confirma[cç][aã]o segura para concluir esse ponto|entendi\. voc[eê] pode me contar/iu;
const SAFETY_LANGUAGE = /alerg|intoler|camar[aã]o|crust[aá]ce|lactose|gl[uú]ten|contamina[cç][aã]o cruzada|equipe|restri[cç][aã]o/iu;
const CATEGORY_SIGNALS = Object.freeze([
  ['hot_roll', /\bhot roll\b/iu], ['sashimi', /\bsashimis?\b/iu], ['temaki', /\btemakis?\b/iu],
  ['combinado', /\bcombinados?\b/iu], ['entrada', /\bentradas?\b/iu], ['sobremesa', /\bsobremesas?\b/iu],
  ['drink', /\b(?:drinks?|coquet[eé]is?)\b/iu], ['sushi', /\bsushis?\b/iu]
]);
const MATERIAL_ACTIONS = new Set(['light', 'no_cream', 'torched', 'not_fried', 'raw', 'cooked', 'traditional', 'different', 'budget_low', 'premium', 'share', 'party_one', 'party_two', 'party_three', 'party_five', 'party_large', 'switch_salon', 'switch_ifood', 'switch_salon_question', 'allergy', 'allergy_interrupt', 'intolerance', 'correction_tuna', 'decision', 'decision_short', 'price', 'pairing', 'reference_first', 'reference_second', 'multiple_info', 'multiple_questions', 'open_dining', 'user_repair', 'negative_feedback', 'category_sushi', 'category_correction', 'reservation_switch', 'journey_abandonment']);
const SEVERITY = Object.freeze({
  ALLERGY_CONTEXT_LOST: 'critical', ALLERGY_INCOMPATIBLE_CANDIDATE: 'critical', UNSAFE_ALLERGY_CLAIM: 'critical',
  WRONG_CHANNEL: 'high', CHANNEL_SWITCH_FAILURE: 'high', UNSUPPORTED_FACT: 'high', INTERNAL_LANGUAGE_LEAK: 'high',
  LOST_CONTEXT: 'high', RESPONSE_LOOP: 'high', VALID_REFERENCE_FAILURE: 'high', FALSE_REFERENCE_RESOLUTION: 'high',
  PRICE_FAILURE: 'high', QUANTITY_IGNORED: 'high', DECISION_SUPPORT_FAILURE: 'high', COMPOUND_TURN_COLLAPSE: 'high',
  MATERIAL_DELTA_IGNORED: 'high', FIRST_VISIT_FAILURE: 'high', SIDE_QUESTION_DESTROYS_JOURNEY: 'high',
  USER_REPAIR_IGNORED: 'critical', REJECTED_RESPONSE_REPEATED: 'critical', STALE_JOURNEY_RESPONSE: 'high',
  EXPLICIT_INTENT_SWITCH_IGNORED: 'high', CATEGORY_MISMATCH: 'high', RESERVATION_SWITCH_FAILURE: 'high',
  REPEATED_QUESTION: 'medium', DUPLICATED_CONTEXT: 'medium'
});

function normalizedTokens(text) {
  return String(text || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/gu, '').match(/[a-z0-9]+/gu) || [];
}

function tokens(text) { return new Set(normalizedTokens(text)); }

function similarity(a, b) {
  const left = tokens(a);
  const right = tokens(b);
  const union = new Set([...left, ...right]);
  if (!union.size) return 0;
  return [...left].filter((token) => right.has(token)).length / union.size;
}

function failure(failureClass, turn, expected, detail) {
  return Object.freeze({
    failure_class: failureClass,
    severity: SEVERITY[failureClass] || 'medium',
    turn: turn.index,
    input: turn.input,
    expected_invariant: expected,
    obtained: detail
  });
}

function contextDelta(before = {}, after = {}) {
  const fields = ['channel', 'number_of_people', 'occasion', 'desired_experience'];
  const arrays = ['preferred_ingredients', 'excluded_ingredients', 'flavor_preferences', 'preparation_preferences', 'dietary_restrictions', 'allergies'];
  const delta = {};
  for (const field of fields) if (JSON.stringify(before[field] ?? null) !== JSON.stringify(after[field] ?? null)) delta[field] = { before: before[field] ?? null, after: after[field] ?? null };
  for (const field of arrays) if (JSON.stringify(before[field] || []) !== JSON.stringify(after[field] || [])) delta[field] = { before: before[field] || [], after: after[field] || [] };
  return delta;
}

function planSignature(diagnostic = {}) {
  return {
    response_path: diagnostic.response_path || null,
    context_reason: diagnostic.context_reason || null,
    candidates: diagnostic.candidates_found || [],
    goal: diagnostic.turn_analysis?.goal || null,
    questions: diagnostic.turn_analysis?.questions || []
  };
}

function hasConfirmedAllergen(item, allergies) {
  const assertions = item?.allergens || [];
  return allergies.some((allergy) => assertions.some((entry) => entry.allergen === allergy && entry.assertion === 'contains'));
}

function priceNumbers(response) {
  return [...String(response || '').matchAll(/R\$\s*(\d+(?:[.,]\d{2})?)/giu)].map((match) => Number(match[1].replace(',', '.')));
}

function categoryFromInput(value) {
  return CATEGORY_SIGNALS.find(([, pattern]) => pattern.test(String(value || '')))?.[0] || null;
}

function evaluateTurn(turn, previous, menuIndex, recent = []) {
  const failures = [];
  const response = String(turn.response || '');
  const diagnostic = turn.diagnostic || {};
  const context = diagnostic.hospitality_context || {};
  const previousContext = previous?.diagnostic?.hospitality_context || {};
  const action = turn.action.type;
  const expected = turn.action.expect || {};

  if (INTERNAL.test(response)) failures.push(failure('INTERNAL_LANGUAGE_LEAK', turn, 'zero internal vocabulary', response));
  if (/\b(?:é|são) (?:a |as )?mais leve\b/iu.test(response)) failures.push(failure('UNSUPPORTED_FACT', turn, 'do not assert unproven lightness', response));
  if ((context.allergies || []).length && /\b(?:item|op[cç][aã]o|prato|preparo) (?:é|esta|est[aá]) (?:segur[oa]|sem risco)|\b(?:livre de|garantid[oa] sem) (?:alerg|contamina)/iu.test(response)) failures.push(failure('UNSAFE_ALLERGY_CLAIM', turn, 'never guarantee allergy safety without evidence', response));

  const repairTurn = action === 'user_repair' || action === 'category_correction' || diagnostic.user_repair_signal === true;
  const negativeFeedbackTurn = action === 'negative_feedback' || diagnostic.negative_feedback_signal === true;
  if (repairTurn && (diagnostic.user_repair_signal !== true || GENERIC_FALLBACK.test(response))) {
    failures.push(failure('USER_REPAIR_IGNORED', turn, 'explicit user repair replaces the rejected hypothesis', { diagnostic, response }));
  }
  if ((repairTurn || negativeFeedbackTurn) && previous && similarity(previous.response, response) >= 0.88) {
    failures.push(failure('REJECTED_RESPONSE_REPEATED', turn, 'a rejected response is never repeated semantically', {
      compared_turn: previous.index,
      similarity: Number(similarity(previous.response, response).toFixed(3))
    }));
    if (repairTurn) failures.push(failure('USER_REPAIR_IGNORED', turn, 'repair must change the active interpretation and response', response));
  }
  if (action === 'negative_feedback' && (diagnostic.negative_feedback_signal !== true || GENERIC_FALLBACK.test(response))) {
    failures.push(failure('USER_REPAIR_IGNORED', turn, 'negative interaction feedback triggers a specific repair of the active goal', { diagnostic, response }));
  }

  if (action === 'open_dining' && (
    diagnostic.turn_analysis?.goal !== 'dine_out'
    || diagnostic.journey !== 'restaurant_information'
    || GENERIC_FALLBACK.test(response)
  )) {
    failures.push(failure('EXPLICIT_INTENT_SWITCH_IGNORED', turn, 'open dining language is understood as a visit to TATÁ', { diagnostic, response }));
  }

  const reservationSwitch = ['reservation_switch', 'journey_abandonment'].includes(action) || /\breserv(?:ar|a)\b/iu.test(turn.input || '');
  if (reservationSwitch) {
    const staleCandidates = (diagnostic.candidates_found || []).length > 0;
    const staleResponse = /\b(?:encontrei|card[aá]pio|sushi|sashimi|hot roll)\b/iu.test(response);
    if (diagnostic.intent !== 'reservation.create' || diagnostic.journey !== 'reservation' || !['SWITCH', 'CONTINUE', 'REFINE'].includes(diagnostic.semantic_transition)) {
      failures.push(failure('EXPLICIT_INTENT_SWITCH_IGNORED', turn, 'explicit reservation intent becomes active immediately', diagnostic));
    }
    if (staleCandidates || staleResponse) failures.push(failure('STALE_JOURNEY_RESPONSE', turn, 'stale recommendation cannot answer a reservation turn', { candidates: diagnostic.candidates_found, response }));
    if (staleCandidates || staleResponse || !/reserv|mesa|reservation\.getin\.app/iu.test(response)) failures.push(failure('RESERVATION_SWITCH_FAILURE', turn, 'reservation switch produces reservation guidance', response));
  }

  const requestedCategory = categoryFromInput(turn.input) || expected.category || diagnostic.turn_analysis?.requested_category || null;
  if (requestedCategory && (diagnostic.candidates_found || []).length) {
    const mismatched = diagnostic.candidates_found
      .map((id) => menuIndex.get(id))
      .filter((item) => item && !itemMatchesRequestedCategory(item, requestedCategory));
    if (mismatched.length) failures.push(failure('CATEGORY_MISMATCH', turn, `all candidates remain inside ${requestedCategory}`, mismatched.map((item) => ({ name: item.name, category: item.category }))));
  }

  const redundantChannelSelection = Boolean(expected.channel)
    && previousContext.channel === expected.channel
    && context.channel === expected.channel;
  const redundantReservationSelection = ['reservation_switch', 'journey_abandonment'].includes(action)
    && previous?.diagnostic?.intent === 'reservation.create'
    && diagnostic.intent === 'reservation.create';
  if (previous && (MATERIAL_ACTIONS.has(action) || Object.keys(expected).length) && !redundantChannelSelection && !redundantReservationSelection) {
    const comparisonTurns = recent.length ? recent.slice(-3) : [previous];
    for (const prior of comparisonTurns) {
      if (prior.action?.type === action) continue;
      const score = similarity(prior.response, response);
      if (score >= 0.88) {
        const stateChanges = contextDelta(prior.diagnostic?.hospitality_context, context);
        const beforePlan = planSignature(prior.diagnostic);
        const afterPlan = planSignature(diagnostic);
        const candidatesChanged = JSON.stringify(beforePlan.candidates) !== JSON.stringify(afterPlan.candidates);
        const channelChanged = Boolean(stateChanges.channel);
        if ((candidatesChanged || channelChanged) && /card[aá]pio (?:do|deste canal)|sal[aã]o|iFood|delivery/iu.test(response)) continue;
        failures.push(failure('RESPONSE_LOOP', turn, 'material input changes the response or explains why not', {
          compared_turn: prior.index,
          similarity: Number(score.toFixed(3)),
          input_delta: `${prior.input} -> ${turn.input}`,
          state_delta: stateChanges,
          plan_delta: { before: beforePlan, after: afterPlan }
        }));
        break;
      }
    }
  }

  const preservedArrayFacts = ['allergies', 'dietary_restrictions', 'flavor_preferences', 'texture_preferences'];
  for (const field of preservedArrayFacts) {
    const lost = (previousContext[field] || []).filter((value) => !(context[field] || []).includes(value));
    if (lost.length) failures.push(failure(field === 'allergies' ? 'ALLERGY_CONTEXT_LOST' : 'LOST_CONTEXT', turn, `${field} remains until explicit correction`, lost));
  }
  if (previousContext.channel && !['channel_salon', 'channel_ifood', 'switch_salon', 'switch_ifood', 'switch_salon_question'].includes(action) && context.channel !== previousContext.channel) failures.push(failure('LOST_CONTEXT', turn, 'channel remains until explicit switch', `${previousContext.channel}->${context.channel}`));
  if (previousContext.number_of_people && !['party_one', 'party_two', 'party_three', 'party_five', 'party_large', 'correction_quantity', 'multiple_info'].includes(action) && context.number_of_people !== previousContext.number_of_people) failures.push(failure('LOST_CONTEXT', turn, 'party size remains until explicit correction', `${previousContext.number_of_people}->${context.number_of_people}`));

  const facts = context.confirmed_facts || [];
  const factKeys = facts.map((item) => `${item.field}:${JSON.stringify(item.value)}`);
  if (new Set(factKeys).size !== factKeys.length) failures.push(failure('DUPLICATED_CONTEXT', turn, 'repetition never duplicates confirmed facts', factKeys));
  if (context.channel && /(?:prefere|escolhe)[^?]{0,100}(?:sal[aã]o|ifood|delivery pr[oó]prio)/iu.test(response)) failures.push(failure('REPEATED_QUESTION', turn, 'do not ask channel after it is known', response));
  if (context.number_of_people && /quantas? pessoas|para quantas?|tamanho do grupo/iu.test(response)) failures.push(failure('REPEATED_QUESTION', turn, 'do not ask party size after it is known', response));

  if (expected.channel && (context.channel || diagnostic.channel) !== expected.channel) failures.push(failure('CHANNEL_SWITCH_FAILURE', turn, `channel becomes ${expected.channel}`, context.channel || diagnostic.channel));
  if (expected.people && context.number_of_people !== expected.people) failures.push(failure('QUANTITY_IGNORED', turn, `number_of_people=${expected.people}`, context.number_of_people));
  if (expected.ingredient && !(context.preferred_ingredients || []).includes(expected.ingredient)) failures.push(failure('COMPOUND_TURN_COLLAPSE', turn, `compound turn preserves ingredient ${expected.ingredient}`, context.preferred_ingredients));
  if (expected.allergy && !(context.allergies || []).includes(expected.allergy)) failures.push(failure('ALLERGY_CONTEXT_LOST', turn, `allergy ${expected.allergy} enters state`, context.allergies));
  if (expected.allergy_any && !(context.allergies || []).length) failures.push(failure('ALLERGY_CONTEXT_LOST', turn, 'intolerance enters preventive safety state', context.allergies));
  if (action === 'multiple_info' && (context.channel !== 'dining_room' || context.number_of_people !== 5 || !(context.preferred_ingredients || []).includes('salmon'))) failures.push(failure('COMPOUND_TURN_COLLAPSE', turn, 'all explicit compound facts survive', context));

  const preferenceExpectations = {
    light: ['flavor_preferences', 'light'], no_cream: ['preparation_preferences', 'without_cream_cheese'], torched: ['preparation_preferences', 'torched'],
    not_fried: ['preparation_preferences', 'not_fried'], raw: ['preparation_preferences', 'raw'], cooked: ['preparation_preferences', 'cooked']
  };
  if (preferenceExpectations[action]) {
    const [field, value] = preferenceExpectations[action];
    if (!(context[field] || []).includes(value)) failures.push(failure('MATERIAL_DELTA_IGNORED', turn, `${value} preference enters state`, context[field]));
  }

  if (['first_visit', 'nonexpert'].includes(action) && (GENERIC_FALLBACK.test(response) || !/familiar|cru|cozido|escolher|ajud/iu.test(response))) failures.push(failure('FIRST_VISIT_FAILURE', turn, 'guided discovery without assumed menu knowledge', response));
  if (action === 'greeting' && (GENERIC_FALLBACK.test(response) || !/oi|ol[aá]|boa (?:noite|tarde|dia)|ajud/iu.test(response))) failures.push(failure('FIRST_VISIT_FAILURE', turn, 'greeting is recognized without generic fallback', response));

  if (['allergy', 'allergy_interrupt', 'intolerance'].includes(action)) {
    if (!(context.allergies || []).length) failures.push(failure('ALLERGY_CONTEXT_LOST', turn, 'preventive restriction enters state immediately', context.allergies));
    if (!SAFETY_LANGUAGE.test(response)) failures.push(failure('ALLERGY_CONTEXT_LOST', turn, 'response visibly applies preventive safety context', response));
  }
  if ((context.allergies || []).length) {
    const incompatible = (diagnostic.candidates_found || []).map((id) => menuIndex.get(id)).filter((item) => hasConfirmedAllergen(item, context.allergies));
    if (incompatible.length) failures.push(failure('ALLERGY_INCOMPATIBLE_CANDIDATE', turn, 'confirmed incompatible candidates are blocked', incompatible.map((item) => item.name)));
    if (['decision', 'decision_short', 'price', 'pairing'].includes(action)) {
      const chose = (diagnostic.candidates_found || []).length > 0 || /eu (?:iria|escolheria)|come[cç]aria|faz mais sentido|minha escolha/iu.test(response);
      if (!SAFETY_LANGUAGE.test(response) || chose) failures.push(failure('ALLERGY_CONTEXT_LOST', turn, 'active restriction remains sovereign over decision support', response));
    }
  }

  if (['reference_second', 'reference_first', 'multiple_questions'].includes(action)) {
    if (!diagnostic.turn_analysis?.resolved_reference) failures.push(failure('VALID_REFERENCE_FAILURE', turn, 'valid antecedent resolves', diagnostic.turn_analysis));
  }
  if (action === 'reference_false' && diagnostic.turn_analysis?.resolved_reference) failures.push(failure('FALSE_REFERENCE_RESOLUTION', turn, 'no antecedent means no resolution', diagnostic.turn_analysis.resolved_reference));
  if (action === 'multiple_questions' && (!/R\$\s*\d/iu.test(response) || !/cru/iu.test(response))) failures.push(failure('COMPOUND_TURN_COLLAPSE', turn, 'compound question answers price and preparation', response));

  if (action === 'price' && !(context.allergies || []).length) {
    const values = priceNumbers(response);
    const candidates = (diagnostic.candidates_found || []).map((id) => menuIndex.get(id)).filter(Boolean);
    const allowed = candidates.map((item) => Number(item.price)).filter(Number.isFinite);
    const explicitUnavailability = /ainda n[aã]o tenho uma op[cç][aã]o compat[ií]vel|n[aã]o encontrei uma op[cç][aã]o compat[ií]vel/iu.test(response);
    if ((!values.length && !explicitUnavailability) || values.some((value) => !allowed.some((price) => Math.abs(price - value) < 0.01))) failures.push(failure('PRICE_FAILURE', turn, 'prices belong to active-channel candidates or absence is explicit', { values, allowed }));
    if (/^Encontrei /iu.test(response) || response.length > 360) failures.push(failure('PRICE_FAILURE', turn, 'price answer is concise', response));
  }

  if (['decision', 'decision_short'].includes(action) && !(context.allergies || []).length) {
    const candidateNames = (diagnostic.candidates_found || []).map((id) => menuIndex.get(id)?.name).filter(Boolean);
    const namesOne = candidateNames.some((name) => response.includes(name));
    const explicitBlocker = !candidateNames.length && /n[aã]o escolheria|nenhuma ficou compat[ií]vel/iu.test(response) && /\?/u.test(response);
    if ((!namesOne || !/eu (?:iria|escolheria|olharia)|come[cç]aria|faz mais sentido|se voc[eê]|porque|por ter|por ser|n[aã]o escolheria/iu.test(response)) && !explicitBlocker) failures.push(failure('DECISION_SUPPORT_FAILURE', turn, 'compare, choose, or expose an exact blocker with one useful next question', response));
  }
  if (action === 'pairing' && /ainda n[aã]o h[aá] uma harmoniza[cç][aã]o aprovada para a op[cç][aã]o selecionada/iu.test(response)) failures.push(failure('DECISION_SUPPORT_FAILURE', turn, 'pairing remains tied to resolved option', response));

  if (action === 'resume') {
    if (previousContext.channel && context.channel !== previousContext.channel) failures.push(failure('SIDE_QUESTION_DESTROYS_JOURNEY', turn, 'resume preserves active channel', `${previousContext.channel}->${context.channel}`));
    const menuJourneyExists = Boolean(context.channel || (diagnostic.candidates_found || []).length || context.preferred_ingredients?.length || context.preparation_preferences?.length);
    if (menuJourneyExists && !/retom|op[cç][aã]|card[aá]pio|escolh/iu.test(response) && !(context.allergies || []).length) failures.push(failure('SIDE_QUESTION_DESTROYS_JOURNEY', turn, 'resume visibly reconnects to prior menu journey', response));
  }
  if (action === 'incident' && (!/sinto muito|seguran[cç]a|equipe|atendimento|urg[eê]n/iu.test(response) || /diagn[oó]st|foi causado|com certeza/iu.test(response))) failures.push(failure('ALLERGY_CONTEXT_LOST', turn, 'possible incident receives safe escalation without diagnosis', response));
  if (action === 'urgency' && !/emerg[eê]ncia|192|atendimento m[eé]dico|socorro|urg[eê]n/iu.test(response)) failures.push(failure('ALLERGY_CONTEXT_LOST', turn, 'urgent symptoms receive immediate emergency direction', response));

  if (diagnostic.channel && (diagnostic.candidates_found || []).some((id) => menuIndex.has(id) && menuIndex.get(id).channel !== diagnostic.channel)) failures.push(failure('WRONG_CHANNEL', turn, 'all candidates belong to active channel', diagnostic.candidates_found));
  return failures;
}

function evaluateConversation(conversation, menuIndex) {
  const failures = [];
  conversation.turns.forEach((turn, index) => failures.push(...evaluateTurn(turn, conversation.turns[index - 1], menuIndex, conversation.turns.slice(Math.max(0, index - 3), index))));
  return Object.freeze({ conversation_id: conversation.conversation_id, failures });
}

module.exports = { INTERNAL, GENERIC_FALLBACK, SEVERITY, similarity, contextDelta, planSignature, evaluateTurn, evaluateConversation };

