'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { stableHash, cloneFrozen } = require('../../../src/conversation-crm/menu-intelligence/contracts');

const REVIEW_ACTIONS = Object.freeze(['approve', 'correct', 'reject', 'conflict']);
const REVIEW_STATUSES = Object.freeze(['pending', 'approved', 'rejected', 'conflicting']);
const FIELD_CURATION_STATES = Object.freeze([
  'confirmed_public', 'verified_official_public_source', 'confirmed_internal', 'human_approved', 'inferred',
  'unknown', 'conflicting', 'outdated', 'rejected'
]);
const PUBLIC_ITEM_STATUSES = Object.freeze([
  'extracted', 'under_review', 'approved_for_information',
  'approved_for_recommendation', 'blocked', 'conflicting', 'outdated'
]);
const PUBLIC_BATCH_FIELDS = Object.freeze(['name', 'category', 'description', 'quantity', 'price']);
const PUBLIC_BATCH_FORBIDDEN = Object.freeze([
  'availability', 'allergens', 'cross_contact', 'adaptations', 'substitutions', 'pairings'
]);
const RECOMMENDATION_CHARACTERISTICS = Object.freeze([
  'contains_confirmed_salmon', 'contains_confirmed_tuna', 'contains_confirmed_white_fish',
  'not_fried', 'fried', 'cream_cheese_absence_confirmed_internal', 'raw', 'cooked', 'torched',
  'vegetarian', 'shareable', 'single_person', 'two_people', 'group',
  'light_profile', 'intense_profile', 'beverage', 'dessert'
]);
const HOSPITALITY_COMPATIBILITY_TAGS = Object.freeze([
  'first_visit', 'menu_discovery', 'quick_meal', 'romantic_dinner', 'celebration',
  'large_group', 'family_meal', 'business_lunch', 'delivery_choice', 'budget_conscious',
  'premium_experience', 'traditional_preference', 'adventurous_preference', 'light_meal',
  'comfort_food', 'drink_pairing', 'dietary_restriction', 'allergen_guidance'
]);
const CHANNELS = Object.freeze(['dining_room', 'ifood', 'own_delivery']);
const ALLOWED_CORRECTION_KEYS = Object.freeze([
  'name', 'description', 'channel', 'unit_id', 'price', 'availability',
  'menu_item_identity', 'beverage_item_identity'
]);

function reviewError(code) {
  throw Object.assign(new Error(code.toLowerCase()), { code });
}

function normalizedName(value) {
  return String(value || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
    .replace(/[^a-z0-9]+/gu, ' ').trim();
}

function normalizeCorrection(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) reviewError('MENU_REVIEW_CORRECTION_INVALID');
  const output = {};
  for (const [key, raw] of Object.entries(value)) {
    if (!ALLOWED_CORRECTION_KEYS.includes(key)) reviewError('MENU_REVIEW_CORRECTION_FIELD_FORBIDDEN');
    if (key === 'price') {
      if (raw !== null && (!Number.isFinite(Number(raw)) || Number(raw) < 0)) reviewError('MENU_REVIEW_PRICE_INVALID');
      output.price = raw === null ? null : Number(raw);
      continue;
    }
    if (key === 'channel') {
      if (!CHANNELS.includes(raw)) reviewError('MENU_REVIEW_CHANNEL_INVALID');
      output.channel = raw;
      continue;
    }
    if (key === 'availability') {
      if (!['available', 'unavailable', 'unknown', 'stale'].includes(raw)) reviewError('MENU_REVIEW_AVAILABILITY_INVALID');
      output.availability = raw;
      continue;
    }
    if (raw !== null && (typeof raw !== 'string' || !raw.trim() || raw.length > 500)) reviewError('MENU_REVIEW_TEXT_INVALID');
    output[key] = raw === null ? null : raw.trim();
  }
  return output;
}

function sourceRegistry() {
  return cloneFrozen([
    {
      source_id: 'menu-source-internal-list-v1', title: 'Lista fonte TATÁ', format: 'txt',
      location: 'data/cardapio_fonte.txt', channel: 'unknown', unit_id: null,
      hash: 'c9322334c073c9439ba799739a7c6e9e53d3a6a87067c6a3ed4eb86585d36bc4',
      state: 'human_review_required'
    },
    {
      source_id: 'menu-source-operational-seed-v1', title: 'Seed operacional de conhecimento', format: 'json',
      location: 'data/cardapio_knowledge_seed.json', channel: 'unknown', unit_id: null,
      hash: '0f84415708e7364a6a6f2f537e6884bcdf415ff4139eb8855ee5227ed785f4df',
      state: 'human_review_required'
    },
    {
      source_id: 'menu-source-project-docx-v1', title: 'Projeto Cardápio e Sugestões', format: 'docx',
      location: 'external_original_not_in_git', channel: 'dining_room_unconfirmed', unit_id: null,
      hash: 'f8b01ba855e689176fdc684b065deb7bace86751dc6e1b310d3478273dbbec4d',
      state: 'human_review_required'
    },
    {
      source_id: 'menu-source-live-menu-v1', title: 'Live Menu público', format: 'url',
      location: 'https://livemenu.app/menu/6407492af6880700523699bf',
      channel: 'dining_room', unit_id: 'tata-sushi-itaim-bibi', hash: null, state: 'verified_official_public_source'
    },
    {
      source_id: 'menu-source-own-delivery-v1', title: 'Delivery próprio público', format: 'url',
      location: 'https://loja.neemo.com.br/tatasushi', channel: 'own_delivery',
      unit_id: 'joao_cachoeira_unconfirmed', hash: null, state: 'not_imported'
    },
    {
      source_id: 'menu-source-ifood-v1', title: 'iFood TATÁ Sushi', format: 'url',
      location: 'https://www.ifood.com.br/delivery/sao-paulo-sp/tata-sushi-vila-nova-conceicao/039ed60c-0ea5-4660-900a-265a720d7869',
      channel: 'ifood', unit_id: 'tata-sushi-vila-nova-conceicao',
      hash: null, state: 'verified_official_public_source'
    }
  ]);
}

function itemProposals(projectRoot) {
  const source = JSON.parse(fs.readFileSync(path.join(projectRoot, 'data', 'cardapio_knowledge_seed.json'), 'utf8'));
  return (source.itens || []).map((item) => cloneFrozen({
    review_id: `ITEM-SEED-${stableHash(item.id || item.nome).slice(0, 14).toUpperCase()}`,
    kind: 'item',
    source_id: 'menu-source-operational-seed-v1',
    source_record_id: item.id || null,
    item: item.nome || null,
    information_extracted: {
      description: item.descricao || null,
      operational_category: item.categoria_operacional || null,
      operational_subcategory: item.subcategoria_operacional || null,
      ingredients: item.ingredientes_extraidos || [],
      piece_count: item.quantidade_pecas ?? null,
      serves: item.quantidade_pessoas ?? null
    },
    channel: 'unknown',
    unit_id: null,
    divergence: item.revisao_manual ? (item.observacoes || ['manual_review_flag']) : [],
    missing_fields: ['channel', 'unit_id', 'price', 'availability', 'allergens', 'cross_contact', 'cream_cheese'],
    review_status: 'pending'
  }));
}

function pairingProposals(projectRoot) {
  const source = JSON.parse(fs.readFileSync(path.join(projectRoot, 'tools', 'conversation-crm', 'customer-menu', 'real-menu-review-source.v1.json'), 'utf8'));
  if (source.pairing_count !== 86 || source.pairings.length !== 86) reviewError('MENU_PAIRING_SOURCE_COUNT_INVALID');
  return source.pairings.map((item) => cloneFrozen({
    ...item,
    source_id: source.generated_from.source_id,
    information_extracted: {
      menu_item_name: item.menu_item_name,
      beverage_name: item.beverage_name,
      rationale: item.rationale
    },
    divergence: []
  }));
}

function defaultReviewRoot() {
  const local = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  return path.join(local, 'DeliveryOS', 'human-homologation', 'menu-review');
}

class MenuReviewService {
  constructor(options = {}) {
    this.projectRoot = path.resolve(options.projectRoot || path.resolve(__dirname, '..', '..', '..'));
    this.root = path.resolve(options.root || process.env.DELIVERYOS_MENU_REVIEW_ROOT || defaultReviewRoot());
    this.file = path.join(this.root, 'menu-review-events.runtime.jsonl');
    this.now = options.now || (() => new Date().toISOString());
    this.proposals = [...itemProposals(this.projectRoot), ...pairingProposals(this.projectRoot)];
    this.byId = new Map(this.proposals.map((item) => [item.review_id, item]));
    const publicEvidenceFile = path.join(this.projectRoot, 'tools', 'conversation-crm', 'customer-menu', 'public-menu-evidence.v1.json');
    this.publicEvidence = JSON.parse(fs.readFileSync(publicEvidenceFile, 'utf8'));
    this.publicRecords = this.publicEvidence.records;
    this.publicById = new Map(this.publicRecords.map((item) => [item.public_record_id, item]));
    this.internalLinks = this.publicEvidence.internal_links || [];
    this.internalLinkByName = new Map(this.internalLinks.map((item) => [normalizedName(item.internal_name), item]));
    this.events = [];
    this.load();
  }

  load() {
    if (!fs.existsSync(this.file)) return;
    for (const line of fs.readFileSync(this.file, 'utf8').split(/\r?\n/u).filter(Boolean)) {
      try {
        const event = JSON.parse(line);
        const legacy = this.byId.has(event.review_id) && REVIEW_ACTIONS.includes(event.action);
        const publicReview = this.publicById.has(event.public_record_id)
          && event.event_kind === 'public_field_review';
        if (legacy || publicReview) this.events.push(event);
      } catch {}
    }
  }

  latestMap() {
    const latest = new Map();
    for (const event of this.events) latest.set(event.review_id, event);
    return latest;
  }

  latestPublicMap() {
    const latest = new Map();
    for (const event of this.events) {
      if (event.event_kind === 'public_field_review') latest.set(event.public_record_id, event);
    }
    return latest;
  }

  publicRecord(record, latest = this.latestPublicMap().get(record.public_record_id)) {
    const decisions = latest?.field_decisions || {};
    const fields = Object.fromEntries(Object.entries(record.fields).map(([name, evidence]) => [name, {
      ...evidence,
      curation_state: decisions[name] || evidence.curation_state,
      reviewed_at: decisions[name] ? latest.occurred_at : null
    }]));
    return cloneFrozen({
      ...record,
      fields,
      item_status: latest?.item_status || record.item_status || record.capture_status,
      recommendation_evidence: latest?.recommendation_evidence || record.recommendation_evidence || null,
      reviewed_at: latest?.occurred_at || null,
      decision_source: latest ? 'human_review' : (record.certification?.status || null)
    });
  }

  listPublic(filters = {}) {
    const latest = this.latestPublicMap();
    return this.publicRecords.map((item) => this.publicRecord(item, latest.get(item.public_record_id)))
      .filter((item) => (!filters.channel || item.channel === filters.channel)
        && (!filters.status || item.item_status === filters.status)
        && (!filters.source_id || item.source_id === filters.source_id));
  }

  validatePublicDecision(record, fieldDecisions, itemStatus) {
    if (!PUBLIC_ITEM_STATUSES.includes(itemStatus)) reviewError('MENU_PUBLIC_ITEM_STATUS_INVALID');
    for (const [fieldName, state] of Object.entries(fieldDecisions)) {
      if (!Object.hasOwn(record.fields, fieldName)) reviewError('MENU_PUBLIC_FIELD_UNKNOWN');
      if (!FIELD_CURATION_STATES.includes(state)) reviewError('MENU_PUBLIC_FIELD_STATE_INVALID');
      if (PUBLIC_BATCH_FORBIDDEN.includes(fieldName) && state === 'human_approved') reviewError('MENU_PUBLIC_FIELD_BATCH_FORBIDDEN');
    }
    const projected = Object.fromEntries(Object.entries(record.fields).map(([name, evidence]) => [
      name, fieldDecisions[name] || evidence.curation_state
    ]));
    if (['approved_for_information', 'approved_for_recommendation'].includes(itemStatus)) {
      const trusted = ['human_approved', 'confirmed_internal', 'verified_official_public_source'];
      if (!trusted.includes(projected.name) || !trusted.includes(projected.category)) {
        reviewError('MENU_PUBLIC_INFORMATION_FIELDS_NOT_APPROVED');
      }
    }
  }

  normalizeRecommendationEvidence(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) reviewError('MENU_PUBLIC_RECOMMENDATION_EVIDENCE_REQUIRED');
    const characteristics = [...new Set((value.characteristics || []).map(String).map((item) => item.trim()).filter(Boolean))];
    const compatibilityTags = [...new Set((value.compatibility_tags || []).map(String).map((item) => item.trim()).filter(Boolean))];
    if (!characteristics.length || !compatibilityTags.length
      || value.conflicts_checked !== true || value.restrictions_preserved !== true) {
      reviewError('MENU_PUBLIC_RECOMMENDATION_EVIDENCE_REQUIRED');
    }
    if (characteristics.some((item) => !RECOMMENDATION_CHARACTERISTICS.includes(item))
      || compatibilityTags.some((item) => !HOSPITALITY_COMPATIBILITY_TAGS.includes(item))) {
      reviewError('MENU_PUBLIC_RECOMMENDATION_EVIDENCE_INVALID');
    }
    if ([...characteristics, ...compatibilityTags].some((item) => item.length > 120)) reviewError('MENU_PUBLIC_RECOMMENDATION_EVIDENCE_INVALID');
    return {
      characteristics,
      compatibility_tags: compatibilityTags,
      conflicts_checked: true,
      restrictions_preserved: true,
      notes: typeof value.notes === 'string' ? value.notes.trim().slice(0, 500) : null
    };
  }

  publicBatchPreview(input = {}) {
    const ids = [...new Set((input.public_record_ids || []).map(String))];
    const fields = [...new Set((input.fields || []).map(String))];
    const itemStatus = String(input.item_status || 'under_review');
    if (!ids.length || ids.length > 100) reviewError('MENU_PUBLIC_BATCH_SIZE_INVALID');
    if (!fields.length || fields.some((field) => !PUBLIC_BATCH_FIELDS.includes(field))) reviewError('MENU_PUBLIC_BATCH_FIELD_INVALID');
    if (!PUBLIC_ITEM_STATUSES.includes(itemStatus)) reviewError('MENU_PUBLIC_ITEM_STATUS_INVALID');
    if (itemStatus === 'approved_for_recommendation') reviewError('MENU_PUBLIC_RECOMMENDATION_BATCH_FORBIDDEN');
    const records = ids.map((id) => this.publicById.get(id));
    if (records.some((item) => !item)) reviewError('MENU_PUBLIC_RECORD_NOT_FOUND');
    const scopes = new Set(records.map((item) => `${item.source_id}:${item.channel}:${item.unit_id}`));
    if (scopes.size !== 1) reviewError('MENU_PUBLIC_BATCH_NOT_HOMOGENEOUS');
    const ineligible = records.filter((record) => fields.some((field) => (
      !['confirmed_public', 'verified_official_public_source'].includes(record.fields[field]?.curation_state)
    )));
    if (ineligible.length) reviewError('MENU_PUBLIC_BATCH_FIELD_NOT_PUBLIC_CONFIRMED');
    const previewHash = stableHash('public-menu-batch-v1', ids.slice().sort().join(','), fields.slice().sort().join(','), itemStatus);
    return cloneFrozen({
      schema_version: 'deliveryos-public-menu-batch-preview-v1',
      preview_hash: previewHash,
      record_count: records.length,
      fields,
      item_status: itemStatus,
      scope: [...scopes][0],
      requires_human_confirmation: true,
      records: records.map((item) => ({
        public_record_id: item.public_record_id,
        name: item.fields.name.value,
        channel: item.channel,
        unit_id: item.unit_id
      }))
    });
  }

  publicBatchCommit(input = {}) {
    const preview = this.publicBatchPreview(input);
    if (input.confirmation_hash !== preview.preview_hash) reviewError('MENU_PUBLIC_BATCH_CONFIRMATION_REQUIRED');
    return preview.records.map((summary) => this.publicFieldAction({
      public_record_id: summary.public_record_id,
      field_decisions: Object.fromEntries(preview.fields.map((field) => [field, 'human_approved'])),
      item_status: preview.item_status,
      confirmation: 'CONFIRM_PUBLIC_MENU_REVIEW'
    }));
  }

  publicFieldAction(input = {}) {
    if (input.confirmation !== 'CONFIRM_PUBLIC_MENU_REVIEW') reviewError('MENU_PUBLIC_CONFIRMATION_REQUIRED');
    const recordId = String(input.public_record_id || '');
    const record = this.publicById.get(recordId);
    if (!record) reviewError('MENU_PUBLIC_RECORD_NOT_FOUND');
    const previous = this.latestPublicMap().get(recordId);
    const fieldDecisions = { ...(previous?.field_decisions || {}), ...(input.field_decisions || {}) };
    const itemStatus = String(input.item_status || previous?.item_status || 'under_review');
    this.validatePublicDecision(record, fieldDecisions, itemStatus);
    const recommendationEvidence = itemStatus === 'approved_for_recommendation'
      ? this.normalizeRecommendationEvidence(input.recommendation_evidence || previous?.recommendation_evidence)
      : (previous?.recommendation_evidence || null);
    if (itemStatus === 'approved_for_recommendation') {
      const projectedDescription = fieldDecisions.description || record.fields.description.curation_state;
      if (!['human_approved', 'confirmed_internal', 'verified_official_public_source'].includes(projectedDescription)) reviewError('MENU_PUBLIC_RECOMMENDATION_FIELDS_NOT_APPROVED');
    }
    const event = cloneFrozen({
      schema_version: 'deliveryos-menu-review-event-v2',
      event_kind: 'public_field_review',
      event_id: `MENU-PUBLIC-${stableHash(recordId, this.events.length + 1).slice(0, 18).toUpperCase()}`,
      public_record_id: recordId,
      revision: (previous?.revision || 0) + 1,
      field_decisions: fieldDecisions,
      item_status: itemStatus,
      recommendation_evidence: recommendationEvidence,
      occurred_at: this.now(),
      authority: 'human_homologation',
      source_id: record.source_id,
      channel: record.channel,
      unit_id: record.unit_id
    });
    fs.mkdirSync(this.root, { recursive: true });
    fs.appendFileSync(this.file, `${JSON.stringify(event)}\n`, 'utf8');
    this.events.push(event);
    return this.publicRecord(record, event);
  }

  publicProposal(proposal, latest = this.latestMap().get(proposal.review_id)) {
    const status = latest?.status || proposal.review_status;
    const correction = latest?.correction || {};
    return cloneFrozen({
      ...proposal,
      channel: correction.channel || proposal.channel,
      unit_id: correction.unit_id || proposal.unit_id,
      information_extracted: {
        ...proposal.information_extracted,
        ...(correction.name ? { name: correction.name } : {}),
        ...(Object.hasOwn(correction, 'description') ? { description: correction.description } : {}),
        ...(Object.hasOwn(correction, 'price') ? { price: correction.price } : {}),
        ...(correction.availability ? { availability: correction.availability } : {})
      },
      review_status: status,
      reviewed_at: latest?.occurred_at || null,
      decision_source: latest ? 'human_review' : null
    });
  }

  list(filters = {}) {
    const latest = this.latestMap();
    const values = this.proposals.map((item) => this.publicProposal(item, latest.get(item.review_id)));
    return values.filter((item) => (!filters.kind || item.kind === filters.kind)
      && (!filters.status || item.review_status === filters.status));
  }

  summary() {
    const items = this.list();
    const counts = Object.fromEntries(REVIEW_STATUSES.map((status) => [status, items.filter((item) => item.review_status === status).length]));
    const publicRecords = this.listPublic();
    return cloneFrozen({
      total: items.length,
      items: items.filter((item) => item.kind === 'item').length,
      pairings: items.filter((item) => item.kind === 'pairing').length,
      ...counts,
      active_real_items: items.filter((item) => item.kind === 'item' && item.review_status === 'approved').length,
      original_sources_in_git: false,
      append_only: true,
      public_catalog: {
        total: publicRecords.length,
        dining_room: publicRecords.filter((item) => item.channel === 'dining_room').length,
        ifood: publicRecords.filter((item) => item.channel === 'ifood').length,
        approved_for_information: publicRecords.filter((item) => item.item_status === 'approved_for_information').length,
        approved_for_recommendation: publicRecords.filter((item) => item.item_status === 'approved_for_recommendation').length,
        blocked: publicRecords.filter((item) => item.item_status === 'blocked').length,
        conflicting: publicRecords.filter((item) => item.item_status === 'conflicting').length,
        human_approved_fields: publicRecords.reduce((total, item) => total
          + Object.values(item.fields).filter((field) => field.curation_state === 'human_approved').length, 0),
        verified_official_public_source: publicRecords.filter((item) => item.certification?.status === 'verified_official_public_source').length,
        certified_public_fields: publicRecords.reduce((total, item) => total
          + Object.values(item.fields).filter((field) => field.curation_state === 'verified_official_public_source').length, 0)
      },
      internal_linking: {
        total: this.internalLinks.length,
        auto_linked_exact: this.internalLinks.filter((item) => item.link_status === 'auto_linked_exact').length,
        auto_linked_strong_variant: this.internalLinks.filter((item) => item.link_status === 'auto_linked_strong_variant').length,
        human_review: this.internalLinks.filter((item) => item.link_status === 'human_review').length,
        not_found: this.internalLinks.filter((item) => item.link_status === 'not_found').length
      }
    });
  }

  action(input = {}) {
    const reviewId = String(input.review_id || '');
    const proposal = this.byId.get(reviewId);
    if (!proposal) reviewError('MENU_REVIEW_NOT_FOUND');
    const action = String(input.action || '');
    if (!REVIEW_ACTIONS.includes(action)) reviewError('MENU_REVIEW_ACTION_INVALID');
    const previous = this.latestMap().get(reviewId);
    const correction = { ...(previous?.correction || {}), ...normalizeCorrection(input.correction || {}) };
    if (action === 'approve') {
      const channel = correction.channel || proposal.channel;
      const unitId = correction.unit_id || proposal.unit_id;
      if (!CHANNELS.includes(channel) || !unitId) reviewError('MENU_REVIEW_SCOPE_REQUIRED');
      if (proposal.kind === 'pairing'
        && (!correction.menu_item_identity || !correction.beverage_item_identity)) {
        reviewError('MENU_REVIEW_PAIRING_LINK_REQUIRED');
      }
    }
    const status = { approve: 'approved', correct: 'pending', reject: 'rejected', conflict: 'conflicting' }[action];
    const event = cloneFrozen({
      schema_version: 'deliveryos-menu-review-event-v1',
      event_id: `MENU-REVIEW-${stableHash(reviewId, action, this.events.length + 1).slice(0, 18).toUpperCase()}`,
      review_id: reviewId,
      revision: (previous?.revision || 0) + 1,
      action,
      status,
      correction,
      occurred_at: this.now(),
      authority: 'human_homologation',
      source_id: proposal.source_id
    });
    fs.mkdirSync(this.root, { recursive: true });
    fs.appendFileSync(this.file, `${JSON.stringify(event)}\n`, 'utf8');
    this.events.push(event);
    return this.publicProposal(proposal, event);
  }

  approvedItems() {
    return this.list({ kind: 'item', status: 'approved' });
  }

  approvedPublicItems() {
    return this.listPublic().filter((item) => ['approved_for_information', 'approved_for_recommendation'].includes(item.item_status));
  }

  exceptionProposals() {
    const internal = this.list({ kind: 'item' }).filter((item) => {
      const link = this.internalLinkByName.get(normalizedName(item.item));
      return ['human_review', 'not_found'].includes(link?.link_status);
    }).map((item) => ({
      ...item,
      public_link: this.internalLinkByName.get(normalizedName(item.item))
    }));
    return cloneFrozen([
      ...internal,
      ...this.list({ kind: 'pairing' })
    ]);
  }

  exceptionQueue() {
    return cloneFrozen({
      item_links: this.internalLinks.filter((item) => ['human_review', 'not_found'].includes(item.link_status)),
      protected_field_groups: [
        'allergens', 'cross_contact', 'adaptations', 'substitutions', 'availability_realtime', 'pairings'
      ],
      pairing_count: this.list({ kind: 'pairing' }).length,
      same_scope_conflicts: this.listPublic({ status: 'conflicting' }).map((item) => item.public_record_id),
      cross_channel_differences_are_conflicts: false
    });
  }

  bootstrap() {
    return cloneFrozen({
      schema_version: 'deliveryos-menu-human-review-v1',
      sources: sourceRegistry(),
      summary: this.summary(),
      proposals: this.exceptionProposals(),
      public_records: this.listPublic().filter((item) => item.item_status === 'conflicting'),
      exception_queue: this.exceptionQueue(),
      public_capture: this.publicEvidence.generated_from,
      policy: {
        automatic_confirmation: true,
        automatic_confirmation_basis: 'verified_official_public_source',
        synthetic_catalog_replaced_only_after_real_approval: false,
        pairings_used_only_when_approved_and_linked: true,
        channel_and_unit_required_for_item_approval: true,
        field_level_curation: true,
        field_states: FIELD_CURATION_STATES,
        public_item_statuses: PUBLIC_ITEM_STATUSES,
        batch_fields: PUBLIC_BATCH_FIELDS,
        batch_forbidden_fields: PUBLIC_BATCH_FORBIDDEN,
        human_confirmation_required: false,
        human_confirmation_required_for: [
          'ambiguous_links', 'not_found_items', 'allergens', 'cross_contact',
          'adaptations', 'substitutions', 'availability_realtime', 'pairings', 'same_scope_conflicts'
        ]
      }
    });
  }
}

module.exports = {
  REVIEW_ACTIONS,
  REVIEW_STATUSES,
  FIELD_CURATION_STATES,
  PUBLIC_ITEM_STATUSES,
  PUBLIC_BATCH_FIELDS,
  PUBLIC_BATCH_FORBIDDEN,
  RECOMMENDATION_CHARACTERISTICS,
  HOSPITALITY_COMPATIBILITY_TAGS,
  CHANNELS,
  normalizeCorrection,
  sourceRegistry,
  itemProposals,
  pairingProposals,
  defaultReviewRoot,
  MenuReviewService
};

