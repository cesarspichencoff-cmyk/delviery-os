'use strict';

class LocalModelProvider {
  constructor(options = {}) {
    this.runtime = options.runtime;
    this.modelVersion = options.model_version;
    this.providerVersion = options.provider_version;
  }

  async generate(job, contract) {
    const base = {
      messages: contract.messages,
      temperature: contract.temperature,
      max_tokens: contract.max_tokens
    };
    const started = Date.now();
    const output = contract.json_schema
      ? await this.runtime.generateStructured({ ...base, json_schema: contract.json_schema })
      : await this.runtime.generateText(base);
    return {
      schema_version: `local-ai-${job.request_type}-result-v1`,
      payload_hash: job.payload_hash,
      model_version: this.modelVersion,
      provider_version: this.providerVersion,
      output,
      timing_metrics: { ...this.runtime.metrics(), provider_total_ms: Date.now() - started }
    };
  }
}

module.exports = { LocalModelProvider };
