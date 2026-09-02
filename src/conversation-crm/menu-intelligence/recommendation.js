'use strict';

const { menuError, cloneFrozen } = require('./contracts');

function normalizedCategory(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/gu, '').toLowerCase().trim();
}

function itemMatchesRequestedCategory(item, requestedCategory) {
  if (!requestedCategory) return true;
  const category = normalizedCategory(item.category);
  const name = normalizedCategory(item.name);
  const rules = {
    sushi: () => /^sushis?(?:\s|$)/u.test(category),
    sashimi: () => /^sashimis?(?:\s|$)/u.test(category) || /^sashimi\b/u.test(name),
    temaki: () => /^temakis?(?:\s|$)/u.test(category) || /^temaki\b/u.test(name),
    hot_roll: () => /\bhot roll\b/u.test(category) || /\bhot roll\b/u.test(name),
    combinado: () => /^combinados?(?:\s|$)/u.test(category) || /^combinado\b/u.test(name),
    entrada: () => /^entradas?(?:\s|$)/u.test(category),
    sobremesa: () => /^sobremesas?(?:\s|$)/u.test(category),
    drink: () => /^drinks?(?:\s|$)/u.test(category)
  };
  return typeof rules[requestedCategory] === 'function' && rules[requestedCategory]();
}

function itemTemperatureSemantics(item) {
  const category = normalizedCategory(item.category);
  if (/^pratos? quentes?(?:\s|$)/u.test(category)) return 'hot';
  return 'unknown';
}

function selectionSignals(request = {}, customer = {}) {
  const signals = [];
  if (request.requested_category) signals.push('requested_category');
  if (request.preferred_ingredients?.length) signals.push('preferred_ingredient');
  if (request.excluded_ingredients?.length) signals.push('excluded_ingredient');
  if (request.flavor_profile) signals.push('flavor_profile');
  if (request.texture_preferences?.length) signals.push('texture_preference');
  if (request.raw_or_cooked) signals.push('raw_or_cooked');
  if (request.temperature_preference) signals.push('temperature_preference');
  if (request.torched === true) signals.push('torched');
  if (request.fried === false) signals.push('not_fried');
  if (request.cream_cheese === 'without') signals.push('without_cream_cheese');
  if (request.number_of_people) signals.push('number_of_people');
  if (request.price_range?.maximum_brl != null || request.price_range?.maximum != null) signals.push('maximum_price');
  if (request.dietary_restrictions?.length) signals.push('dietary_restriction');
  if (request.allergies?.length) signals.push('allergy');
  if (request.occasion && !['delivery_choice', 'menu_discovery'].includes(request.occasion)) signals.push('occasion');
  if (request.desired_experience && !['delivery_choice', 'menu_discovery'].includes(request.desired_experience)) signals.push('desired_experience');
  if ([...(customer.confirmed_facts || []), ...(customer.inferred_facts || [])]
    .some((fact) => fact?.field === 'preferred_item' && fact.value)) signals.push('customer_preference');
  return [...new Set(signals)];
}

function allergenDecision(item, allergies = []) {
  const reasons = [];
  for (const allergen of allergies) {
    const assertion = item.allergens.find((entry) => entry.allergen === allergen);
    if (!assertion || assertion.assertion === 'unknown' || assertion.assertion === 'not_listed_in_recipe') {
      reasons.push(`ALLERGEN_UNCONFIRMED:${allergen}`);
    } else if (['contains', 'cross_contact_possible'].includes(assertion.assertion)) {
      reasons.push(`ALLERGEN_BLOCKED:${allergen}`);
    }
    if (item.cross_contact?.state !== 'does_not_contain_approved_source') {
      reasons.push(`CROSS_CONTACT_UNCONFIRMED:${allergen}`);
    }
  }
  return { allowed: reasons.length === 0, reasons };
}

function scoreCandidate(item, request, customer = {}) {
  let score = 0;
  const reasons = [];
  if (request.requested_category && itemMatchesRequestedCategory(item, request.requested_category)) {
    score += 40;
    reasons.push(`requested_category:${request.requested_category}`);
  }
  if (request.preferred_ingredients?.some((value) => item.ingredients.some((ingredient) => ingredient.name === value))) {
    score += 30;
    reasons.push('preferred_ingredient');
    const namedIngredient = request.preferred_ingredients.find((value) => normalizedCategory(item.name).includes(normalizedCategory(value === 'salmon' ? 'salmao' : value)));
    if (namedIngredient) {
      score += 5;
      reasons.push('preferred_ingredient_in_item_name');
    }
  }
  if (request.flavor_profile && item.flavor_profile.includes(request.flavor_profile)) {
    score += 20;
    reasons.push('flavor_profile');
  }
  if (request.number_of_people && item.quantity?.people) {
    const distance = Math.abs(item.quantity.people - request.number_of_people);
    score += Math.max(0, 15 - (distance * 5));
    reasons.push('party_size_fit');
  }
  if (request.occasion && item.hospitality_tags.includes(request.occasion)) {
    score += 25;
    reasons.push(`occasion_match:${request.occasion}`);
  }
  if (request.desired_experience && item.hospitality_tags.includes(request.desired_experience)) {
    score += 20;
    reasons.push(`experience_match:${request.desired_experience}`);
  }
  if (request.texture_preferences?.some((value) => item.texture.includes(value))) {
    score += 10;
    reasons.push('texture_match');
  }
  if (request.raw_or_cooked === 'raw' && item.preparation.raw === true) {
    score += 20;
    reasons.push('raw_preparation_confirmed');
  }
  if (request.raw_or_cooked === 'cooked' && item.preparation.cooked === true) {
    score += 20;
    reasons.push('cooked_preparation_confirmed');
  }
  if (request.torched === true && item.preparation.torched === true) {
    score += 20;
    reasons.push('torched_preparation_confirmed');
  }
  if (request.fried === false && item.preparation.fried === false) {
    score += 15;
    reasons.push('not_fried_confirmed');
  }
  if (request.cream_cheese === 'without' && item.preparation.cream_cheese === false) {
    score += 15;
    reasons.push('without_cream_cheese_confirmed');
  }
  if (request.temperature_preference === 'not_hot') {
    score += 5;
    reasons.push('confirmed_hot_section_excluded');
  }
  if (request.price_range?.maximum_brl != null || request.price_range?.maximum != null) {
    score += 10;
    reasons.push('within_confirmed_budget');
  }
  const confirmedPreferences = customer.confirmed_facts || [];
  if (confirmedPreferences.some((fact) => fact.field === 'preferred_item' && fact.value === item.commercial_identity)) {
    score += 10;
    reasons.push('confirmed_preference');
  }
  const inferredPreferences = customer.inferred_facts || [];
  if (inferredPreferences.some((fact) => fact.field === 'preferred_item' && fact.value === item.commercial_identity)) {
    score += 3;
    reasons.push('inferred_preference_low_weight');
  }
  return { score, reasons };
}

function evidenceCompleteness(item) {
  return [
    item.price != null,
    item.ingredients?.length > 0,
    item.preparation?.raw !== null,
    item.preparation?.cooked !== null,
    item.preparation?.torched !== null,
    item.preparation?.fried !== null,
    item.quantity?.people != null
  ].filter(Boolean).length;
}

function selectDiverseShortlist(candidates, limit = 3) {
  const selected = [];
  const selectedIds = new Set();
  const scoreTiers = [...new Set(candidates.map((item) => item.score))].sort((left, right) => right - left);
  for (const score of scoreTiers) {
    const tier = candidates.filter((item) => item.score === score);
    const dimensions = [
      (item) => normalizedCategory(item.category),
      (item) => `${normalizedCategory(item.category)}|${item.evidence_score}`,
      (item) => item.reasons.slice().sort().join('|')
    ];
    for (const dimension of dimensions) {
      const seen = new Set(selected.map(dimension));
      for (const candidate of tier) {
        if (selected.length >= limit) break;
        const key = dimension(candidate);
        if (selectedIds.has(candidate.item_id) || seen.has(key)) continue;
        selected.push(candidate);
        selectedIds.add(candidate.item_id);
        seen.add(key);
      }
    }
    for (const candidate of tier) {
      if (selected.length >= limit) break;
      if (selectedIds.has(candidate.item_id)) continue;
      selected.push(candidate);
      selectedIds.add(candidate.item_id);
    }
    if (selected.length >= limit) break;
  }
  return selected;
}

function recommend(catalog, request = {}, customerContext = {}) {
  if (!request.channel) throw menuError('RECOMMENDATION_CHANNEL_REQUIRED');
  if (!request.unit_id) throw menuError('RECOMMENDATION_UNIT_REQUIRED');
  const exclusions = new Set(request.excluded_ingredients || []);
  const excludedItemIds = new Set(request.exclude_item_ids || []);
  const conflictedItemIds = new Set(catalog.snapshot().conflicts
    .filter((conflict) => conflict.status === 'open')
    .flatMap((conflict) => conflict.variant_ids));
  const candidates = catalog.search({
    channel: request.channel,
    unit_id: request.unit_id,
    maximum_price: request.price_range?.maximum_brl ?? request.price_range?.maximum ?? null
  }).filter((item) => {
    if (excludedItemIds.has(item.item_id)) return false;
    if (conflictedItemIds.has(item.item_id) && item.review_status === 'approved_for_recommendation') return false;
    if (!['confirmed', 'approved_for_recommendation'].includes(item.review_status)) return false;
    if (['unavailable', 'stale'].includes(item.availability.state)) return false;
    if (request.raw_or_cooked === 'raw' && item.preparation.raw !== true) return false;
    if (request.raw_or_cooked === 'cooked' && item.preparation.cooked !== true) return false;
    if (request.temperature_preference === 'not_hot' && itemTemperatureSemantics(item) === 'hot') return false;
    if (request.torched === true && item.preparation.torched !== true) return false;
    if (request.fried === false && item.preparation.fried === true) return false;
    if (request.cream_cheese === 'without' && item.preparation.cream_cheese === true) return false;
    if (request.dietary_restrictions?.includes('vegetarian') && item.preparation.vegetarian !== true) return false;
    if (!itemMatchesRequestedCategory(item, request.requested_category)) return false;
    if (request.preferred_ingredients?.length && !request.preferred_ingredients.some((value) => item.ingredients.some((ingredient) => ingredient.name === value))) return false;
    if (item.ingredients.some((ingredient) => exclusions.has(ingredient.name))) return false;
    return allergenDecision(item, request.allergies || []).allowed;
  }).map((item) => {
    const scored = scoreCandidate(item, request, customerContext);
    return {
      item_id: item.item_id,
      name: item.name,
      category: item.category,
      channel: item.channel,
      unit_id: item.unit_id,
      price: item.price,
      reasons: scored.reasons,
      score: scored.score,
      evidence_score: evidenceCompleteness(item),
      source_records: item.source_records,
      availability: item.availability,
      warnings: [
        ...(item.availability.state === 'unknown' ? ['availability_unconfirmed'] : []),
        ...(request.fried === false && item.preparation.fried === null ? ['frying_status_unknown'] : []),
        ...(request.cream_cheese === 'without' && item.preparation.cream_cheese === null ? ['cream_cheese_status_unknown'] : []),
        ...(request.temperature_preference === 'not_hot' && itemTemperatureSemantics(item) === 'unknown' ? ['temperature_status_unknown'] : []),
        ...(request.flavor_profile && !item.flavor_profile.includes(request.flavor_profile) ? ['flavor_profile_unconfirmed'] : [])
      ]
    };
  }).sort((left, right) => (
    right.score - left.score
    || right.evidence_score - left.evidence_score
    || left.name.localeCompare(right.name, 'pt-BR')
    || left.item_id.localeCompare(right.item_id)
  ));

  const rankingSignals = selectionSignals(request, customerContext);
  const needsPreference = candidates.length > 0 && rankingSignals.length === 0;
  const selectionLimit = 3;
  const selected = needsPreference ? [] : selectDiverseShortlist(candidates, selectionLimit);

  return cloneFrozen({
    schema_version: 'deliveryos-recommendation-result-v1',
    status: needsPreference ? 'needs_preference' : (candidates.length ? 'ready' : 'no_safe_candidate'),
    ranking_status: needsPreference ? 'insufficient_customer_signal' : (candidates.length ? 'ranked_and_diversified_by_customer_signal' : 'not_applicable'),
    ranking_signals: rankingSignals,
    selection_limit: needsPreference ? 0 : selectionLimit,
    channel: request.channel,
    unit_id: request.unit_id,
    constraints_applied: [
      'channel', 'unit', 'review_status', 'availability_not_unavailable',
      ...(request.allergies || []).map((item) => `allergy:${item}`),
      ...(request.dietary_restrictions || []).map((item) => `diet:${item}`),
      ...(request.fried === false ? ['preparation:fried:false'] : []),
      ...(request.cream_cheese === 'without' ? ['preparation:cream_cheese:false'] : []),
      ...(request.torched === true ? ['preparation:torched:true'] : []),
      ...(request.temperature_preference === 'not_hot' ? ['temperature:exclude_confirmed_hot'] : []),
      ...(request.preferred_ingredients || []).map((item) => `preferred_ingredient:${item}`),
      ...(request.occasion ? [`occasion:${request.occasion}`] : []),
      ...(request.desired_experience ? [`desired_experience:${request.desired_experience}`] : []),
      ...(request.requested_category ? [`requested_category:${request.requested_category}`] : []),
      ...(request.exclude_item_ids || []).map((item) => `exclude_previously_presented:${item}`)
    ],
    candidates: selected,
    unknowns: needsPreference
      ? ['recommendation_preference_missing']
      : (candidates.length
        ? [...new Set(selected.flatMap((item) => item.warnings).filter((warning) => warning !== 'availability_unconfirmed'))]
        : ['safe_candidate_not_found']),
    explanation: selected.map((item) => ({
      item_id: item.item_id,
      reasons: item.reasons
    }))
  });
}

function approvedPairings(catalog, itemId, input = {}) {
  return cloneFrozen(catalog.pairingsFor(itemId, input).filter((pairing) => (
    pairing.approval_status === 'confirmed'
    && catalog.get(pairing.beverage_item_id).availability.state === 'available'
  )));
}

module.exports = {
  normalizedCategory,
  itemMatchesRequestedCategory,
  itemTemperatureSemantics,
  selectionSignals,
  allergenDecision,
  scoreCandidate,
  selectDiverseShortlist,
  recommend,
  approvedPairings
};

