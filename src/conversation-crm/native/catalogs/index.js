'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { sha256 } = require('../deterministic');
const { nativeError } = require('../errors');

const HASHES = Object.freeze({
  CAPABILITY_MATRIX_V1: '78b2e2fd645f312fe90aed47fee8d4ddd0956748616d72265ac728c98817260b',
  CONVERSATION_POLICY_V1: '6d6d5b2159f4514530c5f3ea3929e4250bb73a641af47023839db36b2ce2a931',
  ESCALATION_POLICY_V1: 'cec42c3dde7a4470ae3e16cd0088991858e795a483d4f3eaaa37d7d640fbe656',
  INTENT_ENTITY_CATALOG_V1: '36459655e52953190825253e2a8cae03385cca663d5a26c4748c5a60eb84edda',
  REAL_DATA_PLACEHOLDERS_V1: '4e534b5a7d4fd63ac83fce3662452f86d8807ee755431764a832729dda823317',
  SCENARIO_CATALOG_V1: '8f57796f94b030940ee311b62867cece5d0a1afa31c65f23968c939b9fdebd0e'
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
  if (sha256(raw) !== HASHES[name]) throw nativeError('CANONICAL_CATALOG_HASH_MISMATCH', { catalog: name });
  try { return deepFreeze(JSON.parse(raw.toString('utf8'))); } catch { throw nativeError('CANONICAL_CATALOG_INVALID', { catalog: name }); }
}

let cache = null;
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

module.exports = { HASHES, deepFreeze, readCatalog, loadCanonicalCatalogs };

