'use strict';

const { DIRECTOR_JSON_SCHEMA, validateDirectorSemantics } = require('./director-contract');
const { deterministicDirector } = require('./deterministic-director');

function buildDirectorPrompt(input = {}) {
  return {
    messages: [
      {
        role: 'system',
        content: [
          'Você é o Conversation Director do DeliveryOS.',
          'Classifique o movimento da conversa sem escrever a resposta ao cliente.',
          'Use somente o estado, os fatos e os playbooks fornecidos.',
          'Não invente fatos, ações ou referências. Não exponha raciocínio.',
          'Retorne somente JSON no schema solicitado.'
        ].join(' ')
      },
      { role: 'user', content: JSON.stringify(input) }
    ],
    json_schema: DIRECTOR_JSON_SCHEMA,
    temperature: 0.1,
    max_tokens: 700
  };
}

class ConversationDirector {
  constructor(options = {}) {
    this.runtime = options.runtime;
    this.fallback = options.fallback || deterministicDirector;
  }

  async direct(input = {}) {
    try {
      const generated = await this.runtime.generateStructured(buildDirectorPrompt(input));
      const validated = validateDirectorSemantics(generated, input);
      if (!validated.accepted) return { source: 'deterministic_fallback', reason: validated.reason, directive: this.fallback(input) };
      return { source: 'local_model', reason: null, directive: validated.output };
    } catch (error) {
      return { source: 'deterministic_fallback', reason: error.code || 'DIRECTOR_GENERATION_FAILED', directive: this.fallback(input) };
    }
  }
}

module.exports = { buildDirectorPrompt, ConversationDirector };
