'use strict';

const SOURCE_SHEETS = Object.freeze(['Salao', 'APP', 'IFOOD']);
const UNIFIED_SHEET = 'Todos Unificados';

function fold(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function normalizePhone(value) {
  let digits = String(value ?? '').replace(/\D/g, '');
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    digits = digits.slice(2);
  }

  if (!digits) return { value: null, valid: false, reason: 'telefone_ausente' };
  if (digits.length !== 10 && digits.length !== 11) {
    return { value: null, valid: false, reason: 'telefone_tamanho_invalido' };
  }
  if (new Set(digits).size === 1) {
    return { value: null, valid: false, reason: 'telefone_repetitivo' };
  }

  const areaCode = Number(digits.slice(0, 2));
  if (!Number.isInteger(areaCode) || areaCode < 11 || areaCode > 99) {
    return { value: null, valid: false, reason: 'telefone_ddd_invalido' };
  }
  if (digits.length === 11 && digits[2] !== '9') {
    return { value: null, valid: false, reason: 'telefone_celular_invalido' };
  }

  return { value: digits, valid: true, reason: null };
}

function normalizeEmail(value) {
  const email = String(value ?? '').trim().toLowerCase();
  if (!email) return { value: null, valid: false, reason: 'email_ausente' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { value: null, valid: false, reason: 'email_invalido' };
  }
  return { value: email, valid: true, reason: null };
}

function normalizeFrequency(value) {
  if (value === null || value === undefined || value === '') {
    return { value: null, valid: false, reason: 'frequencia_ausente' };
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return { value: null, valid: false, reason: 'frequencia_invalida' };
  }
  return { value: numeric, valid: true, reason: numeric === 0 ? 'frequencia_zero' : null };
}

function mapHeaders(headerRow) {
  const result = new Map();
  headerRow.forEach((header, index) => {
    const key = fold(header);
    if (key && !result.has(key)) result.set(key, index);
  });
  return result;
}

function findColumn(headerMap, candidates) {
  for (const candidate of candidates) {
    if (headerMap.has(candidate)) return headerMap.get(candidate);
  }
  return null;
}

function getMappedColumns(headerRow) {
  const headers = mapHeaders(headerRow);
  return {
    phone: findColumn(headers, ['telefone', 'phone']),
    email: findColumn(headers, ['email', 'e_mail']),
    frequency: findColumn(headers, ['frequencia', 'pedidos']),
    channel: findColumn(headers, ['canal']),
    birthday: findColumn(headers, ['data_de_aniversario', 'aniversario']),
    name: findColumn(headers, ['nome']),
    surname: findColumn(headers, ['sobrenome']),
    gender: findColumn(headers, ['genero'])
  };
}

module.exports = {
  SOURCE_SHEETS,
  UNIFIED_SHEET,
  fold,
  normalizePhone,
  normalizeEmail,
  normalizeFrequency,
  mapHeaders,
  getMappedColumns
};

