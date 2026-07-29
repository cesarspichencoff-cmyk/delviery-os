'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  IMPORT_STATES, customerError, stableHash, cloneFrozen
} = require('./contracts');
const { normalizedIdentity, resolveIdentity } = require('./identity-resolver');

const ADAPTER_SOURCES = Object.freeze(['neemo', 'get_in', 'tagme', 'ifood_history', 'generic']);
const DEFAULT_MAPPING = Object.freeze({
  phone: ['phone', 'telefone', 'celular'],
  email: ['email', 'e_mail'],
  external_id: ['external_id', 'id', 'customer_id'],
  unit: ['unit', 'unidade'],
  order_count: ['orders', 'pedidos', 'frequencia']
});

function fold(value) {
  return String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/gu, '')
    .toLowerCase().replace(/[^a-z0-9]+/gu, '_').replace(/^_|_$/gu, '');
}

function detectDelimiter(line) {
  const candidates = [',', ';', '\t'];
  return candidates.map((delimiter) => ({
    delimiter,
    count: String(line).split(delimiter).length
  })).sort((a, b) => b.count - a.count)[0].delimiter;
}

function parseDelimited(text) {
  const lines = String(text).replace(/^\uFEFF/u, '').split(/\r?\n/u).filter((line) => line.trim());
  if (!lines.length) return [];
  const delimiter = detectDelimiter(lines[0]);
  const parseLine = (line) => {
    const output = [];
    let current = '';
    let quoted = false;
    for (let index = 0; index < line.length; index += 1) {
      const char = line[index];
      if (char === '"') {
        if (quoted && line[index + 1] === '"') {
          current += '"';
          index += 1;
        } else quoted = !quoted;
      } else if (char === delimiter && !quoted) {
        output.push(current);
        current = '';
      } else current += char;
    }
    output.push(current);
    return output;
  };
  const headers = parseLine(lines[0]).map(fold);
  return lines.slice(1).map((line) => Object.fromEntries(headers.map((header, index) => [header, parseLine(line)[index] ?? null])));
}

function parseSourceFile(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  const bytes = fs.readFileSync(filePath);
  if (['.csv', '.txt', '.tsv'].includes(extension)) {
    return { format: 'delimited', bytes, sheets: [{ name: 'data', rows: parseDelimited(bytes.toString('utf8')) }] };
  }
  if (extension === '.xlsx') {
    let XLSX;
    try { XLSX = require('xlsx'); } catch { throw customerError('XLSX_DEPENDENCY_UNAVAILABLE'); }
    const workbook = XLSX.read(bytes, { type: 'buffer', raw: true, cellDates: true });
    return {
      format: 'xlsx',
      bytes,
      sheets: workbook.SheetNames.map((name) => ({
        name,
        rows: XLSX.utils.sheet_to_json(workbook.Sheets[name], { raw: true, defval: null })
      }))
    };
  }
  throw customerError('IMPORT_FORMAT_UNSUPPORTED');
}

function firstMapped(row, candidates) {
  for (const key of candidates) if (row[key] !== null && row[key] !== undefined && String(row[key]).trim()) return row[key];
  return null;
}

function normalizeRow(row, source, secret, mapping = DEFAULT_MAPPING) {
  const normalized = Object.fromEntries(Object.entries(row).map(([key, value]) => [fold(key), value]));
  const identities = [
    normalizedIdentity({ type: 'phone', value: firstMapped(normalized, mapping.phone), source }, { secret }),
    normalizedIdentity({ type: 'email', value: firstMapped(normalized, mapping.email), source }, { secret }),
    normalizedIdentity({ type: 'external_id', value: firstMapped(normalized, mapping.external_id), source }, { secret })
  ].filter(Boolean);
  const warnings = [];
  if (!identities.length) warnings.push('NO_VALID_IDENTITY');
  const orderCountRaw = firstMapped(normalized, mapping.order_count);
  const orderCount = orderCountRaw === null ? null : Number(orderCountRaw);
  if (orderCountRaw !== null && (!Number.isFinite(orderCount) || orderCount < 0)) warnings.push('ORDER_COUNT_INVALID');
  return {
    identities,
    unit: firstMapped(normalized, mapping.unit),
    order_count: Number.isFinite(orderCount) && orderCount >= 0 ? orderCount : null,
    warnings,
    ignored_fields: Object.keys(normalized).filter((key) => !Object.values(mapping).flat().includes(key))
  };
}

class CustomerImportPipeline {
  constructor(options = {}) {
    this.store = options.store;
    this.secret = String(options.secret || '');
    if (!this.store) throw customerError('IMPORT_STORE_REQUIRED');
    if (this.secret.length < 32) throw customerError('IMPORT_SECRET_INVALID');
    this.batches = new Map();
  }

  stage(input = {}) {
    const source = String(input.source || '');
    if (!ADAPTER_SOURCES.includes(source)) throw customerError('IMPORT_SOURCE_UNSUPPORTED');
    const parsed = parseSourceFile(input.file_path);
    const fileHash = stableHash(parsed.bytes);
    const adapterVersion = input.adapter_version || 'v1';
    const idempotencyKey = stableHash(source, adapterVersion, fileHash);
    const existing = [...this.batches.values()].find((batch) => batch.idempotency_key === idempotencyKey);
    if (existing) return cloneFrozen({ ...existing, duplicate_upload: true });
    const batchId = `IMP-${idempotencyKey.slice(0, 16)}`;
    const rows = [];
    parsed.sheets.forEach((sheet) => sheet.rows.forEach((row, index) => {
      const data = normalizeRow(row, source, this.secret, input.mapping || DEFAULT_MAPPING);
      const resolution = resolveIdentity({
        identities: data.identities,
        candidates: data.identities.flatMap((identity) => this.store.findByIdentity(identity))
      });
      rows.push({
        import_row_id: `${batchId}-${String(rows.length + 1).padStart(6, '0')}`,
        sheet: sheet.name,
        row_number: index + 2,
        state: data.identities.length ? 'valid' : 'invalid',
        normalized: data,
        resolution,
        action: resolution.classification === 'exact_match' ? 'link_existing' : 'create_candidate'
      });
    }));
    const batch = {
      schema_version: 'deliveryos-import-batch-v1',
      batch_id: batchId,
      idempotency_key: idempotencyKey,
      source,
      adapter_version: adapterVersion,
      file_hash: fileHash,
      format: parsed.format,
      state: 'previewed',
      duplicate_upload: false,
      rows,
      preview: {
        total: rows.length,
        valid: rows.filter((row) => row.state === 'valid').length,
        invalid: rows.filter((row) => row.state === 'invalid').length,
        exact_matches: rows.filter((row) => row.resolution.classification === 'exact_match').length,
        human_review: rows.filter((row) => ['probable_match', 'possible_match', 'conflict'].includes(row.resolution.classification)).length,
        ignored_fields: [...new Set(rows.flatMap((row) => row.normalized.ignored_fields))].sort()
      },
      effects: []
    };
    this.batches.set(batchId, batch);
    return cloneFrozen(batch);
  }

  approve(batchId, input = {}) {
    const batch = this.batches.get(batchId);
    if (!batch) throw customerError('IMPORT_BATCH_NOT_FOUND');
    if (!input.approved_by_human) throw customerError('IMPORT_REQUIRES_HUMAN_APPROVAL');
    if (!['previewed', 'approved'].includes(batch.state)) throw customerError('IMPORT_BATCH_STATE_INVALID');
    batch.state = 'approved';
    batch.approved_by = input.approved_by_human;
    return cloneFrozen(batch);
  }

  apply(batchId) {
    const batch = this.batches.get(batchId);
    if (!batch) throw customerError('IMPORT_BATCH_NOT_FOUND');
    if (batch.state === 'imported') return cloneFrozen({ ...batch, idempotent_replay: true });
    if (batch.state !== 'approved') throw customerError('IMPORT_NOT_APPROVED');
    for (const row of batch.rows.filter((item) => item.state === 'valid')) {
      if (['probable_match', 'possible_match', 'conflict'].includes(row.resolution.classification)) {
        row.state = 'pending_human_review';
        continue;
      }
      let customerId;
      if (row.resolution.classification === 'exact_match') {
        customerId = row.resolution.candidates[0].customer_id;
      } else {
        customerId = this.store.createCustomer({ provenance: `import:${batch.source}` }).customer_id;
        row.normalized.identities.forEach((identity) => this.store.addIdentity(customerId, identity, { source: batch.source }));
      }
      if (row.normalized.unit) {
        this.store.recordFact(customerId, {
          field: 'unit_affinity',
          value: String(row.normalized.unit),
          state: 'imported',
          source: batch.source
        });
      }
      if (row.normalized.order_count !== null) {
        this.store.recordFact(customerId, {
          field: 'historical_order_count',
          value: row.normalized.order_count,
          state: 'imported',
          source: batch.source
        });
      }
      row.state = 'imported';
      row.customer_id = customerId;
      batch.effects.push({ import_row_id: row.import_row_id, customer_id: customerId });
    }
    batch.state = 'imported';
    return cloneFrozen(batch);
  }

  rollback(batchId, input = {}) {
    const batch = this.batches.get(batchId);
    if (!batch) throw customerError('IMPORT_BATCH_NOT_FOUND');
    if (batch.state !== 'imported') throw customerError('IMPORT_BATCH_NOT_IMPORTED');
    if (!input.approved_by_human) throw customerError('ROLLBACK_REQUIRES_HUMAN_APPROVAL');
    batch.state = 'rolled_back';
    batch.rollback = {
      approved_by: input.approved_by_human,
      preserves_prior_data: true,
      effect_ids: batch.effects.map((effect) => effect.import_row_id)
    };
    return cloneFrozen(batch);
  }

  get(batchId) {
    const batch = this.batches.get(batchId);
    if (!batch) throw customerError('IMPORT_BATCH_NOT_FOUND');
    return cloneFrozen(batch);
  }
}

module.exports = {
  ADAPTER_SOURCES,
  DEFAULT_MAPPING,
  fold,
  detectDelimiter,
  parseDelimited,
  parseSourceFile,
  normalizeRow,
  CustomerImportPipeline
};
