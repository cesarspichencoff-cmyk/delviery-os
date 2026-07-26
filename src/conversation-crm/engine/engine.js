'use strict';

const { loadFlowBundle } = require('../flows');
const { CrmStore } = require('../crm');
const { extractPartySize, detectMissingItem, classifyIntent, classifyOrigin, classifySeverity } = require('./classifier');
const { detectSensitiveInput } = require('./privacy');

const CONTEXT_FIELDS = Object.freeze([
  'intent', 'origin', 'severity', 'delivery_topic', 'order_reference', 'requested_change',
  'occurrence_type', 'occurrence_detail_code', 'reservation_date', 'reservation_time', 'party_size',
  'customer_name', 'arrival_estimate', 'missing_item', 'information_topic', 'prior_promise_reference',
  'history_reference', 'human_authorization'
]);
const INTERNAL_PLACEHOLDERS = Object.freeze({
  order_reference: new Set(['SIM-ORDER-MANUAL']),
  occurrence_detail_code: new Set(['synthetic_detail'])
});
const FIELD_LABELS = Object.freeze({
  party_size: 'quantidade de pessoas',
  customer_name: 'nome',
  arrival_estimate: 'previsão aproximada de chegada',
  order_reference: 'numero_pedido',
  origin: 'canal_pedido',
  missing_item: 'item identificado'
});
const LARGE_GROUP_THRESHOLD = 8;

function engineError(code) {
  const error = new Error(code.toLowerCase());
  error.code = code;
  return error;
}

function knownFields(context) {
  return CONTEXT_FIELDS.filter((field) => {
    const value = context[field];
    if (value === null || value === undefined || value === '') return false;
    return !INTERNAL_PLACEHOLDERS[field]?.has(value);
  });
}

function fieldLabels(fields) {
  return fields.map((field) => FIELD_LABELS[field] || field);
}

function knownFieldLabels(fields, context) {
  return fields.map((field) => {
    if (field === 'missing_item' && context.missing_item) return `item identificado: ${context.missing_item}`;
    return FIELD_LABELS[field] || field;
  });
}

function joinNaturalLanguage(values) {
  if (values.length < 2) return values[0] || '';
  if (values.length === 2) return `${values[0]} e ${values[1]}`;
  return `${values.slice(0, -1).join(', ')} e ${values[values.length - 1]}`;
}

function renderBlockMessage(block, context, missing) {
  const replacements = {
    party_size: String(context.party_size ?? ''),
    missing_item: String(context.missing_item ?? 'item'),
    missing_item_reference: String(context.missing_item_reference ?? 'do item')
  };
  const interpolate = (template) => Object.entries(replacements).reduce(
    (result, [key, value]) => result.replace(new RegExp(`{{${key}}}`, 'g'), value),
    template || ''
  );
  const base = interpolate(block.message);
  const followUp = interpolate(block.follow_up_message);
  if (!missing.length || !block.missing_data_prompt) return [base, followUp].filter(Boolean).join(' ');
  const promptLabels = missing.map((field) => block.missing_data_labels?.[field] || FIELD_LABELS[field] || field);
  const prompt = block.missing_data_prompt.replace('{{missing_fields}}', joinNaturalLanguage(promptLabels));
  return [base, prompt, followUp].filter(Boolean).join(' ');
}

function selectBlockVariant(block, context) {
  const variant = context.flow_variant && block.variants?.[context.flow_variant];
  return variant ? Object.freeze({ ...block, ...variant, variants: block.variants }) : block;
}

function chooseBlock(intent, origin, severity, context) {
  if (intent === 'opt_out') return 'F02';
  if (intent === 'ambiguous') return 'B01';
  if (intent === 'reservation') {
    if (context.availability === 'unavailable') return 'R02';
    if (context.waitlist_confirmed === true) return 'R04';
    if (context.waitlist === true) return 'R03';
    if (Number(context.party_size) > LARGE_GROUP_THRESHOLD) return 'R05';
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
    const extractedPartySize = context.party_size === undefined ? extractPartySize(message) : null;
    if (extractedPartySize && extractedPartySize.value !== null) context.party_size = extractedPartySize.value;
    const missingItem = detectMissingItem(message);
    if (missingItem.matched || context.occurrence_detail_code === 'missing_item') {
      context.item_issue_type = 'missing_item';
      context.flow_variant = 'missing_item';
      context.missing_item_reference = missingItem.item_reference;
      if (missingItem.item) context.missing_item = missingItem.item;
    }
    const intent = classifyIntent(message, context);
    const origin = classifyOrigin(message, context);
    const severity = classifySeverity(message, intent.value, context);
    const blockId = chooseBlock(intent.value, origin.value, severity.value, context);
    const baseBlock = this.bundle.byId.get(blockId);
    if (!baseBlock) throw engineError('FLOW_BLOCK_NOT_FOUND');
    const block = selectBlockVariant(baseBlock, context);
    const effectiveOrigin = origin.value === 'unknown' && block.origin !== 'unknown' ? block.origin : origin.value;
    const evidenceCodes = [
      ...(extractedPartySize?.evidence_codes || []),
      ...missingItem.evidence_codes,
      ...intent.evidence_codes,
      ...origin.evidence_codes,
      ...severity.evidence_codes
    ];
    if (effectiveOrigin !== origin.value) evidenceCodes.push('origin_from_block_contract');

    const known = knownFields(context);
    const missing = block.required_data.filter((field) => !known.includes(field));
    const humanRequired = intent.value !== 'opt_out' && (block.escalation_level !== 'none' || ['high', 'critical'].includes(severity.value));
    const automaticTags = block.canonical_tags_only === true
      ? (privacy.detected ? ['privacy_input_detected'] : [])
      : [
          ...(humanRequired ? ['human_required'] : []),
          ...(privacy.detected ? ['privacy_input_detected'] : []),
          ...(missing.length ? ['missing_required_data'] : [])
        ];
    const tags = [...new Set([...block.tags, ...automaticTags])];
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

    const primaryMessage = intent.value === 'ambiguous'
      ? this.bundle.policies.messages.ambiguous
      : renderBlockMessage(block, context, missing);
    const appendPolicyMessages = block.append_policy_messages !== false;
    const messages = [
      primaryMessage,
      appendPolicyMessages && missing.length ? this.bundle.policies.messages.missing_data : null,
      appendPolicyMessages && intent.value === 'opt_out' ? this.bundle.policies.messages.opt_out : null,
      appendPolicyMessages && humanRequired ? this.bundle.policies.messages.human_required : null,
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
      block_code: block.code || blockId,
      confidence: Math.min(intent.confidence, origin.confidence === 0.2 ? intent.confidence : origin.confidence, severity.confidence === 0.2 ? intent.confidence : severity.confidence),
      known_fields: known,
      known_field_labels: knownFieldLabels(known, context),
      item_identified: context.item_issue_type === 'missing_item' ? (context.missing_item || null) : null,
      missing_fields: missing,
      missing_field_labels: fieldLabels(missing),
      tags,
      suggested_response: messages.join(' '),
      human_required: humanRequired,
      escalation_level: block.escalation_level,
      escalation_code: block.escalation_code || block.next_block,
      intent_label: block.intent_label || intent.value,
      origin_label: block.origin_label || effectiveOrigin,
      severity_label: block.severity_label || severity.value,
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

module.exports = {
  CONTEXT_FIELDS,
  INTERNAL_PLACEHOLDERS,
  FIELD_LABELS,
  LARGE_GROUP_THRESHOLD,
  knownFields,
  knownFieldLabels,
  chooseBlock,
  renderBlockMessage,
  selectBlockVariant,
  ConversationEngine
};
