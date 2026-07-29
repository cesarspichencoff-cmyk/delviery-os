'use strict';

const { defineModelAdapter, samplingFor } = require('./adapter-contract');
const adapters = Object.freeze({
  default: require('./default'),
  qwen3: require('./qwen3'),
  qwen35: require('./qwen35'),
  gemma4: require('./gemma4')
});

function getModelAdapter(id = 'default') {
  const adapter = adapters[id];
  if (!adapter) throw Object.assign(new Error('MODEL_ADAPTER_UNKNOWN'), { code: 'MODEL_ADAPTER_UNKNOWN' });
  return adapter;
}

module.exports = { adapters, defineModelAdapter, samplingFor, getModelAdapter };
