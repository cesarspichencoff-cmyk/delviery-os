'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { sha256, canonicalJson } = require('../request-signing');
const { initialJourneyState, applyDirective, applyActionResult } = require('./journey-reducer');
const { validateDirectorOutput } = require('./director-contract');

const FORBIDDEN_FACT_KEY = /(?:phone|telefone|email|cpf|document|address|endereco|customer_name|nome_cliente|token|cookie|credential|password|raw_message|full_order)/iu;
const SENSITIVE_FACT_VALUE = /(?:[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|\b\d{3}\.\d{3}\.\d{3}-\d{2}\b|\b(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?9?\d{4}[-\s]?\d{4}\b|\b(?:bearer|token|cookie|password|senha)\s*[:=]\s*\S+)/iu;

function sanitizeFacts(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([key, item]) => (
    !FORBIDDEN_FACT_KEY.test(key)
    && (item === null || ['string', 'number', 'boolean'].includes(typeof item))
    && (typeof item !== 'string' || item.length <= 500)
    && (typeof item !== 'string' || !SENSITIVE_FACT_VALUE.test(item))
  )));
}

function sanitizeDirective(directive) {
  const checked = validateDirectorOutput(directive);
  if (!checked.accepted) throw Object.assign(new Error(checked.reason), { code: checked.reason });
  return {
    ...checked.output,
    facts_added: sanitizeFacts(checked.output.facts_added),
    facts_corrected: sanitizeFacts(checked.output.facts_corrected),
    references_resolved: sanitizeFacts(checked.output.references_resolved)
  };
}

function journeyEvent(input, sequence, clock) {
  const directive = sanitizeDirective(input.directive);
  const identity = canonicalJson({
    conversation_id: input.conversation_id,
    turn_id: input.turn_id,
    directive,
    sequence
  });
  return Object.freeze({
    schema_version: 'deliveryos-journey-event-v1',
    event_id: `jrn_${sha256(identity).slice(0, 24)}`,
    idempotency_key: `journey:${sha256(`${input.conversation_id}|${input.turn_id}`)}`,
    conversation_id: input.conversation_id,
    turn_id: input.turn_id,
    sequence,
    type: 'directive_applied',
    directive,
    occurred_at: new Date(clock()).toISOString()
  });
}

class MemoryJourneyStore {
  constructor(options = {}) {
    this.clock = options.clock || (() => Date.now());
    this.events = [];
    this.keys = new Set();
  }

  append(input) {
    if (!/^[A-Za-z0-9._:-]+$/u.test(input.conversation_id || '') || !/^[A-Za-z0-9._:-]+$/u.test(input.turn_id || '')) throw Object.assign(new Error('JOURNEY_ID_INVALID'), { code: 'JOURNEY_ID_INVALID' });
    const event = journeyEvent(input, this.events.length + 1, this.clock);
    if (this.keys.has(event.idempotency_key)) return { appended: false, event: this.events.find((item) => item.idempotency_key === event.idempotency_key) };
    this.events.push(event);
    this.keys.add(event.idempotency_key);
    return { appended: true, event };
  }

  eventsFor(conversationId) { return this.events.filter((event) => event.conversation_id === conversationId); }

  reconstruct(conversationId) {
    return this.eventsFor(conversationId).reduce(
      (state, event) => event.type === 'directive_applied' ? applyDirective(state, event.directive) : applyActionResult(state, event.result),
      initialJourneyState(conversationId)
    );
  }
}

class JsonlJourneyStore extends MemoryJourneyStore {
  constructor(options = {}) {
    super(options);
    this.file = path.resolve(options.file);
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    if (fs.existsSync(this.file)) this.restore();
  }

  restore() {
    this.events = [];
    this.keys = new Set();
    for (const line of fs.readFileSync(this.file, 'utf8').split(/\r?\n/u)) {
      if (!line.trim()) continue;
      try {
        const event = JSON.parse(line);
        if (event.schema_version !== 'deliveryos-journey-event-v1' || this.keys.has(event.idempotency_key)) continue;
        const sanitized = { ...event, directive: sanitizeDirective(event.directive) };
        this.events.push(Object.freeze(sanitized));
        this.keys.add(event.idempotency_key);
      } catch {}
    }
  }

  append(input) {
    const result = super.append(input);
    if (result.appended) fs.appendFileSync(this.file, JSON.stringify(result.event) + '\n', { encoding: 'utf8', flush: true });
    return result;
  }
}

module.exports = { FORBIDDEN_FACT_KEY, sanitizeFacts, sanitizeDirective, journeyEvent, MemoryJourneyStore, JsonlJourneyStore };
