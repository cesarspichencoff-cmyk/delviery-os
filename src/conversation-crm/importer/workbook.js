'use strict';

const fs = require('node:fs');
const {
  SOURCE_SHEETS,
  UNIFIED_SHEET,
  fold,
  getMappedColumns,
  normalizePhone,
  normalizeEmail,
  normalizeFrequency
} = require('./normalization');
const { assertAnonSecret, token } = require('./privacy');

function loadXlsx() {
  try {
    return require('xlsx');
  } catch {
    const error = new Error('dependencia_xlsx_indisponivel');
    error.code = 'DEPENDENCIA_XLSX_INDISPONIVEL';
    throw error;
  }
}

function readWorkbook(inputPath) {
  if (!inputPath || !fs.existsSync(inputPath)) {
    const error = new Error('arquivo_entrada_ausente');
    error.code = 'ARQUIVO_ENTRADA_AUSENTE';
    throw error;
  }
  const XLSX = loadXlsx();
  return { XLSX, workbook: XLSX.readFile(inputPath, { cellDates: true, raw: true }) };
}

function rowsForSheet(XLSX, workbook, sheetName) {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return null;
  return XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null, blankrows: false });
}

function nonEmptyRow(row) {
  return row.some((value) => value !== null && value !== undefined && value !== '');
}

function increment(counter, key, amount = 1) {
  counter[key] = (counter[key] || 0) + amount;
}

function analyzeWorkbook(inputPath) {
  const { XLSX, workbook } = readWorkbook(inputPath);
  const result = {
    schema_version: 'crm-inventory-v0',
    sheets: {},
    import_policy: {
      source_sheets: [...SOURCE_SHEETS],
      excluded_concatenation_sheet: UNIFIED_SHEET
    }
  };

  for (const sheetName of workbook.SheetNames) {
    const rows = rowsForSheet(XLSX, workbook, sheetName) || [];
    const header = rows[0] || [];
    const columns = getMappedColumns(header);
    const stats = {
      rows: 0,
      columns: header.map((value) => String(value ?? '(vazio)')),
      empty_by_column: {},
      phone: { present: 0, valid: 0, invalid: 0, duplicate_groups_exact_valid: 0, duplicate_extra_rows_exact_valid: 0 },
      email: { present: 0, valid: 0, invalid: 0, duplicate_groups_exact_valid: 0, duplicate_extra_rows_exact_valid: 0 },
      frequency: { numeric_rows: 0, rows_gt_1: 0, rows_eq_1: 0, rows_lte_0: 0, sum: 0 }
    };
    const phoneCounts = new Map();
    const emailCounts = new Map();

    for (const row of rows.slice(1)) {
      if (!nonEmptyRow(row)) continue;
      stats.rows += 1;
      header.forEach((name, index) => {
        if (row[index] === null || row[index] === undefined || row[index] === '') {
          increment(stats.empty_by_column, String(name ?? '(vazio)'));
        }
      });

      if (columns.phone !== null) {
        const raw = row[columns.phone];
        if (raw !== null && raw !== undefined && raw !== '') {
          stats.phone.present += 1;
          const normalized = normalizePhone(raw);
          if (normalized.valid) {
            stats.phone.valid += 1;
            phoneCounts.set(normalized.value, (phoneCounts.get(normalized.value) || 0) + 1);
          } else {
            stats.phone.invalid += 1;
          }
        }
      }

      if (columns.email !== null) {
        const raw = row[columns.email];
        if (raw !== null && raw !== undefined && raw !== '') {
          stats.email.present += 1;
          const normalized = normalizeEmail(raw);
          if (normalized.valid) {
            stats.email.valid += 1;
            emailCounts.set(normalized.value, (emailCounts.get(normalized.value) || 0) + 1);
          } else {
            stats.email.invalid += 1;
          }
        }
      }

      if (columns.frequency !== null) {
        const normalized = normalizeFrequency(row[columns.frequency]);
        if (normalized.valid) {
          stats.frequency.numeric_rows += 1;
          stats.frequency.sum += normalized.value;
          if (normalized.value > 1) stats.frequency.rows_gt_1 += 1;
          else if (normalized.value === 1) stats.frequency.rows_eq_1 += 1;
          else stats.frequency.rows_lte_0 += 1;
        }
      }
    }

    for (const count of phoneCounts.values()) {
      if (count > 1) {
        stats.phone.duplicate_groups_exact_valid += 1;
        stats.phone.duplicate_extra_rows_exact_valid += count - 1;
      }
    }
    for (const count of emailCounts.values()) {
      if (count > 1) {
        stats.email.duplicate_groups_exact_valid += 1;
        stats.email.duplicate_extra_rows_exact_valid += count - 1;
      }
    }

    result.sheets[sheetName] = stats;
  }

  result.validation = validateWorkbookShape(result);
  return result;
}

function validateWorkbookShape(analysis) {
  const missingSheets = SOURCE_SHEETS.filter((sheet) => !analysis.sheets[sheet]);
  const missingIdentityColumns = SOURCE_SHEETS.filter((sheet) => {
    const columns = analysis.sheets[sheet]?.columns || [];
    const folded = columns.map(fold);
    return !folded.includes('telefone') || !folded.some((column) => column === 'email' || column === 'e_mail');
  });
  return {
    compatible: missingSheets.length === 0 && missingIdentityColumns.length === 0,
    missing_sheets: missingSheets,
    sheets_without_identity_columns: missingIdentityColumns
  };
}

function buildRawRecords(inputPath, secret) {
  assertAnonSecret(secret);
  const { XLSX, workbook } = readWorkbook(inputPath);
  const records = [];
  const quarantine = [];

  for (const sheetName of SOURCE_SHEETS) {
    const rows = rowsForSheet(XLSX, workbook, sheetName);
    if (!rows || rows.length === 0) {
      const error = new Error('planilha_incompativel');
      error.code = 'PLANILHA_INCOMPATIVEL';
      throw error;
    }
    const header = rows[0];
    const columns = getMappedColumns(header);
    if (columns.phone === null || columns.email === null || columns.frequency === null) {
      const error = new Error('planilha_incompativel');
      error.code = 'PLANILHA_INCOMPATIVEL';
      throw error;
    }

    rows.slice(1).forEach((row, rowOffset) => {
      if (!nonEmptyRow(row)) return;
      const sourceOrdinal = rowOffset + 2;
      const phone = normalizePhone(row[columns.phone]);
      const email = normalizeEmail(row[columns.email]);
      const frequency = normalizeFrequency(row[columns.frequency]);
      const rowToken = token(secret, 'row', `${sheetName}\0${sourceOrdinal}`);
      const reasons = [];
      if (!phone.valid) reasons.push(phone.reason);
      if (!email.valid) reasons.push(email.reason);
      if (!frequency.valid || frequency.reason) reasons.push(frequency.reason);

      if (!phone.valid && !email.valid) {
        quarantine.push({
          schema_version: 'crm-quarantine-v0',
          quarantine_id: token(secret, 'qua', `${sheetName}\0${sourceOrdinal}`),
          source: { dataset: 'crm_2025', sheet: sheetName, row_token: rowToken },
          reason_codes: [...new Set(reasons)].filter(Boolean),
          removed_fields: ['nome', 'sobrenome', 'telefone', 'email', 'aniversario', 'genero']
        });
        return;
      }

      const identities = [];
      if (phone.valid) identities.push({ type: 'phone', token: token(secret, 'tel', phone.value) });
      if (email.valid) identities.push({ type: 'email', token: token(secret, 'ema', email.value) });
      const identitySignature = identities.map((identity) => `${identity.type}:${identity.token}`).sort().join('|');
      records.push({
        schema_version: 'crm-import-v0',
        record_id: token(secret, 'rec', `${sheetName}\0${sourceOrdinal}\0${identitySignature}`),
        source: { dataset: 'crm_2025', sheet: sheetName, row_token: rowToken },
        identities,
        aggregate_frequency: frequency.valid ? frequency.value : null,
        quality: {
          status: reasons.filter(Boolean).length ? 'partial' : 'valid',
          warning_codes: [...new Set(reasons)].filter(Boolean),
          conflict_candidate: false
        },
        fields_removed: ['nome', 'sobrenome', 'aniversario', 'genero']
      });
    });
  }

  return { records, quarantine };
}

function indexDuplicates(records, secret) {
  const byIdentity = new Map();
  const recordById = new Map(records.map((record) => [record.record_id, record]));
  const phoneToEmails = new Map();
  const emailToPhones = new Map();

  for (const record of records) {
    for (const identity of record.identities) {
      const key = `${identity.type}:${identity.token}`;
      if (!byIdentity.has(key)) byIdentity.set(key, []);
      byIdentity.get(key).push(record.record_id);
    }
    const phone = record.identities.find((identity) => identity.type === 'phone')?.token;
    const email = record.identities.find((identity) => identity.type === 'email')?.token;
    if (phone && email) {
      if (!phoneToEmails.has(phone)) phoneToEmails.set(phone, new Set());
      phoneToEmails.get(phone).add(email);
      if (!emailToPhones.has(email)) emailToPhones.set(email, new Set());
      emailToPhones.get(email).add(phone);
    }
  }

  const conflicts = new Set();
  for (const [phone, emails] of phoneToEmails) {
    if (emails.size > 1) conflicts.add(`phone:${phone}`);
  }
  for (const [email, phones] of emailToPhones) {
    if (phones.size > 1) conflicts.add(`email:${email}`);
  }

  const groups = [];
  for (const [identityKey, recordIds] of byIdentity) {
    if (recordIds.length < 2) continue;
    const conflict = conflicts.has(identityKey);
    groups.push({
      group_id: token(secret, 'dup', identityKey),
      match_basis: identityKey.startsWith('phone:') ? 'phone_exact' : 'email_exact',
      record_ids: [...recordIds].sort(),
      classification: conflict ? 'conflict_candidate' : 'probable_duplicate'
    });
    if (conflict) {
      for (const recordId of recordIds) {
        const record = recordById.get(recordId);
        if (!record) continue;
        record.quality.conflict_candidate = true;
        record.quality.status = 'conflict_candidate';
        if (!record.quality.warning_codes.includes('identidade_divergente')) {
          record.quality.warning_codes.push('identidade_divergente');
        }
      }
    }
  }

  return groups.sort((left, right) => left.group_id.localeCompare(right.group_id));
}

function anonymizeWorkbook(inputPath, options = {}) {
  const secret = options.secret;
  const { records, quarantine } = buildRawRecords(inputPath, secret);
  const duplicateGroups = indexDuplicates(records, secret);
  const output = {
    schema_version: 'crm-anonymized-export-v0',
    provenance: {
      dataset: 'crm_2025',
      source_kind: 'xlsx_local_private',
      imported_sheets: [...SOURCE_SHEETS],
      excluded_sheet: UNIFIED_SHEET,
      generated_at: options.generatedAt || null
    },
    stats: {
      accepted_records: records.length,
      quarantined_records: quarantine.length,
      duplicate_candidate_groups: duplicateGroups.length,
      conflict_candidate_records: records.filter((record) => record.quality.conflict_candidate).length
    },
    records,
    duplicate_groups: duplicateGroups,
    quarantine
  };
  return output;
}

module.exports = {
  analyzeWorkbook,
  validateWorkbookShape,
  anonymizeWorkbook
};

