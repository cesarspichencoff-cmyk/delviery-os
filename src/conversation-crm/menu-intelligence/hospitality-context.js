'use strict';

const { cloneFrozen } = require('./contracts');

const OCCASIONS = Object.freeze([
  ['first_visit', /\b(?:primeira vez|nunca (?:fui|comi)|nao conheco)\b/u],
  ['romantic_dinner', /\b(?:romantico|encontro|a dois|casal)\b/u],
  ['celebration', /\b(?:aniversario|comemora|celebra)\b/u],
  ['business_lunch', /\b(?:almoco de negocios|reuniao de trabalho|executivo)\b/u],
  ['family_meal', /\b(?:familia|criancas|filhos)\b/u],
  ['large_group', /\b(?:grupo|galera|muita gente)\b/u],
  ['quick_meal', /\b(?:rapido|rapida|pouco tempo|com pressa)\b/u],
  ['delivery_choice', /\b(?:ifood|delivery|entrega|pedir em casa)\b/u],
  ['budget_conscious', /\b(?:barato|barata|economico|economica|mais em conta|ate r?\$?\s*\d+)\b/u],
  ['premium_experience', /\b(?:especial|premium|experiencia completa)\b/u],
  ['traditional_preference', /\b(?:tradicional|classico|classica)\b/u],
  ['adventurous_preference', /\b(?:diferente|ousado|ousada|surpreenda|aventur)\b/u],
  ['light_meal', /\b(?:leve|mais leve)\b/u],
  ['comfort_food', /\b(?:conforto|quentinho|bem servido)\b/u],
  ['drink_pairing', /\b(?:bebida|drink|harmoniza|combina)\b/u],
  ['dietary_restriction', /\b(?:vegetarian|vegano|restricao|sem gluten|sem lactose)\b/u],
  ['allergen_guidance', /\b(?:alergia|alergico|alergica|intolerancia)\b/u],
  ['menu_discovery', /\b(?:cardapio|menu|o que tem|opcoes)\b/u]
]);

const OCCASION_PRIORITY = Object.freeze({
  menu_discovery: 0, budget_conscious: 0, traditional_preference: 0,
  adventurous_preference: 0, light_meal: 0, comfort_food: 0,
  drink_pairing: 0, dietary_restriction: 0, allergen_guidance: 0,
  first_visit: 1, quick_meal: 2, delivery_choice: 2,
  romantic_dinner: 3, celebration: 3, large_group: 3,
  family_meal: 3, business_lunch: 3, premium_experience: 3
});

function initialHospitalityContext() {
  return {
    schema_version: 'deliveryos-hospitality-context-v1',
    occasion: null,
    channel: null,
    unit: null,
    number_of_people: null,
    budget: null,
    experience_level: null,
    preferred_ingredients: [],
    excluded_ingredients: [],
    flavor_preferences: [],
    texture_preferences: [],
    preparation_preferences: [],
    dietary_restrictions: [],
    allergies: [],
    desired_experience: null,
    confirmed_facts: [],
    unresolved_questions: []
  };
}

function addUnique(list, values) {
  return [...new Set([...(list || []), ...values.filter(Boolean)])];
}

function fact(context, field, value) {
  if (value === null || value === undefined || value === '') return;
  context.confirmed_facts = context.confirmed_facts.filter((item) => item.field !== field);
  context.confirmed_facts.push({ field, value, source: 'current_conversation' });
}

function extractBudget(text) {
  const match = text.match(/\b(?:ate|no maximo|por volta de)\s*(?:r\$\s*)?(\d{2,4})(?:\s*reais)?\b/u);
  return match ? { maximum_brl: Number(match[1]) } : null;
}

function updateHospitalityContext(previous, input = {}) {
  const context = structuredClone(previous || initialHospitalityContext());
  const text = String(input.normalized_text || '');
  const occasion = OCCASIONS.find(([, pattern]) => pattern.test(text))?.[0] || null;
  const preferenceOccasions = ['traditional_preference', 'adventurous_preference', 'light_meal', 'comfort_food'];
  if (occasion && (!context.occasion
    || (OCCASION_PRIORITY[occasion] || 0) > (OCCASION_PRIORITY[context.occasion] || 0)
    || (preferenceOccasions.includes(occasion) && preferenceOccasions.includes(context.occasion)))) {
    context.occasion = occasion;
    context.desired_experience = occasion;
    fact(context, 'occasion', occasion);
  }
  if (input.channel) { context.channel = input.channel; fact(context, 'channel', input.channel); }
  if (input.unit_id) { context.unit = input.unit_id; fact(context, 'unit', input.unit_id); }
  if (input.number_of_people) { context.number_of_people = input.number_of_people; fact(context, 'number_of_people', input.number_of_people); }
  const budget = extractBudget(text);
  if (budget) { context.budget = budget; fact(context, 'budget_maximum_brl', budget.maximum_brl); }
  if (/\b(?:primeira vez|iniciante|nao conheco)\b/u.test(text)) context.experience_level = 'first_time';
  if (/\b(?:conheco bem|ja conheco|frequente)\b/u.test(text)) context.experience_level = 'experienced';
  const ingredientMap = [
    ['salmon', /\bsalmao\b/u, 'salmao'], ['tuna', /\batum\b/u, 'atum'], ['shrimp', /\bcamarao\b/u, 'camarao'],
    ['white_fish', /\bpeixe branco\b/u, 'peixe branco'], ['mushroom', /\b(?:shimeji|shitake|cogumelo)\b/u, '(?:shimeji|shitake|cogumelo)']
  ];
  const mentioned = ingredientMap.filter(([, pattern]) => pattern.test(text)).map(([name]) => name);
  const excludedMentioned = ingredientMap.filter(([, pattern, source]) => (
    pattern.test(text) && new RegExp(`\\b(?:sem|nao quero|evitar)\\s+(?:(?:o|a|de)\\s+)?${source}\\b`, 'u').test(text)
  )).map(([name]) => name);
  context.excluded_ingredients = addUnique(context.excluded_ingredients, excludedMentioned);
  context.preferred_ingredients = addUnique(context.preferred_ingredients, mentioned.filter((name) => !excludedMentioned.includes(name)));
  if (/\b(?:leve|fresco|fresca)\b/u.test(text)) context.flavor_preferences = addUnique(context.flavor_preferences, ['light']);
  if (/\b(?:intenso|intensa|marcante)\b/u.test(text)) context.flavor_preferences = addUnique(context.flavor_preferences, ['intense']);
  if (/\b(?:picante|spicy)\b/u.test(text)) context.flavor_preferences = addUnique(context.flavor_preferences, ['spicy']);
  if (/\b(?:crocante|crispy)\b/u.test(text)) context.texture_preferences = addUnique(context.texture_preferences, ['crunchy']);
  if (/\b(?:cremoso|cremosa)\b/u.test(text)) context.texture_preferences = addUnique(context.texture_preferences, ['creamy']);
  if (/\b(?:macaricado|ma[çc]aricado|selado|torch)\b/u.test(text)) context.preparation_preferences = addUnique(context.preparation_preferences, ['torched']);
  if (/\b(?:cru|sashimi)\b/u.test(text)) context.preparation_preferences = addUnique(context.preparation_preferences, ['raw']);
  if (/\b(?:cozido|quente)\b/u.test(text)) context.preparation_preferences = addUnique(context.preparation_preferences, ['cooked']);
  if (/\bsem (?:fritura|frito|fritos|frita|fritas)\b/u.test(text)) context.preparation_preferences = addUnique(context.preparation_preferences, ['not_fried']);
  if (/\bsem cream cheese\b/u.test(text)) context.preparation_preferences = addUnique(context.preparation_preferences, ['without_cream_cheese']);
  if (/\bvegetarian[oa]?\b/u.test(text)) context.dietary_restrictions = addUnique(context.dietary_restrictions, ['vegetarian']);
  if (/\b(?:para compartilhar|dividir|compartilhar)\b/u.test(text)) {
    context.desired_experience = 'sharing';
    fact(context, 'desired_experience', 'sharing');
  }
  if (/\b(?:algo pequeno|porcao pequena|pouca coisa)\b/u.test(text)) {
    context.desired_experience = 'small_portion';
    fact(context, 'desired_experience', 'small_portion');
  }
  if (/\b(?:bastante fome|muita fome|bem servido)\b/u.test(text)) {
    context.desired_experience = 'substantial_meal';
    fact(context, 'desired_experience', 'substantial_meal');
  }
  context.allergies = addUnique(context.allergies, input.allergies || []);
  context.unresolved_questions = [];
  if (!context.channel && (occasion || mentioned.length || context.preparation_preferences.length)) context.unresolved_questions.push('channel');
  if (context.occasion === 'large_group' && !context.number_of_people) context.unresolved_questions.push('number_of_people');
  if (context.allergies.length) context.unresolved_questions.push('allergen_and_cross_contact_confirmation');
  return cloneFrozen(context);
}

function hospitalityRequest(context) {
  return cloneFrozen({
    channel: context.channel,
    unit_id: context.unit,
    number_of_people: context.number_of_people,
    price_range: context.budget,
    preferred_ingredients: context.preferred_ingredients,
    excluded_ingredients: context.excluded_ingredients,
    flavor_profile: context.flavor_preferences[0] || null,
    raw_or_cooked: context.preparation_preferences.includes('raw') ? 'raw'
      : (context.preparation_preferences.includes('cooked') ? 'cooked' : null),
    fried: context.preparation_preferences.includes('not_fried') ? false : null,
    cream_cheese: context.preparation_preferences.includes('without_cream_cheese') ? 'without' : null,
    dietary_restrictions: context.dietary_restrictions,
    allergies: context.allergies,
    occasion: context.occasion,
    desired_experience: context.desired_experience,
    texture_preferences: context.texture_preferences
  });
}

module.exports = {
  OCCASIONS,
  initialHospitalityContext,
  updateHospitalityContext,
  hospitalityRequest,
  extractBudget
};
