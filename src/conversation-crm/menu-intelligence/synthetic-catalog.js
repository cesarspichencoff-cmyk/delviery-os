'use strict';

const { MenuCatalog } = require('./catalog');

function createSyntheticCatalog() {
  const catalog = new MenuCatalog({ clock: () => new Date('2026-07-01T15:00:00.000Z') });
  catalog.registerSource({
    source_id: 'SIM-SOURCE-MENU-V1',
    title: 'Catálogo sintético para homologação',
    format: 'synthetic',
    channel: 'multiple',
    unit_id: 'SIM-UNIT-ITAIM',
    authority: 'synthetic',
    review_status: 'confirmed'
  });
  const shared = {
    unit_id: 'SIM-UNIT-ITAIM',
    review_status: 'confirmed',
    availability: { state: 'available', checked_at: '2026-07-01T15:00:00.000Z', source_id: 'SIM-SOURCE-MENU-V1' },
    source_records: ['SIM-SOURCE-MENU-V1'],
    cross_contact: { state: 'unknown', source_id: 'SIM-SOURCE-MENU-V1' }
  };
  const records = [
    {
      ...shared,
      item_id: 'SIM-MENU-SALMON-LIGHT-DINING',
      commercial_identity: 'SIM-SALMON-LIGHT',
      name: 'Opção Sintética Salmão Leve',
      description: 'Item estritamente sintético para homologação.',
      channel: 'dining_room',
      category: 'sushi',
      price: 72,
      ingredients: [{ name: 'salmon', status: 'confirmed', source_id: 'SIM-SOURCE-MENU-V1' }],
      flavor_profile: ['light'],
      preparation: { raw: true, cooked: false, fried: false, torched: false, cream_cheese: false, spicy: false, vegetarian: false }
    },
    {
      ...shared,
      item_id: 'SIM-MENU-SALMON-LIGHT-IFOOD',
      commercial_identity: 'SIM-SALMON-LIGHT',
      name: 'Opção Sintética Salmão Leve Delivery',
      description: 'Variante sintética por canal.',
      channel: 'ifood',
      category: 'sushi',
      price: 78,
      ingredients: [{ name: 'salmon', status: 'confirmed', source_id: 'SIM-SOURCE-MENU-V1' }],
      flavor_profile: ['light'],
      preparation: { raw: true, cooked: false, fried: false, torched: false, cream_cheese: false, spicy: false, vegetarian: false }
    },
    {
      ...shared,
      item_id: 'SIM-MENU-SALMON-LIGHT-DINING-CONFLICT',
      commercial_identity: 'SIM-SALMON-LIGHT',
      name: 'Opção Sintética Salmão Leve — fonte divergente',
      description: 'Variante sintética conflitante mantida para revisão humana.',
      channel: 'dining_room',
      category: 'sushi',
      price: 74,
      ingredients: [{ name: 'salmon', status: 'confirmed', source_id: 'SIM-SOURCE-MENU-V1' }],
      flavor_profile: ['light'],
      preparation: { raw: true, cooked: false, fried: false, torched: false, cream_cheese: false, spicy: false, vegetarian: false },
      review_status: 'conflicting',
      review_notes: ['material_variant_difference_same_scope']
    },
    {
      ...shared,
      item_id: 'SIM-MENU-COOKED-OWN',
      commercial_identity: 'SIM-COOKED',
      name: 'Opção Sintética Cozida',
      description: 'Item cozido sintético.',
      channel: 'own_delivery',
      category: 'hot',
      price: 64,
      ingredients: [{ name: 'vegetable', status: 'confirmed', source_id: 'SIM-SOURCE-MENU-V1' }],
      flavor_profile: ['savory'],
      preparation: { raw: false, cooked: true, fried: false, torched: false, cream_cheese: false, spicy: false, vegetarian: true }
    },
    {
      ...shared,
      item_id: 'SIM-MENU-UNAVAILABLE',
      commercial_identity: 'SIM-UNAVAILABLE',
      name: 'Opção Sintética Indisponível',
      channel: 'dining_room',
      category: 'sushi',
      price: 50,
      ingredients: [],
      preparation: { raw: true, cream_cheese: false },
      availability: { state: 'unavailable', checked_at: '2026-07-01T15:00:00.000Z', source_id: 'SIM-SOURCE-MENU-V1' }
    },
    {
      ...shared,
      item_id: 'SIM-MENU-ALLERGEN',
      commercial_identity: 'SIM-ALLERGEN',
      name: 'Opção Sintética com Alérgeno',
      channel: 'dining_room',
      category: 'sushi',
      price: 55,
      ingredients: [{ name: 'shrimp', status: 'confirmed', source_id: 'SIM-SOURCE-MENU-V1' }],
      allergens: [{ allergen: 'crustacean', assertion: 'contains', source_id: 'SIM-SOURCE-MENU-V1' }],
      preparation: { raw: false, cooked: true, cream_cheese: false }
    },
    {
      ...shared,
      item_id: 'SIM-BEVERAGE-DRY',
      commercial_identity: 'SIM-BEVERAGE-DRY',
      name: 'Bebida Sintética Seca',
      channel: 'dining_room',
      category: 'beverage',
      price: 30,
      ingredients: [],
      preparation: {}
    }
  ];
  records.forEach((item) => catalog.addItem(item));
  catalog.registerPairing({
    pairing_id: 'SIM-PAIR-001',
    menu_item_id: 'SIM-MENU-SALMON-LIGHT-DINING',
    beverage_item_id: 'SIM-BEVERAGE-DRY',
    rationale: 'Regra sintética aprovada para testar contraste e leveza.',
    channel: 'dining_room',
    unit_id: 'SIM-UNIT-ITAIM',
    source_id: 'SIM-SOURCE-MENU-V1',
    approval_status: 'confirmed'
  });
  return catalog;
}

module.exports = { createSyntheticCatalog };

