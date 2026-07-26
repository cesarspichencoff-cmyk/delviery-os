'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { canonicalJsonHash, canonicalText } = require('../deterministic');
const { nativeError } = require('../errors');

const OPERATIONAL_HASHES = Object.freeze({
  CAPABILITY_MATRIX_V1: '2443c33f8c03e1d2fcc6d12f59db8822e7040889bd62c6edca4effbb126b7019',
  CONVERSATION_POLICY_V1: '6e5fc9fa907c60d9187b3c839c76a021e8076b8b0f1316771723e42dda5a4917',
  ESCALATION_POLICY_V1: '81b87ab585b3c19c970267bed0314d071ca5ce6fd5f22759a235a0f64133e8fa',
  INTENT_ENTITY_CATALOG_V1: 'da530d57309d2d1984e1a4bce5831c7982b6427bb50bc8dd005b58422d3cb9c6',
  REAL_DATA_PLACEHOLDERS_V1: '57c68cdc81f707e8d2ad7dd5bbc35745eb20343138f8146b1435b83b9080e42a',
  TATA_OPERATIONAL_PUBLIC_INFO_V1: 'c60b482d7325258f8c86009158f2262dab3d6810bc52823d0dd08c9f1d322bcc'
});

const OPERATIONAL_KEYS = Object.freeze(['capabilities', 'policy', 'escalation', 'intents', 'placeholders', 'publicInfo', 'hashes']);

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const nested of Object.values(value)) deepFreeze(nested);
  return value;
}

function readOperationalCatalog(name) {
  if (!Object.hasOwn(OPERATIONAL_HASHES, name)) throw nativeError('OPERATIONAL_CATALOG_NAME_INVALID');
  const file = path.join(__dirname, `${name}.json`);
  const raw = fs.readFileSync(file);
  let parsed;
  try {
    parsed = JSON.parse(canonicalText(raw, { final_newline: 'forbidden' }));
  } catch {
    throw nativeError('CANONICAL_CATALOG_INVALID', { catalog: name });
  }
  if (canonicalJsonHash(raw) !== OPERATIONAL_HASHES[name]) {
    throw nativeError('CANONICAL_CATALOG_HASH_MISMATCH', { catalog: name });
  }
  return deepFreeze(parsed);
}

function validateOperationalCatalogs(catalogs) {
  if (!catalogs || typeof catalogs !== 'object' || Array.isArray(catalogs)) {
    throw nativeError('OPERATIONAL_CATALOG_REQUIRED');
  }
  if (Object.hasOwn(catalogs, 'scenarios')) throw nativeError('OPERATIONAL_CATALOG_ORACLE_PROHIBITED');
  const unknown = Object.keys(catalogs).filter((key) => !OPERATIONAL_KEYS.includes(key));
  if (unknown.length) throw nativeError('OPERATIONAL_CATALOG_INVALID', { unknown_count: unknown.length });
  if (
    !Array.isArray(catalogs.capabilities?.capabilities)
    || !Array.isArray(catalogs.intents?.intents)
    || !Array.isArray(catalogs.placeholders?.placeholders)
    || catalogs.publicInfo?.classification !== 'CONFIRMADO_POR_CESAR'
    || catalogs.publicInfo?.unit?.unit_id !== 'unidade-tata-53069'
    || catalogs.publicInfo?.real_drivers_enabled !== false
    || !catalogs.policy
    || !catalogs.escalation
    || catalogs.capabilities.capabilities.length !== 39
    || catalogs.intents.intents.length !== 52
    || catalogs.placeholders.placeholders.length !== 47
  ) {
    throw nativeError('OPERATIONAL_CATALOG_INVALID');
  }
  return catalogs;
}

let runtimeCache = null;
function loadRuntimeCatalogs() {
  if (runtimeCache) return runtimeCache;
  runtimeCache = deepFreeze(validateOperationalCatalogs({
    capabilities: readOperationalCatalog('CAPABILITY_MATRIX_V1'),
    policy: readOperationalCatalog('CONVERSATION_POLICY_V1'),
    escalation: readOperationalCatalog('ESCALATION_POLICY_V1'),
    intents: readOperationalCatalog('INTENT_ENTITY_CATALOG_V1'),
    placeholders: readOperationalCatalog('REAL_DATA_PLACEHOLDERS_V1'),
    publicInfo: readOperationalCatalog('TATA_OPERATIONAL_PUBLIC_INFO_V1'),
    hashes: OPERATIONAL_HASHES
  }));
  return runtimeCache;
}

module.exports = {
  OPERATIONAL_HASHES,
  OPERATIONAL_KEYS,
  deepFreeze,
  readOperationalCatalog,
  validateOperationalCatalogs,
  loadRuntimeCatalogs
};
