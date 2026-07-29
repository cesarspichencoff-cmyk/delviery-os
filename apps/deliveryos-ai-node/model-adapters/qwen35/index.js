'use strict';

const { defineModelAdapter } = require('../adapter-contract');

module.exports = defineModelAdapter({
  id: 'qwen35',
  version: '1.0.0',
  family: 'qwen3.5',
  chat_template: 'gguf_embedded_jinja',
  system_instruction_format: 'native_system_role',
  non_thinking: { server_reasoning: 'off', chat_template_kwargs: { enable_thinking: false } },
  stop: ['<|im_end|>'],
  sampling: {
    default: { top_p: 0.8, top_k: 20, min_p: 0, presence_penalty: 1.5 },
    text: { temperature: 0.7 },
    deliveryos_conversation_director_v1: { temperature: 0.2 },
    deliveryos_response_writer_v1: { temperature: 0.7 }
  },
  limits: { default_context_size: 8192, minimum_context_size: 8192, maximum_context_size: 16384, structured_max_tokens: 700, text_max_tokens: 256 },
  grammar_mode: 'fixed_gbnf'
});
