'use strict';

const { menuError, cloneFrozen } = require('./contracts');

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
  if (request.preferred_ingredients?.some((value) => item.ingredients.some((ingredient) => ingredient.name === value))) {
    score += 30;
    reasons.push('preferred_ingredient');
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

function recommend(catalog, request = {}, customerContext = {}) {
  if (!request.channel) throw menuError('RECOMMENDATION_CHANNEL_REQUIRED');
  if (!request.unit_id) throw menuError('RECOMMENDATION_UNIT_REQUIRED');
  const exclusions = new Set(request.excluded_ingredients || []);
  const candidates = catalog.search({
    channel: request.channel,
    unit_id: request.unit_id,
    availability: 'available',
    review_status: 'confirmed',
    maximum_price: request.price_range?.maximum ?? null
  }).filter((item) => {
    if (request.raw_or_cooked === 'raw' && item.preparation.raw !== true) return false;
    if (request.raw_or_cooked === 'cooked' && item.preparation.cooked !== true) return false;
    if (request.fried === false && item.preparation.fried !== false) return false;
    if (request.cream_cheese === 'without' && item.preparation.cream_cheese !== false) return false;
    if (request.dietary_restrictions?.includes('vegetarian') && item.preparation.vegetarian !== true) return false;
    if (request.preferred_ingredients?.length && !request.preferred_ingredients.some((value) => item.ingredients.some((ingredient) => ingredient.name === value))) return false;
    if (item.ingredients.some((ingredient) => exclusions.has(ingredient.name))) return false;
    return allergenDecision(item, request.allergies || []).allowed;
  }).map((item) => {
    const scored = scoreCandidate(item, request, customerContext);
    return {
      item_id: item.item_id,
      name: item.name,
      channel: item.channel,
      unit_id: item.unit_id,
      price: item.price,
      reasons: scored.reasons,
      score: scored.score,
      source_records: item.source_records,
      availability: item.availability
    };
  }).sort((left, right) => right.score - left.score || left.item_id.localeCompare(right.item_id));

  return cloneFrozen({
    schema_version: 'deliveryos-recommendation-result-v1',
    status: candidates.length ? 'ready' : 'no_safe_candidate',
    channel: request.channel,
    unit_id: request.unit_id,
    constraints_applied: [
      'channel', 'unit', 'review_status', 'availability',
      ...(request.allergies || []).map((item) => `allergy:${item}`),
      ...(request.dietary_restrictions || []).map((item) => `diet:${item}`),
      ...(request.fried === false ? ['preparation:fried:false'] : []),
      ...(request.cream_cheese === 'without' ? ['preparation:cream_cheese:false'] : []),
      ...(request.preferred_ingredients || []).map((item) => `preferred_ingredient:${item}`)
    ],
    candidates: candidates.slice(0, 3),
    unknowns: candidates.length ? [] : ['safe_candidate_not_found'],
    explanation: candidates.slice(0, 3).map((item) => ({
      item_id: item.item_id,
      reasons: item.reasons.length ? item.reasons : ['channel_unit_availability_match']
    }))
  });
}

function approvedPairings(catalog, itemId, input = {}) {
  return cloneFrozen(catalog.pairingsFor(itemId, input).filter((pairing) => (
    pairing.approval_status === 'confirmed'
    && catalog.get(pairing.beverage_item_id).availability.state === 'available'
  )));
}

module.exports = { allergenDecision, scoreCandidate, recommend, approvedPairings };
