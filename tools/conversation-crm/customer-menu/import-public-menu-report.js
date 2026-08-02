#!/usr/bin/env node
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

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

function field(value, sourceId, capturedAt) {
  const present = value !== null && value !== undefined && value !== '' && value !== '—';
  return {
    value: present ? value : null,
    curation_state: present ? 'confirmed_public' : 'unknown',
    source_id: sourceId,
    captured_at: capturedAt
  };
}

function recordId(sourceId, publicIdentity, name, category) {
  return `PUBLIC-${sha256(`${sourceId}\0${publicIdentity || ''}\0${name}\0${category}`).slice(0, 18).toUpperCase()}`;
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
    return {
      public_record_id: recordId(sourceId, null, name, `${menu}:${category}`),
      source_id: sourceId,
      channel: 'dining_room',
      unit_id: 'tata-sushi-itaim-bibi',
      public_identity: null,
      capture_status: 'extracted',
      fields: {
        name: field(name, sourceId, capturedAt),
        menu: field(menu, sourceId, capturedAt),
        category: field(category, sourceId, capturedAt),
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
      channel: 'ifood',
      unit_id: 'tata-sushi-vila-nova-conceicao',
      public_identity: publicIdentity || null,
      capture_status: 'extracted',
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

function build(report) {
  const lines = report.split(/\r?\n/u);
  const capturedAt = report.match(/\*\*Captura:\*\*\s*([^\s]+)/u)?.[1];
  if (!capturedAt) throw new Error('capture_timestamp_missing');
  const liveRows = tableBetween(lines, '# APÊNDICE A — INVENTÁRIO COMPLETO LIVEMENU', '# APÊNDICE B');
  const ifoodRows = tableBetween(lines, '# APÊNDICE B — INVENTÁRIO COMPLETO IFOOD', '# APÊNDICE C');
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
  });
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
        url: 'https://livemenu.app/menu/6407492af6880700523699bf',
        authority: 'official_public_channel'
      },
      {
        source_id: 'menu-source-ifood-v1',
        title: 'iFood — Tatá Sushi Vila Nova Conceição',
        channel: 'ifood',
        unit_id: 'tata-sushi-vila-nova-conceicao',
        url: 'https://www.ifood.com.br/delivery/sao-paulo-sp/tata-sushi-vila-nova-conceicao/039ed60c-0ea5-4660-900a-265a720d7869',
        authority: 'official_public_channel'
      }
    ],
    policy: {
      automatic_human_approval: false,
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
      safe_union_confirmable: 170
    },
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

module.exports = { build, cells, field, priceEvidence, quantityFromDescription };
