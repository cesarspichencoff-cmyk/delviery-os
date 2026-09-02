'use strict';

const { sha256 } = require('../homologation/data');
const { recommend } = require('../../../src/conversation-crm/menu-intelligence/recommendation');
const { LocalCognitivePlanner, validatePlannedResponse } = require('./conversation-plan');

function compactCandidate(item = {}) {
  return Object.freeze({
    item_id: item.item_id,
    name: item.name,
    category: item.category,
    channel: item.channel,
    source_records: item.source_records || []
  });
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function authorityBoundTurn(execution) {
  const intent = String(execution.result.classification?.intent || '');
  const gravity = String(execution.result.approved_response_envelope?.gravity || 'informational');
  const mode = String(execution.result.execution_diagnostics?.context_reason || '');
  return ['sensitive', 'critical'].includes(gravity)
    || /(?:allerg|food_safety|respiratory|health|occurrence|missing_item|cancel)/iu.test(intent)
    || /(?:allerg|safety|occurrence|medical)/iu.test(mode);
}

class CognitiveAuthorityVariantService {
  constructor(options = {}) {
    this.homologation = options.homologation;
    this.customerMenu = options.customerMenu;
    this.planner = options.planner || new LocalCognitivePlanner({ localWriter: options.localWriter, seed: options.seed });
    this.history = [];
    this.seenCandidateIds = new Set();
  }

  candidate(itemId) {
    try { return this.customerMenu.tools.get_menu_item_details({ item_id: itemId }).data; } catch { return null; }
  }

  additionalCandidates(diagnostic) {
    const channel = diagnostic.channel;
    const unitId = diagnostic.unit_id || this.customerMenu.defaultUnitForChannel(channel);
    const category = diagnostic.turn_analysis?.requested_category || null;
    if (!channel || channel === 'unknown' || !unitId || !category) return [];
    const preferences = diagnostic.preferences || {};
    try {
      const catalog = this.customerMenu.menuCatalog;
      const unseenCatalog = {
        snapshot: () => catalog.snapshot(),
        search: (query) => catalog.search(query).filter((item) => !this.seenCandidateIds.has(item.item_id))
      };
      const result = recommend(unseenCatalog, {
        channel,
        unit_id: unitId,
        requested_category: category,
        fried: preferences.fried ?? null,
        cream_cheese: preferences.cream_cheese ?? null,
        preferred_ingredients: preferences.preferred_ingredients || [],
        excluded_ingredients: preferences.excluded_ingredients || [],
        allergies: [],
        dietary_restrictions: []
      });
      return (result.candidates || []).map(compactCandidate);
    } catch {
      return [];
    }
  }

  plannerInput(message, execution, currentCandidates, additionalCandidates) {
    const diagnostic = execution.publicResult.turn.diagnostic;
    const envelope = execution.result.approved_response_envelope;
    return {
      schema_version: 'deliveryos-cognitive-authority-input-v1',
      current_message: message,
      recent_history: this.history.slice(-8).map((turn) => ({
        user: turn.user,
        assistant: turn.assistant
      })),
      deterministic_state_summary: {
        current_goal: diagnostic.turn_analysis?.active_goal || diagnostic.journey || null,
        current_channel: diagnostic.channel,
        requested_category: diagnostic.turn_analysis?.requested_category || null,
        current_transition: diagnostic.semantic_transition,
        unresolved_reference: diagnostic.turn_analysis?.unresolved_reference || null,
        previous_response: this.history.at(-1)?.assistant || null
      },
      authorized_context: {
        deterministic_response: execution.publicResult.turn.response,
        current_candidates: currentCandidates,
        additional_candidates: additionalCandidates,
        selection_criteria: unique([
          diagnostic.channel && diagnostic.channel !== 'unknown' ? `channel:${diagnostic.channel}` : null,
          diagnostic.turn_analysis?.requested_category ? `requested_category:${diagnostic.turn_analysis.requested_category}` : null,
          'human_review_status',
          'availability_not_unavailable',
          'stable_catalog_order'
        ]),
        authorized_links: [...(envelope.authorized_links || [])],
        authorized_numbers: [...(envelope.authorized_numbers || [])],
        known_unknowns: execution.result.approved_response_envelope?.unknowns || [],
        allowed_tools: [
          'get_recommendation_candidates', 'get_menu_item_details',
          'get_item_allergens', 'get_channel_menu'
        ],
        safety_policy: 'deterministic_hard_gates_remain_authoritative'
      }
    };
  }

  fallback(execution, reason, plan = null) {
    const output = structuredClone(execution.publicResult);
    output.turn.diagnostic.cognitive_variant = 'B';
    output.turn.diagnostic.cognitive_plan_status = 'deterministic_fallback';
    output.turn.diagnostic.cognitive_plan_reason = reason;
    output.turn.diagnostic.cognitive_plan = plan;
    output.turn.diagnostic.response_path = 'cognitive_authority_safe_fallback';
    return output;
  }

  async send(input = {}) {
    const request = typeof input === 'string' ? { message: input } : input;
    const message = String(request.message || '').trim();
    const execution = this.homologation.chatExecution(request);
    const diagnostic = execution.publicResult.turn.diagnostic;
    const currentCandidates = (diagnostic.candidates_found || []).map((id) => this.candidate(id)).filter(Boolean).map(compactCandidate);
    const additionalCandidates = this.additionalCandidates(diagnostic);
    if (authorityBoundTurn(execution)) {
      const output = this.fallback(execution, 'DETERMINISTIC_AUTHORITY_BOUNDARY');
      this.history.push({ user: message, assistant: output.turn.response, candidates: currentCandidates.map((item) => item.item_id) });
      currentCandidates.forEach((item) => this.seenCandidateIds.add(item.item_id));
      return output;
    }
    const planned = await this.planner.plan(this.plannerInput(message, execution, currentCandidates, additionalCandidates));
    if (!planned.accepted) {
      const output = this.fallback(execution, planned.reason || 'COGNITIVE_PLAN_REJECTED');
      this.history.push({ user: message, assistant: output.turn.response, candidates: currentCandidates.map((item) => item.item_id) });
      currentCandidates.forEach((item) => this.seenCandidateIds.add(item.item_id));
      return output;
    }
    const envelope = execution.result.approved_response_envelope;
    const catalogNames = this.customerMenu.menuCatalog.snapshot().items.map((item) => item.name);
    const authorizedNames = unique([...currentCandidates, ...additionalCandidates].map((item) => item.name));
    const validation = validatePlannedResponse(planned.plan, {
      authorized_links: [...(envelope.authorized_links || [])],
      authorized_numbers: [...(envelope.authorized_numbers || [])],
      authorized_item_names: authorizedNames,
      additional_item_names: additionalCandidates.map((item) => item.name),
      catalog_item_names: catalogNames,
      previous_response: this.history.at(-1)?.assistant || null
    });
    if (!validation.accepted) {
      const output = this.fallback(execution, validation.reason, planned.plan);
      this.history.push({ user: message, assistant: output.turn.response, candidates: currentCandidates.map((item) => item.item_id) });
      currentCandidates.forEach((item) => this.seenCandidateIds.add(item.item_id));
      return output;
    }
    const output = structuredClone(execution.publicResult);
    output.turn.response = validation.response;
    output.turn.response_hash = sha256(validation.response);
    output.turn.diagnostic.cognitive_variant = 'B';
    output.turn.diagnostic.cognitive_plan_status = 'accepted';
    output.turn.diagnostic.cognitive_plan_reason = null;
    output.turn.diagnostic.cognitive_plan = planned.plan;
    output.turn.diagnostic.response_path = 'gemma_cognitive_plan_validated';
    output.turn.diagnostic.source_of_final_text = 'gemma_cognitive_planner';
    output.turn.diagnostic.fallback_used = false;
    const usedCandidateIds = [...currentCandidates, ...additionalCandidates]
      .filter((item) => validation.response.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
        .includes(item.name.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()))
      .map((item) => item.item_id);
    unique([...currentCandidates.map((item) => item.item_id), ...usedCandidateIds]).forEach((id) => this.seenCandidateIds.add(id));
    this.history.push({ user: message, assistant: validation.response, candidates: usedCandidateIds });
    return output;
  }

  reset() {
    this.history = [];
    this.seenCandidateIds.clear();
    return this.homologation.resetChat();
  }
}

class CognitiveAuthorityExperimentService {
  constructor(options = {}) {
    this.variantA = options.variantA;
    this.variantB = options.variantB;
    this.assignment = options.assignment || Object.freeze({ left: 'B', right: 'A' });
    this.votes = [];
    this.lastPair = null;
  }

  reset() {
    this.votes = [];
    this.lastPair = null;
    return {
      ok: true,
      left: this.assignment.left === 'A' ? this.variantA.resetChat() : this.variantB.reset(),
      right: this.assignment.right === 'A' ? this.variantA.resetChat() : this.variantB.reset()
    };
  }

  async invoke(variant, input) {
    return variant === 'A' ? this.variantA.chatWithWriter(input) : this.variantB.send(input);
  }

  async pairedTurn(input = {}) {
    const left = await this.invoke(this.assignment.left, input);
    const right = await this.invoke(this.assignment.right, input);
    this.lastPair = { left, right };
    return {
      ok: true,
      blind: true,
      turn: { input: String(input.message || ''), left: left.turn.response, right: right.turn.response }
    };
  }

  async diagnosticB(input = {}) {
    return this.variantB.send(input);
  }

  resetDiagnosticB() {
    return this.variantB.reset();
  }

  vote(input = {}) {
    if (!['left', 'right', 'equivalent', 'both_bad'].includes(input.preference)) {
      throw Object.assign(new Error('COGNITIVE_VOTE_INVALID'), { code: 'COGNITIVE_VOTE_INVALID' });
    }
    const vote = Object.freeze({ preference: input.preference, recorded_at: new Date().toISOString() });
    this.votes.push(vote);
    return { ok: true, vote_count: this.votes.length };
  }

  reveal() {
    if (!this.votes.length) throw Object.assign(new Error('COGNITIVE_VOTE_REQUIRED'), { code: 'COGNITIVE_VOTE_REQUIRED' });
    return { ok: true, assignment: this.assignment };
  }

  diagnostics() {
    if (!this.votes.length || !this.lastPair) throw Object.assign(new Error('COGNITIVE_VOTE_REQUIRED'), { code: 'COGNITIVE_VOTE_REQUIRED' });
    return {
      ok: true,
      assignment: this.assignment,
      left: this.lastPair.left.turn.diagnostic,
      right: this.lastPair.right.turn.diagnostic
    };
  }
}

module.exports = {
  authorityBoundTurn,
  CognitiveAuthorityVariantService,
  CognitiveAuthorityExperimentService
};

