'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { canonicalJsonHash, canonicalText } = require('../deterministic');
const { nativeError } = require('../errors');
const { OPERATIONAL_HASHES, deepFreeze, loadRuntimeCatalogs } = require('./operational');

const SCENARIO_HASH = '3412ca6391b5ec8482bf9cc7aca1f313011892cb173d9538a3a022026fbc9887';
const HASHES = Object.freeze({ ...OPERATIONAL_HASHES, SCENARIO_CATALOG_V1: SCENARIO_HASH });

function loadScenarioOracle() {
  const file = path.join(__dirname, 'SCENARIO_CATALOG_V1.json');
  const raw = fs.readFileSync(file);
  let scenarios;
  try {
    scenarios = JSON.parse(canonicalText(raw, { final_newline: 'forbidden' }));
  } catch {
    throw nativeError('CANONICAL_CATALOG_INVALID', { catalog: 'SCENARIO_CATALOG_V1' });
  }
  if (canonicalJsonHash(raw) !== SCENARIO_HASH) {
    throw nativeError('CANONICAL_CATALOG_HASH_MISMATCH', { catalog: 'SCENARIO_CATALOG_V1' });
  }
  if (!Array.isArray(scenarios.scenarios) || scenarios.scenarios.length !== 200) {
    throw nativeError('CANONICAL_CATALOG_COUNT_MISMATCH');
  }
  if (scenarios.scenarios.some((scenario) => scenario.synthetic !== true)) {
    throw nativeError('CANONICAL_SCENARIO_NOT_SYNTHETIC');
  }
  return deepFreeze(scenarios);
}

let cache = null;
function loadCanonicalCatalogs() {
  if (cache) return cache;
  const operational = loadRuntimeCatalogs();
  cache = deepFreeze({
    ...operational,
    scenarios: loadScenarioOracle(),
    hashes: HASHES
  });
  return cache;
}

module.exports = { SCENARIO_HASH, HASHES, loadScenarioOracle, loadCanonicalCatalogs };
