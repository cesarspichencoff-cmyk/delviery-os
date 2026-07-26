'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { canonicalJsonHash, canonicalText } = require('../deterministic');
const { nativeError } = require('../errors');

const HASHES = Object.freeze({
  CAPABILITY_MATRIX_V1: '2443c33f8c03e1d2fcc6d12f59db8822e7040889bd62c6edca4effbb126b7019',
  CONVERSATION_POLICY_V1: '6e5fc9fa907c60d9187b3c839c76a021e8076b8b0f1316771723e42dda5a4917',
  ESCALATION_POLICY_V1: '81b87ab585b3c19c970267bed0314d071ca5ce6fd5f22759a235a0f64133e8fa',
  INTENT_ENTITY_CATALOG_V1: 'a9457680ecd1067e41951976d4e2b8b4333fc2badabf1d1561d789636127ef9e',
  REAL_DATA_PLACEHOLDERS_V1: '882300e21d43e48ef06607295d5ca4422804f690b7f69f075f516a8a6d449378',
  SCENARIO_CATALOG_V1: '3412ca6391b5ec8482bf9cc7aca1f313011892cb173d9538a3a022026fbc9887'
});

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const nested of Object.values(value)) deepFreeze(nested);
  return value;
}

function readCatalog(name) {
  const file = path.join(__dirname, `${name}.json`);
  const raw = fs.readFileSync(file);
  let parsed;
  try { parsed = JSON.parse(canonicalText(raw, { final_newline: 'forbidden' })); } catch { throw nativeError('CANONICAL_CATALOG_INVALID', { catalog: name }); }
  if (canonicalJsonHash(raw) !== HASHES[name]) throw nativeError('CANONICAL_CATALOG_HASH_MISMATCH', { catalog: name });
  return deepFreeze(parsed);
}

let cache = null;
let runtimeCache = null;
function loadRuntimeCatalogs() {
  if (runtimeCache) return runtimeCache;
  const capabilities = readCatalog('CAPABILITY_MATRIX_V1');
  const policy = readCatalog('CONVERSATION_POLICY_V1');
  const escalation = readCatalog('ESCALATION_POLICY_V1');
  const intents = readCatalog('INTENT_ENTITY_CATALOG_V1');
  const placeholders = readCatalog('REAL_DATA_PLACEHOLDERS_V1');
  if (capabilities.capabilities.length !== 39 || intents.intents.length !== 51 || placeholders.placeholders.length !== 47) {
    throw nativeError('CANONICAL_CATALOG_COUNT_MISMATCH');
  }
  runtimeCache = deepFreeze({ capabilities, policy, escalation, intents, placeholders, hashes: HASHES });
  return runtimeCache;
}

function loadCanonicalCatalogs() {
  if (cache) return cache;
  const capabilities = readCatalog('CAPABILITY_MATRIX_V1');
  const policy = readCatalog('CONVERSATION_POLICY_V1');
  const escalation = readCatalog('ESCALATION_POLICY_V1');
  const intents = readCatalog('INTENT_ENTITY_CATALOG_V1');
  const placeholders = readCatalog('REAL_DATA_PLACEHOLDERS_V1');
  const scenarios = readCatalog('SCENARIO_CATALOG_V1');
  if (capabilities.capabilities.length !== 39 || intents.intents.length !== 51 || scenarios.scenarios.length !== 200 || placeholders.placeholders.length !== 47) {
    throw nativeError('CANONICAL_CATALOG_COUNT_MISMATCH');
  }
  if (scenarios.scenarios.some((scenario) => scenario.synthetic !== true)) throw nativeError('CANONICAL_SCENARIO_NOT_SYNTHETIC');
  cache = deepFreeze({ capabilities, policy, escalation, intents, placeholders, scenarios, hashes: HASHES });
  return cache;
}

module.exports = { HASHES, deepFreeze, readCatalog, loadRuntimeCatalogs, loadCanonicalCatalogs };
