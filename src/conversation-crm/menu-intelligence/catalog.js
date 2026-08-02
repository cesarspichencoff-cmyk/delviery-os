'use strict';

const fs = require('node:fs');
const {
  CHANNELS, REVIEW_STATES, AVAILABILITY_STATES, ALLERGEN_ASSERTIONS,
  menuError, stableHash, requireEnum, requireText, cloneFrozen
} = require('./contracts');

function itemIdentity(input) {
  return [
    input.commercial_identity,
    input.channel,
    input.unit_id,
    input.period || 'always',
    input.size || 'default'
  ].join(':');
}

function validateAllergen(item) {
  for (const assertion of item.allergens || []) {
    requireText(assertion.allergen, 'ALLERGEN_NAME_REQUIRED');
    requireEnum(assertion.assertion, ALLERGEN_ASSERTIONS, 'ALLERGEN_ASSERTION_INVALID');
    requireText(assertion.source_id, 'ALLERGEN_SOURCE_REQUIRED');
  }
}

function createMenuItem(input = {}) {
  requireText(input.commercial_identity, 'MENU_COMMERCIAL_IDENTITY_REQUIRED');
  requireText(input.name, 'MENU_ITEM_NAME_REQUIRED');
  requireEnum(input.channel, CHANNELS, 'MENU_CHANNEL_INVALID');
  requireText(input.unit_id, 'MENU_UNIT_REQUIRED');
  requireEnum(input.review_status || 'unconfirmed', REVIEW_STATES, 'MENU_REVIEW_STATE_INVALID');
  requireEnum(input.availability?.state || 'unknown', AVAILABILITY_STATES, 'MENU_AVAILABILITY_INVALID');
  validateAllergen(input);
  const itemId = input.item_id || `MENU-${stableHash(itemIdentity(input)).slice(0, 16)}`;
  return cloneFrozen({
    schema_version: 'deliveryos-menu-item-v1',
    item_id: itemId,
    commercial_identity: input.commercial_identity,
    name: input.name,
    description: input.description ?? null,
    channel: input.channel,
    unit_id: input.unit_id,
    period: input.period || 'always',
    category: input.category || 'unknown',
    price: input.price ?? null,
    currency: input.price == null ? null : (input.currency || 'BRL'),
    quantity: input.quantity ?? null,
    piece_count: input.piece_count ?? null,
    ingredients: (input.ingredients || []).map((ingredient) => ({
      name: String(ingredient.name || ingredient),
      status: ingredient.status || 'unconfirmed',
      source_id: ingredient.source_id || null
    })),
    customizations: (input.customizations || []).map((entry) => ({ ...entry })),
    flavor_profile: input.flavor_profile || [],
    texture: input.texture || [],
    hospitality_tags: input.hospitality_tags || [],
    preparation: {
      raw: input.preparation?.raw ?? null,
      cooked: input.preparation?.cooked ?? null,
      fried: input.preparation?.fried ?? null,
      torched: input.preparation?.torched ?? null,
      spicy: input.preparation?.spicy ?? null,
      cream_cheese: input.preparation?.cream_cheese ?? null,
      vegetarian: input.preparation?.vegetarian ?? null
    },
    allergens: (input.allergens || []).map((entry) => ({ ...entry })),
    cross_contact: input.cross_contact || { state: 'unknown', source_id: null },
    availability: {
      state: input.availability?.state || 'unknown',
      checked_at: input.availability?.checked_at || null,
      source_id: input.availability?.source_id || null
    },
    image_reference: input.image_reference || null,
    source_records: [...new Set(input.source_records || [])],
    valid_from: input.valid_from || null,
    valid_until: input.valid_until || null,
    review_status: input.review_status || 'unconfirmed',
    review_notes: input.review_notes || []
  });
}

class MenuCatalog {
  constructor(options = {}) {
    this.clock = options.clock || (() => new Date());
    this.items = new Map();
    this.sources = new Map();
    this.conflicts = [];
    this.pairings = new Map();
  }

  registerSource(input = {}) {
    const sourceId = requireText(input.source_id, 'MENU_SOURCE_ID_REQUIRED');
    const record = cloneFrozen({
      schema_version: 'deliveryos-menu-source-v1',
      source_id: sourceId,
      title: requireText(input.title, 'MENU_SOURCE_TITLE_REQUIRED'),
      format: input.format || 'unknown',
      channel: input.channel || 'unknown',
      unit_id: input.unit_id || null,
      authority: input.authority || 'unconfirmed',
      content_hash: input.content_hash || null,
      observed_at: input.observed_at || null,
      review_status: input.review_status || 'unconfirmed',
      gaps: input.gaps || []
    });
    this.sources.set(sourceId, record);
    return record;
  }

  addItem(input = {}) {
    const item = createMenuItem(input);
    if (this.items.has(item.item_id)) throw menuError('MENU_ITEM_ID_DUPLICATE');
    for (const sourceId of item.source_records) {
      if (!this.sources.has(sourceId)) throw menuError('MENU_ITEM_SOURCE_UNKNOWN', { source_id: sourceId });
    }
    const siblings = [...this.items.values()].filter((current) => current.commercial_identity === item.commercial_identity);
    for (const sibling of siblings) {
      if (sibling.channel !== item.channel || sibling.unit_id !== item.unit_id) continue;
      if (JSON.stringify(sibling.ingredients) !== JSON.stringify(item.ingredients)
        || sibling.price !== item.price || sibling.description !== item.description) {
        this.conflicts.push(cloneFrozen({
          conflict_id: `MCF-${stableHash(sibling.item_id, item.item_id).slice(0, 14)}`,
          commercial_identity: item.commercial_identity,
          variant_ids: [sibling.item_id, item.item_id],
          reason: 'material_variant_difference_same_scope',
          status: 'open'
        }));
      }
    }
    this.items.set(item.item_id, item);
    return item;
  }

  search(filters = {}) {
    const query = String(filters.query || '').toLocaleLowerCase('pt-BR');
    return cloneFrozen([...this.items.values()].filter((item) => {
      if (filters.channel && item.channel !== filters.channel) return false;
      if (filters.unit_id && item.unit_id !== filters.unit_id) return false;
      if (filters.category && item.category !== filters.category) return false;
      if (filters.review_status && item.review_status !== filters.review_status) return false;
      if (filters.availability && item.availability.state !== filters.availability) return false;
      if (filters.raw !== undefined && item.preparation.raw !== filters.raw) return false;
      if (filters.cream_cheese !== undefined && item.preparation.cream_cheese !== filters.cream_cheese) return false;
      if (filters.maximum_price != null && (item.price == null || item.price > filters.maximum_price)) return false;
      if (filters.allergen && !item.allergens.some((entry) => entry.allergen === filters.allergen)) return false;
      return !query || `${item.name} ${item.description || ''} ${item.category}`.toLocaleLowerCase('pt-BR').includes(query);
    }));
  }

  get(itemId) {
    const item = this.items.get(itemId);
    if (!item) throw menuError('MENU_ITEM_NOT_FOUND');
    return item;
  }

  compare(commercialIdentity) {
    const variants = [...this.items.values()].filter((item) => item.commercial_identity === commercialIdentity);
    return cloneFrozen({
      commercial_identity: commercialIdentity,
      variants,
      conflicts: this.conflicts.filter((item) => item.commercial_identity === commercialIdentity),
      comparable: variants.length > 1
    });
  }

  registerPairing(input = {}) {
    const pairingId = input.pairing_id || `PAIR-${stableHash(input.menu_item_id, input.beverage_item_id).slice(0, 14)}`;
    const pairing = cloneFrozen({
      schema_version: 'deliveryos-menu-pairing-v1',
      pairing_id: pairingId,
      menu_item_id: requireText(input.menu_item_id, 'PAIRING_MENU_ITEM_REQUIRED'),
      beverage_item_id: requireText(input.beverage_item_id, 'PAIRING_BEVERAGE_REQUIRED'),
      rationale: requireText(input.rationale, 'PAIRING_RATIONALE_REQUIRED'),
      channel: requireEnum(input.channel, CHANNELS, 'PAIRING_CHANNEL_INVALID'),
      unit_id: requireText(input.unit_id, 'PAIRING_UNIT_REQUIRED'),
      source_id: requireText(input.source_id, 'PAIRING_SOURCE_REQUIRED'),
      approval_status: input.approval_status || 'unconfirmed'
    });
    this.pairings.set(pairingId, pairing);
    return pairing;
  }

  pairingsFor(itemId, filters = {}) {
    return cloneFrozen([...this.pairings.values()].filter((pairing) => (
      pairing.menu_item_id === itemId
      && (!filters.channel || pairing.channel === filters.channel)
      && (!filters.unit_id || pairing.unit_id === filters.unit_id)
    )));
  }

  snapshot() {
    return cloneFrozen({
      schema_version: 'deliveryos-menu-catalog-v1',
      source_count: this.sources.size,
      item_count: this.items.size,
      pairing_count: this.pairings.size,
      conflict_count: this.conflicts.length,
      sources: [...this.sources.values()],
      items: [...this.items.values()],
      pairings: [...this.pairings.values()],
      conflicts: this.conflicts
    });
  }
}

function inventoryOperationalSeed(filePath) {
  const document = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const items = Array.isArray(document.itens) ? document.itens : [];
  return cloneFrozen({
    schema_version: 'deliveryos-menu-seed-inventory-v1',
    source_records: items.map((item) => ({
      source_record_id: item.id || item.item_id || `SEED-${stableHash(item.nome || item.name).slice(0, 12)}`,
      name: item.nome || item.name || null,
      description_present: Boolean(item.descricao || item.description),
      channel: 'unknown',
      unit_id: null,
      review_status: 'unconfirmed'
    })),
    importable_as_commercial_catalog: false,
    reasons: ['CHANNEL_UNKNOWN', 'UNIT_UNKNOWN', 'COMMERCIAL_REVIEW_REQUIRED']
  });
}

module.exports = {
  itemIdentity,
  validateAllergen,
  createMenuItem,
  MenuCatalog,
  inventoryOperationalSeed
};
