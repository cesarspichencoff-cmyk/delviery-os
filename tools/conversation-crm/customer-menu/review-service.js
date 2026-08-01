'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { stableHash, cloneFrozen } = require('../../../src/conversation-crm/menu-intelligence/contracts');

const REVIEW_ACTIONS = Object.freeze(['approve', 'correct', 'reject', 'conflict']);
const REVIEW_STATUSES = Object.freeze(['pending', 'approved', 'rejected', 'conflicting']);
const CHANNELS = Object.freeze(['dining_room', 'ifood', 'own_delivery']);
const ALLOWED_CORRECTION_KEYS = Object.freeze([
  'name', 'description', 'channel', 'unit_id', 'price', 'availability',
  'menu_item_identity', 'beverage_item_identity'
]);

function reviewError(code) {
  throw Object.assign(new Error(code.toLowerCase()), { code });
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
      location: 'https://livemenu.app/menu/6407492af6880700523699bf?cross_session=done',
      channel: 'dining_room', unit_id: 'itaim_bibi_unconfirmed', hash: null, state: 'not_imported'
    },
    {
      source_id: 'menu-source-own-delivery-v1', title: 'Delivery próprio público', format: 'url',
      location: 'https://loja.neemo.com.br/tatasushi', channel: 'own_delivery',
      unit_id: 'joao_cachoeira_unconfirmed', hash: null, state: 'not_imported'
    },
    {
      source_id: 'menu-source-ifood-v1', title: 'iFood TATÁ Sushi', format: 'url',
      location: 'public_url_not_imported', channel: 'ifood', unit_id: 'vila_nova_conceicao_unconfirmed',
      hash: null, state: 'blocked_not_imported'
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
    this.events = [];
    this.load();
  }

  load() {
    if (!fs.existsSync(this.file)) return;
    for (const line of fs.readFileSync(this.file, 'utf8').split(/\r?\n/u).filter(Boolean)) {
      try {
        const event = JSON.parse(line);
        if (this.byId.has(event.review_id) && REVIEW_ACTIONS.includes(event.action)) this.events.push(event);
      } catch {}
    }
  }

  latestMap() {
    const latest = new Map();
    for (const event of this.events) latest.set(event.review_id, event);
    return latest;
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
    return cloneFrozen({
      total: items.length,
      items: items.filter((item) => item.kind === 'item').length,
      pairings: items.filter((item) => item.kind === 'pairing').length,
      ...counts,
      active_real_items: items.filter((item) => item.kind === 'item' && item.review_status === 'approved').length,
      original_sources_in_git: false,
      append_only: true
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

  bootstrap() {
    return cloneFrozen({
      schema_version: 'deliveryos-menu-human-review-v1',
      sources: sourceRegistry(),
      summary: this.summary(),
      proposals: this.list(),
      policy: {
        automatic_confirmation: false,
        synthetic_catalog_replaced_only_after_real_approval: true,
        pairings_used_only_when_approved_and_linked: true,
        channel_and_unit_required_for_item_approval: true
      }
    });
  }
}

module.exports = {
  REVIEW_ACTIONS,
  REVIEW_STATUSES,
  CHANNELS,
  normalizeCorrection,
  sourceRegistry,
  itemProposals,
  pairingProposals,
  defaultReviewRoot,
  MenuReviewService
};
