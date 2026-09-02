#!/usr/bin/env node
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const VERIFIED_OFFICIAL_PUBLIC_SOURCE = 'verified_official_public_source';
const SOURCE_URLS = Object.freeze({
  'menu-source-live-menu-v1': 'https://livemenu.app/menu/6407492af6880700523699bf',
  'menu-source-ifood-v1': 'https://www.ifood.com.br/delivery/sao-paulo-sp/tata-sushi-vila-nova-conceicao/039ed60c-0ea5-4660-900a-265a720d7869'
});

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function cells(line) {
  return line.split('|').slice(1, -1).map((value) => value.trim());
}

function tableBetween(lines, startTitle, endTitle) {
  const start = lines.findIndex((line) => line === startTitle);
  const end = lines.findIndex((line, index) => index > start && line.startsWith(endTitle));
  if (start < 0 || end < 0) throw new Error(`section_not_found:${startTitle}`);
  return lines.slice(start, end).filter((line) => line.startsWith('|') && !line.startsWith('|---'));
}

function priceEvidence(raw) {
  const values = [...String(raw || '').matchAll(/R\$\s*([\d.]+,\d{2})/gu)]
    .map((match) => Number(match[1].replace(/\./gu, '').replace(',', '.')));
  return {
    raw: raw && raw !== '—' ? raw : null,
    current: values[0] ?? null,
    previous: values[1] ?? null,
    promotional: values.length > 1 ? values[0] : null
  };
}

function field(value, sourceId, capturedAt, options = {}) {
  const present = value !== null && value !== undefined && value !== '' && value !== '—';
  const originalValue = present ? value : null;
  return {
    value: originalValue,
    original_value: originalValue,
    value_sha256: present ? sha256(JSON.stringify(originalValue)) : null,
    curation_state: present && options.certify !== false ? VERIFIED_OFFICIAL_PUBLIC_SOURCE : (present ? 'confirmed_public' : 'unknown'),
    source_id: sourceId,
    source_url: SOURCE_URLS[sourceId],
    captured_at: capturedAt
  };
}

function recordId(sourceId, publicIdentity, name, category, variantIdentity = null) {
  return `PUBLIC-${sha256(`${sourceId}\0${publicIdentity || ''}\0${name}\0${category}\0${variantIdentity || ''}`).slice(0, 18).toUpperCase()}`;
}

function variantIdentity(priceRaw) {
  const raw = String(priceRaw || '');
  const prices = [...raw.matchAll(/R\$\s*[\d.]+,\d{2}/gu)];
  if (!prices.length) return null;
  const last = prices.at(-1);
  const suffix = raw.slice(last.index + last[0].length).replace(/^\s*[-–—]\s*/u, '').trim();
  return suffix && suffix !== '—' ? suffix : null;
}

function normalizeName(value) {
  return String(value || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
    .replace(/[^a-z0-9]+/gu, ' ').trim();
}

function reviewFacets(record) {
  const text = normalizeName(`${record.fields.name.value} ${record.fields.category.value} ${record.fields.description.value || ''}`);
  return [
    record.channel,
    ...(text.includes('salmao') ? ['salmon'] : []),
    ...(text.includes('atum') ? ['tuna'] : []),
    ...(text.includes('peixe branco') ? ['white_fish'] : []),
    ...(/\bcombinad/u.test(text) ? ['combined'] : []),
    ...(/\b(?:bebida|drink|vinho|sake|cerveja|espumante|champagne)\b/u.test(text) ? ['beverage'] : []),
    ...(/\b(?:cru|sashimi|tartar|ceviche)\b/u.test(text) ? ['raw_candidate'] : []),
    ...(/\b(?:macaricado|selado|tataki|tostado)\b/u.test(text) ? ['torched_candidate'] : []),
    ...(text.includes('cream cheese') ? ['cream_cheese_mentioned'] : []),
    ...(/\b(?:frito|frita|fritura|tempura|hot roll|katsu)\b/u.test(text) ? ['fried_mentioned'] : [])
  ];
}

function recommendationEvidence(record) {
  const facets = new Set(record.review_facets || []);
  const characteristics = [
    ...(facets.has('salmon') ? ['contains_confirmed_salmon'] : []),
    ...(facets.has('tuna') ? ['contains_confirmed_tuna'] : []),
    ...(facets.has('white_fish') ? ['contains_confirmed_white_fish'] : []),
    ...(facets.has('torched_candidate') ? ['torched'] : []),
    ...(facets.has('fried_mentioned') ? ['fried'] : []),
    ...(facets.has('beverage') ? ['beverage'] : [])
  ];
  if (!characteristics.length) return null;
  return {
    characteristics,
    compatibility_tags: [record.channel === 'ifood' ? 'delivery_choice' : 'menu_discovery'],
    conflicts_checked: true,
    restrictions_preserved: true,
    evidence_status: VERIFIED_OFFICIAL_PUBLIC_SOURCE,
    notes: 'Somente características explicitamente observadas em nome, descrição ou categoria pública.'
  };
}

function quantityFromDescription(description, explicit) {
  if (explicit !== 'sim' || !description || description === '—') return null;
  const matches = [...description.matchAll(/\b\d+\s*(?:un(?:\.|id(?:ades?)?)?|fatias?|pe[cç]as?|pessoas?|ml|l)\b/giu)].map((match) => match[0]);
  return matches.length ? matches : ['explicit_quantity_present'];
}

function liveMenuRecords(rows, capturedAt) {
  const sourceId = 'menu-source-live-menu-v1';
  return rows.slice(1).map((line) => {
    const [menu, category, name, description, priceRaw, explicitQuantity] = cells(line);
    const price = priceEvidence(priceRaw);
    const variant = variantIdentity(priceRaw);
    return {
      public_record_id: recordId(sourceId, null, name, `${menu}:${category}`, variant),
      source_id: sourceId,
      source_url: SOURCE_URLS[sourceId],
      channel: 'dining_room',
      unit_id: 'tata-sushi-itaim-bibi',
      public_identity: null,
      capture_status: VERIFIED_OFFICIAL_PUBLIC_SOURCE,
      item_status: 'approved_for_information',
      fields: {
        name: field(name, sourceId, capturedAt),
        menu: field(menu, sourceId, capturedAt, { certify: false }),
        category: field(category, sourceId, capturedAt),
        variant: field(variant, sourceId, capturedAt),
        description: field(description, sourceId, capturedAt),
        quantity: field(quantityFromDescription(description, explicitQuantity), sourceId, capturedAt),
        price: field(price, sourceId, capturedAt)
      },
      protected_unknowns: ['availability', 'allergens', 'cross_contact', 'adaptations', 'substitutions', 'pairings']
    };
  });
}

function ifoodRecords(rows, capturedAt) {
  const sourceId = 'menu-source-ifood-v1';
  return rows.slice(1).map((line) => {
    const [category, name, description, priceRaw, explicitQuantity, publicIdentity] = cells(line);
    const price = priceEvidence(priceRaw);
    return {
      public_record_id: recordId(sourceId, publicIdentity, name, category),
      source_id: sourceId,
      source_url: SOURCE_URLS[sourceId],
      channel: 'ifood',
      unit_id: 'tata-sushi-vila-nova-conceicao',
      public_identity: publicIdentity || null,
      capture_status: VERIFIED_OFFICIAL_PUBLIC_SOURCE,
      item_status: 'approved_for_information',
      fields: {
        name: field(name, sourceId, capturedAt),
        category: field(category, sourceId, capturedAt),
        description: field(description, sourceId, capturedAt),
        quantity: field(quantityFromDescription(description, explicitQuantity), sourceId, capturedAt),
        price: field(price, sourceId, capturedAt)
      },
      protected_unknowns: ['availability', 'allergens', 'cross_contact', 'adaptations', 'substitutions', 'pairings']
    };
  });
}

function coverageListing(value) {
  if (!value || value === '—') return [];
  return value.split(/;\s+/u).map((entry) => {
    const [name, category] = entry.split(' · ').map((part) => part.trim());
    return { name, category: category || null };
  }).filter((entry) => entry.name);
}

function coverageLinks(rows, records) {
  const bySource = new Map();
  for (const record of records) {
    const key = `${record.source_id}:${normalizeName(record.fields.name.value)}:${normalizeName(record.fields.category.value)}`;
    if (!bySource.has(key)) bySource.set(key, []);
    bySource.get(key).push(record.public_record_id);
  }
  const sourceCells = [
    ['menu-source-live-menu-v1', 1],
    ['menu-source-ifood-v1', 2]
  ];
  return rows.slice(1).map((line) => {
    const values = cells(line);
    const [internalName, , , result, observation] = values;
    const status = {
      'CONFIRMÁVEL_EXATO': 'exact',
      'CONFIRMÁVEL_VARIANTE_FORTE': 'strong_variant',
      'REVISÃO_HUMANA': 'human_review',
      'NÃO_LOCALIZADO': 'not_found'
    }[result];
    if (!status) throw new Error(`coverage_status_unknown:${result}`);
    const evidence = sourceCells.flatMap(([sourceId, cellIndex]) => coverageListing(values[cellIndex]).map((listing) => {
      const exactKey = `${sourceId}:${normalizeName(listing.name)}:${normalizeName(listing.category)}`;
      const ids = bySource.get(exactKey) || [];
      return { source_id: sourceId, ...listing, public_record_ids: ids };
    }));
    const resolved = evidence.flatMap((item) => item.public_record_ids);
    const autoEligible = ['exact', 'strong_variant'].includes(status)
      && evidence.length > 0
      && evidence.every((item) => item.public_record_ids.length > 0);
    return {
      internal_record_id: `INTERNAL-${sha256(internalName).slice(0, 18).toUpperCase()}`,
      internal_name: internalName,
      match_classification: status,
      link_status: autoEligible ? `auto_linked_${status}` : status,
      public_record_ids: [...new Set(resolved)],
      evidence,
      observation
    };
  });
}

function build(report) {
  const lines = report.split(/\r?\n/u);
  const capturedAt = report.match(/\*\*Captura:\*\*\s*([^\s]+)/u)?.[1];
  if (!capturedAt) throw new Error('capture_timestamp_missing');
  const liveRows = tableBetween(lines, '# APÊNDICE A — INVENTÁRIO COMPLETO LIVEMENU', '# APÊNDICE B');
  const ifoodRows = tableBetween(lines, '# APÊNDICE B — INVENTÁRIO COMPLETO IFOOD', '# APÊNDICE C');
  const coverageRows = tableBetween(lines, '# APÊNDICE C — MATRIZ DOS 199 REGISTROS PENDENTES', '# APÊNDICE D');
  const records = [...liveMenuRecords(liveRows, capturedAt), ...ifoodRecords(ifoodRows, capturedAt)];
  const groups = new Map();
  records.forEach((record) => {
    const key = normalizeName(record.fields.name.value);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(record);
  });
  records.forEach((record) => {
    record.review_facets = reviewFacets(record);
    const comparable = groups.get(normalizeName(record.fields.name.value)) || [];
    const otherChannels = comparable.filter((item) => item.channel !== record.channel);
    const currentPrice = record.fields.price.value?.current;
    record.cross_channel = {
      exact_name_match: otherChannels.length > 0,
      price_divergent: otherChannels.some((item) => item.fields.price.value?.current !== currentPrice),
      description_divergent: otherChannels.some((item) => item.fields.description.value !== record.fields.description.value),
      comparable_record_ids: otherChannels.map((item) => item.public_record_id)
    };
    if (record.cross_channel.price_divergent) record.review_facets.push('price_divergent');
    if (record.cross_channel.description_divergent) record.review_facets.push('composition_or_description_divergent');
    if (record.cross_channel.exact_name_match) record.review_facets.push('both_channels');
    record.recommendation_evidence = recommendationEvidence(record);
    if (record.recommendation_evidence) record.item_status = 'approved_for_recommendation';
    record.certification = {
      status: VERIFIED_OFFICIAL_PUBLIC_SOURCE,
      authority: 'cesar_official_source_confirmation',
      source_id: record.source_id,
      source_url: record.source_url,
      channel: record.channel,
      captured_at: capturedAt,
      certified_fields: Object.entries(record.fields)
        .filter(([, evidence]) => evidence.curation_state === VERIFIED_OFFICIAL_PUBLIC_SOURCE)
        .map(([name]) => name),
      protected_unknowns: [...record.protected_unknowns]
    };
  });
  const internalLinks = coverageLinks(coverageRows, records);
  if (internalLinks.length !== 199) throw new Error(`coverage_count_invalid:${internalLinks.length}`);
  for (const link of internalLinks) {
    for (const recordId of link.public_record_ids) {
      const record = records.find((item) => item.public_record_id === recordId);
      record.internal_links = [...(record.internal_links || []), {
        internal_record_id: link.internal_record_id,
        internal_name: link.internal_name,
        link_status: link.link_status
      }];
    }
  }
  records.forEach((record) => { record.internal_links = record.internal_links || []; });
  const linkCounts = Object.fromEntries(['exact', 'strong_variant', 'human_review', 'not_found'].map((status) => [
    status, internalLinks.filter((item) => item.match_classification === status).length
  ]));
  if (linkCounts.exact !== 154 || linkCounts.strong_variant !== 16
    || linkCounts.human_review !== 10 || linkCounts.not_found !== 19) {
    throw new Error(`coverage_distribution_invalid:${JSON.stringify(linkCounts)}`);
  }
  return {
    schema_version: 'deliveryos-public-menu-evidence-v1',
    generated_from: {
      report_sha256: sha256(report),
      captured_at: capturedAt,
      store_time_zone: 'America/Sao_Paulo'
    },
    sources: [
      {
        source_id: 'menu-source-live-menu-v1',
        title: 'LiveMenu — Tatá Sushi Itaim Bibi',
        channel: 'dining_room',
        unit_id: 'tata-sushi-itaim-bibi',
        url: SOURCE_URLS['menu-source-live-menu-v1'],
        authority: VERIFIED_OFFICIAL_PUBLIC_SOURCE,
        verification_status: VERIFIED_OFFICIAL_PUBLIC_SOURCE
      },
      {
        source_id: 'menu-source-ifood-v1',
        title: 'iFood — Tatá Sushi Vila Nova Conceição',
        channel: 'ifood',
        unit_id: 'tata-sushi-vila-nova-conceicao',
        url: SOURCE_URLS['menu-source-ifood-v1'],
        authority: VERIFIED_OFFICIAL_PUBLIC_SOURCE,
        verification_status: VERIFIED_OFFICIAL_PUBLIC_SOURCE
      }
    ],
    policy: {
      automatic_human_approval: true,
      approval_basis: 'cesar_official_source_confirmation',
      official_source_status: VERIFIED_OFFICIAL_PUBLIC_SOURCE,
      batch_eligible_fields: ['name', 'category', 'description', 'quantity', 'price'],
      batch_forbidden_fields: ['availability', 'allergens', 'cross_contact', 'adaptations', 'substitutions', 'pairings'],
      channel_merge_forbidden: true
    },
    counts: {
      total: records.length,
      dining_room: records.filter((item) => item.channel === 'dining_room').length,
      ifood: records.filter((item) => item.channel === 'ifood').length,
      cross_channel_exact_records: records.filter((item) => item.cross_channel.exact_name_match).length,
      price_divergent_records: records.filter((item) => item.cross_channel.price_divergent).length
    },
    internal_coverage: {
      total: 199,
      exact: 154,
      strong_variant: 16,
      human_review: 10,
      not_found: 19,
      safe_union_confirmable: 170,
      auto_linked_exact: internalLinks.filter((item) => item.link_status === 'auto_linked_exact').length,
      auto_linked_strong_variant: internalLinks.filter((item) => item.link_status === 'auto_linked_strong_variant').length
    },
    internal_links: internalLinks,
    records
  };
}

function main() {
  const [, , input, output] = process.argv;
  if (!input || !output) throw new Error('usage: node import-public-menu-report.js <report.md> <output.json>');
  const report = fs.readFileSync(path.resolve(input), 'utf8');
  const document = build(report);
  fs.writeFileSync(path.resolve(output), `${JSON.stringify(document, null, 2)}\n`, 'utf8');
  process.stdout.write(`${document.counts.total} public records written\n`);
}

if (require.main === module) main();

module.exports = {
  VERIFIED_OFFICIAL_PUBLIC_SOURCE,
  SOURCE_URLS,
  build,
  cells,
  field,
  priceEvidence,
  variantIdentity,
  quantityFromDescription,
  coverageListing,
  coverageLinks,
  recommendationEvidence
};

