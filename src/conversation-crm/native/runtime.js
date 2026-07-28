'use strict';

const path = require('node:path');
const { DeterministicClock, DeterministicIds, sha256, canonicalJson } = require('./deterministic');
const { loadFeatureFlags, assertFeature } = require('./feature-flags');
const { loadSimulatorConfig } = require('./simulator-config');
const { loadRuntimeCatalogs, deepFreeze } = require('./catalogs/operational');
const { NativeEventStore } = require('./event-store');
const { ConversationGateway } = require('./gateway');
const { ConversationCrmV1 } = require('./crm');
const { ConversationContextStore } = require('./context');
const { HumanQueue } = require('./human-queue');
const { createSimulatedDriverRegistry } = require('./drivers/registry');
const { CapabilityRouter } = require('./router');
const { ActionExecutor } = require('./action-executor');
const { DeliveryOsStateHub } = require('./state-hub');
const { EvidenceStore } = require('./evidence-store');
const { NotificationEngine } = require('./notification');
const { NativeObservability } = require('./observability');
const { DriverHealthMonitor } = require('./health');
const { extractEntities, extractPartyCandidates, normalizeText } = require('./engine');
const { NUMBER_WORDS } = require('../engine/classifier');
const { createRuntimeConversationEngine } = require('./engine-factory');
const { composeHumanizedResponse } = require('./humanized-response');
const { loadPlaceholderRegistry } = require('./placeholders');
const { nativeError } = require('./errors');

const CHECKPOINTS = Object.freeze([
  'message_received',
  'message_persisted',
  'classification_completed',
  'crm_updated',
  'capability_requested',
  'action_started',
  'result_persisted',
  'response_composed',
  'response_registered',
  'checkpoint_advanced'
]);

class SimulatedCrashError extends Error {
  constructor(stage) {
    super('simulated_crash');
    this.code = 'SIMULATED_CRASH';
    this.stage = stage;
  }
}

function capabilityEntity(capabilityId) {
  if (capabilityId.startsWith('order.')) return 'order';
  if (capabilityId.startsWith('reservation.')) return 'reservation';
  if (capabilityId.startsWith('waitlist.')) return 'waitlist';
  if (capabilityId.startsWith('occurrence.') || capabilityId.startsWith('health.')) return 'occurrence';
  if (capabilityId.startsWith('human.')) return 'handoff';
  if (capabilityId.startsWith('notification.')) return 'notification';
  return 'driver';
}

function isCorrection(content) {
  return /\b(corrig|numero correto|na verdade|quis dizer)\b/u.test(normalizeText(content));
}

function isComplement(content) {
  return /\b(tambem|alem disso|outro item|mais um)\b/u.test(normalizeText(content));
}

function resolveShortReply(content, pendingFields = []) {
  const text = normalizeText(content);
  const output = {};
  const partyCandidates = extractPartyCandidates(content);
  if (pendingFields.includes('party_size') && partyCandidates.length === 1) output.party_size = partyCandidates[0];
  if (pendingFields.includes('party_size') && partyCandidates.length === 0) {
    const bare = text.match(/^(\d{1,2}|[a-z]+)[.!?]?$/u)?.[1];
    const value = bare && (/^\d+$/u.test(bare) ? Number(bare) : NUMBER_WORDS[bare]);
    if (Number.isInteger(value) && value > 0) output.party_size = value;
  }
  if (pendingFields.includes('date') && /\bhoje\b/u.test(text)) output.date = 'relative_today';
  if (pendingFields.includes('date') && /\bamanha\b/u.test(text)) output.date = 'relative_tomorrow';
  if (pendingFields.includes('time') && /\b(?:as|a)\s+\d{1,2}(?:h|:\d{2})\b/u.test(text)) output.time = 'time_provided';
  if (pendingFields.includes('order_channel')) {
    if (/\bifood\b/u.test(text)) output.order_channel = 'marketplace';
    else if (/\bdelivery\b/u.test(text)) output.order_channel = 'own_delivery';
    else if (/\bretirada\b/u.test(text)) output.order_channel = 'pickup';
  }
  if (pendingFields.includes('item_name')) {
    if (/\b(a )?bebida\b/u.test(text)) output.item_name = 'bebida';
    if (/\b(o )?segundo\b/u.test(text)) output.item_reference = 'second_item';
  }
  if (pendingFields.includes('date') && /\bfoi ontem\b/u.test(text)) output.date = 'relative_yesterday';
  const orderMatch = text.match(/^(?:pedido\s+)?([a-z0-9-]{3,20})$/u);
  if (pendingFields.includes('order_reference') && orderMatch && !['sim', 'nao'].includes(orderMatch[1])) output.order_reference = `order_ref_${orderMatch[1].toUpperCase()}`;
  if (/^(sim|esse mesmo|isso)$/u.test(text)) output.confirmation = 'confirmed';
  if (/^nao$/u.test(text)) output.confirmation = 'rejected';
  const unitMatch = text.match(/\b(?:unidade|agora e)\s+(sim-unit-[a-z0-9-]+)\b/u);
  if (unitMatch) output.unit_id = unitMatch[1].toUpperCase();
  return Object.freeze(output);
}

function executionAction(classification, resultStatus) {
  if (classification.intent === 'waitlist.create' && resultStatus === 'processing') return 'keep_open';
  return classification.action;
}

function executionClosure(classification, resultStatus) {
  if (resultStatus === 'processing') return Object.freeze({ expected_state: 'open', blocked_by: ['result:processing'] });
  return classification.closure;
}

class NativeConversationRuntime {
  constructor(options = {}) {
    this.projectRoot = path.resolve(options.projectRoot || path.resolve(__dirname, '..', '..', '..'));
    this.config = options.config || loadSimulatorConfig({ projectRoot: this.projectRoot });
    this.flags = options.flags || loadFeatureFlags({ projectRoot: this.projectRoot, file: options.flagsFile || 'config/conversation-crm/native-flags.simulator.json' });
    assertFeature(this.flags, 'conversationNativeV1');
    this.catalogs = options.catalogs || loadRuntimeCatalogs();
    this.seed = this.config.seed;
    this.clock = options.clock || new DeterministicClock(this.config.initial_clock);
    this.ids = options.ids || new DeterministicIds(this.seed);
    this.runtimeRoot = path.resolve(options.runtimeRoot || this.config.runtime_path.resolved);
    this.store = new NativeEventStore({ runtimeRoot: this.runtimeRoot, clock: this.clock });
    const checkpoint = this.store.readCheckpoint();
    if (checkpoint?.state?.clock) this.clock.restore(checkpoint.state.clock);
    this.gateway = new ConversationGateway({ store: this.store, flags: this.flags, clock: this.clock });
    this.crm = new ConversationCrmV1({ store: this.store, flags: this.flags, clock: this.clock, ids: this.ids });
    this.context = new ConversationContextStore({ store: this.store, clock: this.clock });
    this.queue = new HumanQueue({ store: this.store, flags: this.flags, clock: this.clock, ids: this.ids });
    this.registry = createSimulatedDriverRegistry({ clock: this.clock, catalogs: this.catalogs });
    this.health = new DriverHealthMonitor({ flags: this.flags, store: this.store, clock: this.clock });
    this.router = new CapabilityRouter({ flags: this.flags, registry: this.registry, store: this.store, clock: this.clock, catalogs: this.catalogs, healthMonitor: this.health });
    this.executor = new ActionExecutor({ flags: this.flags, store: this.store, clock: this.clock, ids: this.ids });
    this.stateHub = new DeliveryOsStateHub({ store: this.store, flags: this.flags, clock: this.clock });
    this.evidence = new EvidenceStore({ store: this.store, flags: this.flags, clock: this.clock, seed: this.seed });
    this.notifications = new NotificationEngine({ store: this.store, flags: this.flags, clock: this.clock, ids: this.ids });
    this.observability = new NativeObservability({ store: this.store, clock: this.clock });
    this.engine = createRuntimeConversationEngine({ flags: this.flags, operationalCatalog: this.catalogs });
    this.placeholders = loadPlaceholderRegistry(this.catalogs);
  }

  stage(messageId, stage, payload, crashAfter) {
    if (!CHECKPOINTS.includes(stage)) throw nativeError('CHECKPOINT_INVALID');
    this.store.append({
      event_id: `stage_${sha256(`${messageId}|${stage}`).slice(0, 20)}`,
      idempotency_key: `stage:${messageId}:${stage}`,
      type: 'runtime.checkpoint',
      occurred_at: this.clock.iso(),
      payload: { message_id: messageId, stage, ...payload, seed: this.seed, clock: this.clock.iso(), synthetic: true }
    });
    if (crashAfter === stage) throw new SimulatedCrashError(stage);
  }

  previousResponseContext(conversationId, excludeMessageId = null) {
    const previousOutputs = this.store.eventsOfType('runtime.response_registered')
      .map((event) => event.payload?.result)
      .filter((saved) => saved?.conversation_id === conversationId && saved?.message_id !== excludeMessageId);
    return {
      previous_responses: previousOutputs.map((saved) => saved.response?.text).filter(Boolean),
      asked_fields: previousOutputs.flatMap((saved) => saved.response?.plan?.mandatory_questions || []),
      known_facts: previousOutputs.flatMap((saved) => [
        ...(saved.response?.plan?.known_facts || []),
        ...(saved.response?.plan?.new_facts || [])
      ])
    };
  }

  contextBeforeMessage(conversationId, caseId, messageId) {
    const output = {};
    for (const event of this.context.events(conversationId, { case_id: caseId })) {
      const payload = event.payload;
      if (payload.message_id === messageId || payload.state === 'superseded') continue;
      const current = output[payload.field];
      if (!current || payload.revision > current.revision || (payload.revision === current.revision && event.sequence > current.sequence)) {
        output[payload.field] = { ...payload, event_id: event.event_id, sequence: event.sequence };
      }
    }
    return output;
  }

  classificationBeforeMessage(conversationId, caseId, messageId) {
    return this.store.eventsOfType('crm.classification_recorded')
      .filter((event) => (
        event.payload.conversation_id === conversationId
        && event.payload.case_id === caseId
        && event.payload.message_id !== messageId
      ))
      .at(-1)?.payload || null;
  }

  recomposeStoredResponse(raw, saved) {
    if (!saved?.input_content_hash || saved.input_content_hash !== sha256(String(raw.content || ''))) {
      return saved.response;
    }
    const history = this.previousResponseContext(saved.conversation_id, saved.message_id);
    const projected = saved.case_id
      ? this.context.project(saved.conversation_id, { case_id: saved.case_id })
      : {};
    const context = {
      ...Object.fromEntries(Object.entries(projected).map(([key, item]) => [key, item.value])),
      ...(raw.context || {}),
      unit_id: raw.unit_id || null,
      continuation_intent: saved.classification?.intent || null,
      short_reply_resolved: Number(raw.turn_order) > 1
    };
    return composeHumanizedResponse({
      classification: saved.classification,
      result: saved.result,
      handoff: saved.handoff,
      seed: this.seed,
      conversation: {
        conversation_id: saved.conversation_id,
        turn_order: raw.turn_order,
        source_text: raw.content,
        ...history,
        context
      }
    });
  }

  selectCase(input, classification, entities, shortEntities = {}) {
    const conversationId = input.conversation_id;
    const explicitOrder = entities.order_reference?.value || null;
    const latest = this.crm.latestCase(conversationId, { open_only: true });
    if (latest && shortEntities.order_reference) return { case_id: latest.case_id, order_id: explicitOrder, existing: latest };
    if (isCorrection(input.content) && latest) return { case_id: latest.case_id, order_id: explicitOrder || latest.order_id, existing: latest };
    if (explicitOrder) {
      const knownCaseId = this.context.findCaseByOrder(conversationId, explicitOrder);
      if (knownCaseId) {
        const previous = this.crm.latestClassification(conversationId, knownCaseId);
        if (!previous || previous.classification.intent === classification.intent || isComplement(input.content)) {
          return { case_id: knownCaseId, order_id: explicitOrder, existing: this.crm.projectCase(knownCaseId) };
        }
      }
      return { case_id: `case_${sha256(`${conversationId}|${explicitOrder}|${classification.intent}`).slice(0, 20)}`, order_id: explicitOrder, existing: null };
    }
    if (latest) {
      const previous = this.crm.latestClassification(conversationId, latest.case_id);
      const changedTopic = previous && previous.classification.intent !== classification.intent;
      const informationalChange = changedTopic && /^(?:information|reservation|waitlist)\./u.test(classification.intent);
      const distinctOccurrence = changedTopic && classification.intent.startsWith('occurrence.') && previous.classification.intent.startsWith('occurrence.') && !isComplement(input.content);
      if (!informationalChange && !distinctOccurrence) return { case_id: latest.case_id, order_id: latest.order_id || null, existing: latest };
    }
    const topicKey = classification.intent.split('.')[0];
    return { case_id: `case_${sha256(`${conversationId}|${topicKey}|${input.message_id}`).slice(0, 20)}`, order_id: null, existing: null };
  }

  persistEntities(input, caseId, orderId, entities) {
    for (const [field, entity] of Object.entries(entities || {})) {
      if (!entity || typeof entity !== 'object' || !('value' in entity) || entity.value == null) continue;
      let effectiveField = field;
      let effectiveValue = entity.value;
      const projection = this.context.project(input.conversation_id, { case_id: caseId });
      if (field === 'item_name' && isComplement(input.content) && projection.item_name?.value !== entity.value) {
        effectiveField = 'missing_items';
        effectiveValue = [...new Set([
          ...(Array.isArray(projection.missing_items?.value) ? projection.missing_items.value : []),
          projection.item_name?.value,
          entity.value
        ].filter(Boolean))];
      }
      const before = projection[effectiveField];
      const written = this.context.upsert({
        conversation_id: input.conversation_id,
        case_id: caseId,
        order_id: orderId,
        message_id: input.message_id,
        field: effectiveField,
        value: effectiveValue,
        state: entity.state || 'inferred',
        provenance: entity.provenance || 'engine',
        confidence: entity.confidence,
        occurred_at: input.occurred_at
      });
      if (before && written.status === 'accepted') {
        this.crm.recordCorrection({
          case_id: caseId,
          field: effectiveField,
          value: effectiveValue,
          revision: written.event.payload.revision,
          provenance: entity.provenance || 'engine',
          supersedes_event_id: before.event_id,
          synthetic: true
        });
      }
    }
  }

  processMessage(raw, options = {}) {
    const scenarioId = options.scenario_id || raw.report_scenario_id || null;
    const finalKey = `runtime:response:${raw.idempotency_key}`;
    const prior = this.store.findByIdempotency(finalKey);
    if (prior) {
      const saved = prior.payload.result;
      const completed = this.store.findByIdempotency(`stage:${raw.message_id}:checkpoint_advanced`);
      if (!completed) {
        this.store.writeCheckpoint({ clock: this.clock.iso(), seed: this.seed, last_message_id: raw.message_id, last_stage: 'checkpoint_advanced' });
        this.stage(raw.message_id, 'checkpoint_advanced', { checkpoint_written: true }, options.crashAfter);
      }
      const observed = this.store.findByIdempotency(`observability:${raw.correlation_id}:complete:1`);
      if (!observed) this.recordCompletion(saved, raw.correlation_id);
      const response = this.recomposeStoredResponse(raw, saved);
      return deepFreeze({ ...saved, response, duplicate: true, recovered: true });
    }

    let gateway;
    try {
      gateway = this.gateway.receive(raw);
    } catch (error) {
      this.store.appendQuarantine('INVALID_GATEWAY_INPUT', { error_code: error.code || 'GATEWAY_INPUT_INVALID', input_fingerprint: sha256(canonicalJson(raw)) });
      throw error;
    }

    try {
      this.stage(raw.message_id, 'message_received', { gateway_status: gateway.status }, options.crashAfter);
      this.crm.ensureConversation(gateway.input);
      this.crm.recordMessage(gateway.input);

      const latestCase = this.crm.latestCase(gateway.input.conversation_id, { open_only: true });
      const latestClassification = latestCase
        ? this.classificationBeforeMessage(gateway.input.conversation_id, latestCase.case_id, gateway.input.message_id)
        : null;
      const pendingFields = latestClassification?.classification?.fields_missing || [];
      const shortEntities = resolveShortReply(gateway.input.content, pendingFields);
      const preliminaryEntities = extractEntities(gateway.input.content, { unit_id: gateway.input.unit_id });
      const provisionalCaseId = latestCase?.case_id || null;
      const projected = provisionalCaseId
        ? this.contextBeforeMessage(gateway.input.conversation_id, provisionalCaseId, gateway.input.message_id)
        : {};
      const mergedContext = {
        ...Object.fromEntries(Object.entries(projected).map(([key, item]) => [key, item.value])),
        ...gateway.input.context,
        ...shortEntities,
        unit_id: shortEntities.unit_id || gateway.input.unit_id,
        continuation_intent: latestClassification?.classification?.intent || null,
        short_reply_resolved: Object.keys(shortEntities).length > 0
      };
      const classification = this.engine.analyze({ content: gateway.input.content, context: mergedContext });
      const selected = this.selectCase(gateway.input, classification, preliminaryEntities, shortEntities);
      const caseId = selected.case_id;
      const orderId = selected.order_id || preliminaryEntities.order_reference?.value || null;
      this.crm.openCase({ case_id: caseId, conversation_id: gateway.input.conversation_id, subject_id: gateway.input.subject_id, order_id: orderId, topic: classification.intent });
      if (selected.existing && orderId && selected.existing.order_id !== orderId) {
        this.crm.updateCaseOrder({
          case_id: caseId,
          conversation_id: gateway.input.conversation_id,
          order_id: orderId,
          previous_order_id: selected.existing.order_id,
          revision: this.store.eventsOfType('crm.case_order_updated').filter((event) => event.payload.case_id === caseId).length + 1
        });
      }
      if (this.crm.projectCase(caseId).state === 'closed') this.crm.reopenCase({ case_id: caseId, conversation_id: gateway.input.conversation_id, revision: this.store.eventsOfType('crm.case_reopened').length + 1, reason: 'new_customer_evidence', synthetic: true });
      this.stage(raw.message_id, 'message_persisted', { raw_message_stored: false, case_id: caseId }, options.crashAfter);

      const contextualEntities = Object.fromEntries(Object.entries(shortEntities).map(([field, value]) => [
        field,
        { value, state: 'provided', provenance: 'resolved_pending_question', confidence: 0.95 }
      ]));
      this.persistEntities(gateway.input, caseId, orderId, { ...preliminaryEntities, ...contextualEntities, ...classification.entities });
      this.crm.recordClassification({
        message_id: gateway.input.message_id,
        case_id: caseId,
        conversation_id: gateway.input.conversation_id,
        classification: {
          intent: classification.intent,
          subintent: classification.subintent,
          origin: classification.origin,
          severity: classification.severity,
          fields_missing: classification.fields_missing,
          capability_id: classification.capability_id,
          authority: classification.authority,
          policy_id: classification.policy_id,
          escalation: classification.escalation,
          legacy_projection: classification.legacy_projection,
          synthetic: true
        }
      });
      this.stage(raw.message_id, 'classification_completed', { intent: classification.intent, confidence: classification.confidence }, options.crashAfter);
      if (classification.intent.startsWith('occurrence.') || classification.intent === 'public_exposure') {
        this.crm.recordOccurrence({
          occurrence_id: `occ_${sha256(`${caseId}|${classification.intent}`).slice(0, 20)}`,
          case_id: caseId,
          conversation_id: gateway.input.conversation_id,
          intent: classification.intent,
          severity: classification.severity,
          state: 'open',
          synthetic: true
        });
      }
      this.stage(raw.message_id, 'crm_updated', { case_id: caseId }, options.crashAfter);

      const simulationStatus = gateway.input.context.simulation_status || classification.expected_result?.status || 'unknown';
      const selectedAction = executionAction(classification, simulationStatus);
      const request = {
        synthetic: true,
        request_id: `req_${sha256(`${gateway.input.message_id}|${classification.capability_id}`).slice(0, 20)}`,
        capability_id: classification.capability_id,
        conversation_id: gateway.input.conversation_id,
        case_id: caseId,
        unit_id: gateway.input.unit_id || 'SIM-UNIT-001',
        subject_id: gateway.input.subject_id,
        payload: { synthetic: true, scenario_id: scenarioId, action: selectedAction },
        authority: classification.authority,
        policy_id: classification.policy_id,
        evidence_requirements: ['source', 'observed_at', 'confidence', 'freshness', 'conflict'],
        idempotency_key: `cap:${gateway.input.message_id}:${classification.capability_id}`,
        correlation_id: gateway.input.correlation_id,
        deadline: new Date(this.clock.date().getTime() + 60000).toISOString()
      };
      const route = this.router.route(request);
      this.crm.recordCapability({ request_id: request.request_id, case_id: caseId, conversation_id: gateway.input.conversation_id, capability_id: request.capability_id, driver_id: route.driver?.manifest.id || null, route_status: route.status, synthetic: true });
      this.stage(raw.message_id, 'capability_requested', { request_id: request.request_id, driver_id: route.driver?.manifest.id || null }, options.crashAfter);
      this.stage(raw.message_id, 'action_started', { request_id: request.request_id }, options.crashAfter);
      const action = this.executor.execute(route, { status: simulationStatus, scenario_id: scenarioId, outcome: gateway.input.context.simulation_outcome, retryable: classification.expected_result?.retryable === true });
      if (route.driver) this.health.record(route.driver.manifest.id, action.result.status, request.request_id);
      const evidence = this.evidence.record({
        evidence_type: 'capability_result',
        source: action.result.source,
        capability: classification.capability_id,
        driver: route.driver?.manifest.id || null,
        result: { status: action.result.status, confidence: action.result.confidence, freshness: action.result.freshness },
        correlation_id: gateway.input.correlation_id,
        scenario_id: scenarioId
      });
      const result = deepFreeze({ ...action.result, evidence_id: evidence.evidence_id });
      const factRevision = this.stateHub.facts(capabilityEntity(classification.capability_id), orderId || caseId, classification.capability_id).length + 1;
      this.stateHub.ingestFact({
        synthetic: true,
        entity_type: capabilityEntity(classification.capability_id),
        entity_id: orderId || caseId,
        field: classification.capability_id,
        value: { status: result.status },
        source: result.source,
        observed_at: this.clock.iso(),
        effective_at: this.clock.iso(),
        confidence: result.confidence,
        freshness: result.freshness,
        evidence_id: evidence.evidence_id,
        revision: factRevision,
        conflict_state: result.status === 'conflict' ? 'conflict' : 'none'
      });
      this.crm.recordAction({ action_id: action.action.action_id, case_id: caseId, conversation_id: gateway.input.conversation_id, capability_id: classification.capability_id, result_status: result.status, evidence_id: evidence.evidence_id, executed: action.action.executed, synthetic: true });
      this.stage(raw.message_id, 'result_persisted', { result_status: result.status, evidence_id: evidence.evidence_id }, options.crashAfter);

      let notification = null;
      if (classification.capability_id === 'notification.send') {
        notification = this.notifications.send({
          synthetic: true,
          case_active: this.crm.projectCase(caseId).state === 'open',
          event_confirmed: result.status === 'confirmed',
          policy_allows: true,
          opt_out: mergedContext.opt_out === true,
          channel: 'synthetic',
          case_id: caseId,
          event_id: evidence.evidence_id,
          content_code: 'confirmed_operational_change',
          recipient_id: gateway.input.subject_id,
          idempotency_key: `${caseId}:${classification.capability_id}:${evidence.evidence_id}`
        });
        if (notification.notification) {
          this.crm.recordNotification({
            notification_id: notification.notification.notification_id,
            case_id: caseId,
            conversation_id: gateway.input.conversation_id,
            event_id: evidence.evidence_id,
            status: notification.status,
            synthetic: true
          });
          this.observability.record({
            conversation_id: gateway.input.conversation_id,
            case_id: caseId,
            scenario_id: scenarioId,
            seed: this.seed,
            intent: classification.intent,
            capability: classification.capability_id,
            driver: route.driver?.manifest.id || null,
            authority: classification.authority,
            policy: classification.policy_id,
            result: notification.status,
            confidence: classification.confidence,
            freshness: result.freshness,
            checkpoint: 'notification',
            correlation_id: gateway.input.correlation_id
          });
        }
      }

      let handoff = null;
      const additionalHandoffs = [];
      if (classification.escalation && classification.escalation !== 'E0') {
        handoff = this.queue.create({ case_id: caseId, conversation_id: gateway.input.conversation_id, escalation: classification.escalation, reason: classification.intent, idempotency_key: `${caseId}:${classification.escalation}`, questions_asked: classification.fields_missing });
      }
      if (classification.policies.food_safety) {
        for (const escalation of classification.policies.food_safety.escalations) {
          if (escalation === classification.escalation) continue;
          additionalHandoffs.push(this.queue.create({ case_id: caseId, conversation_id: gateway.input.conversation_id, escalation, reason: 'food_safety', idempotency_key: `${caseId}:${escalation}:food_safety` }));
        }
      }
      const responseContext = this.previousResponseContext(gateway.input.conversation_id);
      const response = composeHumanizedResponse({
        classification,
        result,
        handoff,
        seed: this.seed,
        conversation: {
          conversation_id: gateway.input.conversation_id,
          turn_order: gateway.input.turn_order,
          source_text: gateway.input.content,
          ...responseContext,
          context: mergedContext
        }
      });
      if (response.validation.fallback_used) {
        this.store.append({
          event_id: `response_validation_${gateway.input.message_id}`,
          idempotency_key: `response-validation:${gateway.input.message_id}`,
          type: 'runtime.response_validation_failed',
          occurred_at: this.clock.iso(),
          payload: {
            message_id: gateway.input.message_id,
            conversation_id: gateway.input.conversation_id,
            case_id: caseId,
            finding_codes: response.validation.rejected_finding_codes,
            fallback_used: true,
            synthetic: true
          }
        });
      }
      this.stage(raw.message_id, 'response_composed', { response_status: result.status }, options.crashAfter);
      const responseId = `response_${sha256(gateway.input.message_id).slice(0, 20)}`;
      this.crm.recordResponse({ response_id: responseId, case_id: caseId, conversation_id: gateway.input.conversation_id, status_reflected: result.status, text_hash: sha256(response.text), handoff_confirmed: handoff?.status === 'confirmed', synthetic: true });
      const output = deepFreeze({
        schema_version: 'conversation-native-result-v1',
        synthetic: true,
        seed: this.seed,
        clock: this.clock.iso(),
        scenario_id: scenarioId,
        conversation_id: gateway.input.conversation_id,
        message_id: gateway.input.message_id,
        input_content_hash: sha256(gateway.input.content),
        case_id: caseId,
        order_id: orderId,
        gateway: { status: 'accepted', out_of_order: gateway.out_of_order, privacy: gateway.privacy },
        classification,
        capability_request: request,
        route: { status: route.status, driver_id: route.driver?.manifest.id || null, reason: route.reason },
        action: action.action,
        execution_action: selectedAction,
        result,
        evidence,
        notification,
        handoff,
        additional_handoffs: additionalHandoffs,
        response,
        closure: executionClosure(classification, result.status),
        production_blocked: this.placeholders.production_blockers_open > 0,
        external_system_accessed: false,
        real_driver_used: false,
        raw_message_persisted: false,
        duplicate: false,
        recovered: false
      });
      this.store.append({ event_id: `runtime_response_${gateway.input.message_id}`, idempotency_key: finalKey, type: 'runtime.response_registered', occurred_at: this.clock.iso(), payload: { result: output } });
      this.stage(raw.message_id, 'response_registered', { response_id: responseId }, options.crashAfter);
      this.recordCompletion(output, gateway.input.correlation_id);
      this.store.writeCheckpoint({ clock: this.clock.iso(), seed: this.seed, last_message_id: gateway.input.message_id, last_stage: 'checkpoint_advanced' });
      this.stage(raw.message_id, 'checkpoint_advanced', { checkpoint_written: true }, options.crashAfter);
      return output;
    } finally {
      this.gateway.forgetOriginal(raw.message_id);
    }
  }

  recordCompletion(saved, correlationId) {
    this.observability.record({
      conversation_id: saved.conversation_id,
      case_id: saved.case_id,
      scenario_id: saved.scenario_id,
      seed: this.seed,
      intent: saved.classification.intent,
      capability: saved.classification.capability_id,
      driver: saved.route.driver_id,
      authority: saved.classification.authority,
      policy: saved.classification.policy_id,
      result: saved.result.status,
      confidence: saved.classification.confidence,
      freshness: saved.result.freshness,
      conflict: saved.result.status === 'conflict',
      handoff: saved.handoff?.status || null,
      checkpoint: 'complete',
      correlation_id: correlationId
    });
  }

  snapshot() {
    const value = {
      schema_version: 'conversation-native-snapshot-v1',
      synthetic: true,
      seed: this.seed,
      clock: this.clock.iso(),
      event_store: this.store.snapshot(),
      crm: this.crm.snapshot(),
      state_hub: this.stateHub.snapshot(),
      human_queue: this.queue.snapshot(),
      evidence: this.evidence.snapshot(),
      notifications: this.notifications.snapshot(),
      drivers: this.registry.manifests().map((item) => ({ id: item.id, health: item.health, availability: item.availability, capabilities: item.capabilities.length })),
      driver_health: this.health.snapshot(),
      production_blockers: this.placeholders.production_blockers_open
    };
    return deepFreeze({ ...value, snapshot_hash: sha256(canonicalJson(value)) });
  }
}

module.exports = {
  CHECKPOINTS,
  SimulatedCrashError,
  capabilityEntity,
  isCorrection,
  isComplement,
  resolveShortReply,
  executionAction,
  executionClosure,
  NativeConversationRuntime
};
