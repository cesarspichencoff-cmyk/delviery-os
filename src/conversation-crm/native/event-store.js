'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { canonicalJson, sha256 } = require('./deterministic');
const { sanitize } = require('./privacy');
const { nativeError } = require('./errors');

function ensureDirectory(root) {
  const resolved = path.resolve(root);
  fs.mkdirSync(resolved, { recursive: true });
  return resolved;
}

function durableAppend(file, value) {
  const descriptor = fs.openSync(file, 'a');
  try { fs.writeSync(descriptor, `${JSON.stringify(value)}\n`, null, 'utf8'); fs.fsyncSync(descriptor); } finally { fs.closeSync(descriptor); }
}

class NativeEventStore {
  constructor(options = {}) {
    if (!options.runtimeRoot) throw nativeError('RUNTIME_ROOT_REQUIRED');
    this.runtimeRoot = ensureDirectory(options.runtimeRoot);
    this.eventsFile = path.join(this.runtimeRoot, 'conversation-native-events.runtime.jsonl');
    this.quarantineFile = path.join(this.runtimeRoot, 'conversation-native-quarantine.runtime.jsonl');
    this.checkpointFile = path.join(this.runtimeRoot, 'conversation-native-checkpoint.json');
    this.clock = options.clock;
    this.events = [];
    this.byEventId = new Map();
    this.byIdempotency = new Map();
    this.quarantine = [];
    this.rebuild();
  }

  now() { return this.clock?.iso ? this.clock.iso() : new Date(0).toISOString(); }

  rebuild() {
    this.events = [];
    this.byEventId.clear();
    this.byIdempotency.clear();
    const corrupt = [];
    if (fs.existsSync(this.eventsFile)) {
      const lines = fs.readFileSync(this.eventsFile, 'utf8').split(/\r?\n/);
      for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];
        if (!line.trim()) continue;
        try {
          const event = JSON.parse(line);
          if (!event.event_id || !event.idempotency_key || !event.type || !event.content_hash) throw new Error('invalid');
          this.events.push(Object.freeze(event));
          this.byEventId.set(event.event_id, event);
          this.byIdempotency.set(event.idempotency_key, event);
        } catch { corrupt.push({ line_number: index + 1, raw_hash: sha256(line) }); }
      }
    }
    if (fs.existsSync(this.quarantineFile)) {
      for (const line of fs.readFileSync(this.quarantineFile, 'utf8').split(/\r?\n/)) {
        if (!line.trim()) continue;
        try { this.quarantine.push(Object.freeze(JSON.parse(line))); } catch { /* never echo corrupt quarantine */ }
      }
    }
    for (const item of corrupt) this.appendQuarantine('CORRUPT_JSONL_LINE', item);
    return this.snapshot();
  }

  append(input) {
    if (!input || typeof input !== 'object') throw nativeError('EVENT_INVALID');
    const eventId = String(input.event_id || '');
    const idempotencyKey = String(input.idempotency_key || '');
    const type = String(input.type || '');
    if (!eventId || !idempotencyKey || !type) throw nativeError('EVENT_INVALID');
    const cleaned = sanitize(input.payload || {});
    const identity = canonicalJson({ type, payload: cleaned.sanitized });
    const contentHash = sha256(identity);
    const sameId = this.byEventId.get(eventId);
    if (sameId) {
      if (sameId.content_hash === contentHash) return Object.freeze({ status: 'duplicate', event: sameId });
      this.appendQuarantine('DIVERGENT_EVENT_ID', { event_id: eventId, incoming_hash: contentHash, existing_hash: sameId.content_hash });
      return Object.freeze({ status: 'quarantined', event: null });
    }
    const sameFact = this.byIdempotency.get(idempotencyKey);
    if (sameFact) {
      if (sameFact.content_hash === contentHash) return Object.freeze({ status: 'duplicate', event: sameFact });
      this.appendQuarantine('DIVERGENT_IDEMPOTENCY_KEY', { idempotency_key_hash: sha256(idempotencyKey), incoming_hash: contentHash, existing_hash: sameFact.content_hash });
      return Object.freeze({ status: 'quarantined', event: null });
    }
    const event = Object.freeze({
      schema_version: 'conversation-native-event-v1', sequence: this.events.length + 1, event_id: eventId,
      idempotency_key: idempotencyKey, type, occurred_at: input.occurred_at || this.now(), synthetic: true,
      payload: cleaned.sanitized, privacy: { detected: cleaned.detected, finding_types: cleaned.finding_types, removed_fields: cleaned.removed_fields }, content_hash: contentHash
    });
    durableAppend(this.eventsFile, event);
    this.events.push(event); this.byEventId.set(eventId, event); this.byIdempotency.set(idempotencyKey, event);
    return Object.freeze({ status: 'accepted', event });
  }

  appendQuarantine(reason, detail = {}) {
    const cleaned = sanitize(detail);
    const record = Object.freeze({ schema_version: 'conversation-native-quarantine-v1', quarantine_id: `qua_${sha256(`${reason}|${canonicalJson(cleaned.sanitized)}|${this.quarantine.length + 1}`).slice(0, 20)}`, reason, observed_at: this.now(), synthetic: true, detail: cleaned.sanitized });
    durableAppend(this.quarantineFile, record);
    this.quarantine.push(record);
    return record;
  }

  eventsOfType(type) { return this.events.filter((event) => event.type === type); }
  findByIdempotency(key) { return this.byIdempotency.get(key) || null; }

  writeCheckpoint(value) {
    const cleaned = sanitize(value);
    const output = { schema_version: 'conversation-native-checkpoint-v1', synthetic: true, written_at: this.now(), state: cleaned.sanitized, hash: sha256(cleaned.sanitized) };
    const temp = `${this.checkpointFile}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(output), 'utf8');
    fs.renameSync(temp, this.checkpointFile);
    return Object.freeze(output);
  }

  readCheckpoint() {
    if (!fs.existsSync(this.checkpointFile)) return null;
    try { return Object.freeze(JSON.parse(fs.readFileSync(this.checkpointFile, 'utf8'))); } catch { this.appendQuarantine('CORRUPT_CHECKPOINT', { file_hash: sha256(fs.readFileSync(this.checkpointFile)) }); return null; }
  }

  snapshot() { return Object.freeze({ events: this.events.length, quarantine: this.quarantine.length, last_sequence: this.events.at(-1)?.sequence || 0, event_ids: this.byEventId.size, idempotency_keys: this.byIdempotency.size }); }
}

module.exports = { ensureDirectory, durableAppend, NativeEventStore };

