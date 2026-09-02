'use strict';

const { defineModelAdapter } = require('../adapter-contract');

module.exports = defineModelAdapter({
  id: 'default',
  version: '1.0.0',
  family: 'generic-gguf',
  chat_template: 'gguf_embedded_jinja',
  system_instruction_format: 'native_system_role',
  non_thinking: { server_reasoning: 'off', chat_template_kwargs: {} },
  stop: [],
  sampling: { default: {}, text: {}, deliveryos_conversation_director_v1: {}, deliveryos_response_writer_v1: {} },
  limits: { default_context_size: 4096, minimum_context_size: 1024, maximum_context_size: 16384, structured_max_tokens: 700, text_max_tokens: 256 },
  grammar_mode: 'fixed_gbnf'
});
