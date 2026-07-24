'use strict';

const { loadFlowBundle } = require('../flows');
const { CrmStore } = require('../crm');
const { classifyIntent, classifyOrigin, classifySeverity } = require('./classifier');
const { detectSensitiveInput } = require('./privacy');

const CONTEXT_FIELDS = Object.freeze([
  'intent', 'origin', 'severity', 'delivery_topic', 'order_reference', 'requested_change',
  'occurrence_type', 'occurrence_detail_code', 'reservation_date', 'reservation_time', 'party_size',
  'information_topic', 'prior_promise_reference', 'history_reference', 'human_authorization'
]);

function engineError(code) {
  const error = new Error(code.toLowerCase());
  error.code = code;
  return error;
}

function knownFields(context) {
  return CONTEXT_FIELDS.filter((field) => context[field] !== null && context[field] !== undefined && context[field] !== '');
}

function chooseBlock(intent, origin, severity, context) {
  if (intent === 'opt_out') return 'F02';
  if (intent === 'ambiguous') return 'B01';
  if (intent === 'reservation') {
    if (context.availability === 'unavailable') return 'R02';
    if (context.waitlist_confirmed === true) return 'R04';
    if (context.waitlist === true) return 'R03';
    if (Number(context.party_size) > Number(context.large_group_threshold || 8)) return 'R05';
    return 'R01';
  }
  if (intent === 'menu_information') return 'I01';
  if (intent === 'general_information') return 'I02';
  if (intent === 'tracking') return origin === 'marketplace' ? 'D04' : 'D03';
  if (intent === 'order_change') return 'D05';
  if (intent === 'wrong_or_missing_item') return 'O02';
  if (intent === 'serious_quality') return 'O03';
  if (intent === 'charge_occurrence') return 'O04';
  if (intent === 'delay') return 'O05';
  if (intent === 'valet_occurrence') return 'O06';
  if (intent === 'alert_only') return 'O07';
  if (intent === 'prior_promise') return 'O08';
  if (intent === 'human_request') return severity === 'high' || severity === 'critical' ? 'H03' : 'H01';
  if (intent === 'delivery') return 'D01';
  if (origin === 'marketplace') return 'O01';
  return 'O00';
}

function publicRecord(entity) {
  if (!entity) return null;
  return {
    entity_type: entity.entity_type,
    occurrence_id: entity.occurrence_id,
    severity: entity.severity,
    origin: entity.origin,
    intent: entity.intent,
    status: entity.status,
    summary_code: entity.summary_code,
    evidence_codes: entity.evidence_codes,
    created_at: entity.created_at
  };
}

class ConversationEngine {
  constructor(options = {}) {
    this.bundle = options.bundle || loadFlowBundle(options.flowOptions);
    this.crm = options.crm || new CrmStore({ clock: options.clock, id: options.id });
    this.tenantId = options.tenantId || 'tenant_synthetic';
  }

  ensureProfile(profileId) {
    if (profileId) {
      this.crm.assertProfile(this.tenantId, profileId);
      return profileId;
    }
    return this.crm.createProfile({ tenant_id: this.tenantId, provenance: 'synthetic' }).profile_id;
  }

  triage(input = {}) {
    const message = typeof input.message === 'string' ? input.message : '';
    const context = input.context && typeof input.context === 'object' ? { ...input.context } : {};
    if (context.data_mode && context.data_mode !== 'synthetic') throw engineError('REAL_DATA_NOT_ALLOWED');
    const privacy = detectSensitiveInput(message);
    const intent = classifyIntent(message, context);
    const origin = classifyOrigin(message, context);
    const severity = classifySeverity(message, intent.value, context);
    const blockId = chooseBlock(intent.value, origin.value, severity.value, context);
    const block = this.bundle.byId.get(blockId);
    if (!block) throw engineError('FLOW_BLOCK_NOT_FOUND');
    const effectiveOrigin = origin.value === 'unknown' && block.origin !== 'unknown' ? block.origin : origin.value;
    const evidenceCodes = [...intent.evidence_codes, ...origin.evidence_codes, ...severity.evidence_codes];
    if (effectiveOrigin !== origin.value) evidenceCodes.push('origin_from_block_contract');

    const known = knownFields(context);
    const missing = block.required_data.filter((field) => !known.includes(field));
    const humanRequired = intent.value !== 'opt_out' && (block.escalation_level !== 'none' || ['high', 'critical'].includes(severity.value));
    const tags = [...new Set([
      ...block.tags,
      ...(humanRequired ? ['human_required'] : []),
      ...(privacy.detected ? ['privacy_input_detected'] : []),
      ...(missing.length ? ['missing_required_data'] : [])
    ])];
    const profileId = this.ensureProfile(input.profile_id);

    let consent = null;
    let occurrence = null;
    if (intent.value === 'opt_out') {
      consent = this.crm.recordConsent({
        tenant_id: this.tenantId, profile_id: profileId, channel: 'all_marketing',
        status: 'opt_out', source: 'conversation_explicit_request'
      });
    } else if (block.internal_record_required) {
      occurrence = this.crm.addOccurrence({
        tenant_id: this.tenantId,
        profile_id: profileId,
        intent: intent.value,
        origin: effectiveOrigin,
        severity: severity.value,
        status: humanRequired ? 'waiting_human' : 'open',
        summary_code: `triage_${blockId.toLowerCase()}`,
        evidence_codes: evidenceCodes
      });
    }

    const messages = [
      intent.value === 'ambiguous' ? this.bundle.policies.messages.ambiguous : block.message,
      missing.length ? this.bundle.policies.messages.missing_data : null,
      intent.value === 'opt_out' ? this.bundle.policies.messages.opt_out : null,
      humanRequired ? this.bundle.policies.messages.human_required : null,
      privacy.detected ? this.bundle.policies.messages.privacy_detected : null
    ].filter(Boolean);

    return Object.freeze({
      schema_version: 'conversation-triage-result-v0',
      data_mode: 'synthetic',
      profile_id: profileId,
      intent: intent.value,
      origin: effectiveOrigin,
      severity: severity.value,
      block_id: blockId,
      confidence: Math.min(intent.confidence, origin.confidence === 0.2 ? intent.confidence : origin.confidence, severity.confidence === 0.2 ? intent.confidence : severity.confidence),
      known_fields: known,
      missing_fields: missing,
      tags,
      suggested_response: messages.join(' '),
      human_required: humanRequired,
      escalation_level: block.escalation_level,
      allowed_actions: [...block.allowed_actions],
      forbidden_actions: [...block.forbidden_actions],
      privacy,
      crm_record: publicRecord(occurrence),
      consent_record: consent ? { entity_type: consent.entity_type, status: consent.status, channel: consent.channel } : null,
      audit: {
        raw_message_persisted: false,
        evidence_codes: evidenceCodes,
        automatic_financial_decision: false,
        external_system_accessed: false
      }
    });
  }
}

module.exports = { CONTEXT_FIELDS, chooseBlock, ConversationEngine };
