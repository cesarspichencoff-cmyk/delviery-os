'use strict';

const fs = require('node:fs');
const path = require('node:path');

const REQUIRED_BLOCK_FIELDS = Object.freeze([
  'id', 'intent', 'origin', 'severity', 'message', 'required_data', 'tags', 'next_block',
  'conditions', 'allowed_actions', 'forbidden_actions', 'escalation_level', 'internal_record_required'
]);

function flowError(code) {
  const error = new Error(code.toLowerCase());
  error.code = code;
  return error;
}

function validateFlowConfig(config) {
  if (!config || config.schema_version !== 'conversation-flows-v0' || !Array.isArray(config.blocks)) {
    throw flowError('FLOW_CONFIG_INVALIDA');
  }
  const ids = new Set();
  for (const block of config.blocks) {
    for (const field of REQUIRED_BLOCK_FIELDS) {
      if (!(field in block)) throw flowError('FLOW_BLOCK_INCOMPLETO');
    }
    if (ids.has(block.id)) throw flowError('FLOW_BLOCK_DUPLICADO');
    ids.add(block.id);
    for (const listField of ['required_data', 'tags', 'conditions', 'allowed_actions', 'forbidden_actions']) {
      if (!Array.isArray(block[listField])) throw flowError('FLOW_BLOCK_INCOMPLETO');
    }
  }
  return { block_count: config.blocks.length, block_ids: [...ids] };
}

function validateRulesConfig(config) {
  if (!config || config.schema_version !== 'conversation-rules-v0' || !Array.isArray(config.rules)) {
    throw flowError('RULE_CONFIG_INVALIDA');
  }
  if (config.rules.length !== 12) throw flowError('RULE_COUNT_INVALIDA');
  const ids = new Set(config.rules.map((rule) => rule.id));
  if (ids.size !== config.rules.length) throw flowError('RULE_ID_DUPLICADA');
  return { rule_count: config.rules.length, rule_ids: [...ids] };
}

function readJson(filePath, invalidCode) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    throw flowError(invalidCode);
  }
}

function loadFlowBundle(options = {}) {
  const root = options.root || __dirname;
  const flowsPath = options.flowsPath || path.join(root, 'flows.v0.json');
  const rulesPath = options.rulesPath || path.join(root, 'rules.v0.json');
  const flows = readJson(flowsPath, 'FLOW_CONFIG_INVALIDA');
  const rules = readJson(rulesPath, 'RULE_CONFIG_INVALIDA');
  const flowValidation = validateFlowConfig(flows);
  const ruleValidation = validateRulesConfig(rules);
  return Object.freeze({
    schema_version: 'conversation-bundle-v0',
    flows,
    rules,
    byId: new Map(flows.blocks.map((block) => [block.id, Object.freeze(block)])),
    validation: { ...flowValidation, ...ruleValidation }
  });
}

module.exports = {
  REQUIRED_BLOCK_FIELDS,
  validateFlowConfig,
  validateRulesConfig,
  loadFlowBundle
};

