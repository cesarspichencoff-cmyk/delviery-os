'use strict';

const ALLOWED_DIALOGUE_TOOLS = Object.freeze([
  'get_active_conversation_state',
  'search_tata_knowledge',
  'get_service_playbook',
  'get_verified_public_information',
  'get_allowed_actions',
  'get_pending_questions',
  'resolve_reference_candidates',
  'prepare_handoff'
]);

class DialogueToolRouter {
  constructor(options = {}) { this.handlers = options.handlers || {}; }

  async execute(request = {}) {
    if (!ALLOWED_DIALOGUE_TOOLS.includes(request.tool)) throw Object.assign(new Error('DIALOGUE_TOOL_FORBIDDEN'), { code: 'DIALOGUE_TOOL_FORBIDDEN' });
    const handler = this.handlers[request.tool];
    if (typeof handler !== 'function') throw Object.assign(new Error('DIALOGUE_TOOL_UNAVAILABLE'), { code: 'DIALOGUE_TOOL_UNAVAILABLE' });
    const args = request.arguments && typeof request.arguments === 'object' && !Array.isArray(request.arguments) ? request.arguments : {};
    return handler(Object.freeze({ ...args }));
  }
}

module.exports = { ALLOWED_DIALOGUE_TOOLS, DialogueToolRouter };
