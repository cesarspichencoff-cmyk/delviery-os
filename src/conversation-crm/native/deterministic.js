'use strict';

const crypto = require('node:crypto');
const { nativeError } = require('./errors');

function canonicalize(value) {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(canonicalize);
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
}

function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

function sha256(value) {
  const input = Buffer.isBuffer(value) ? value : Buffer.from(typeof value === 'string' ? value : canonicalJson(value));
  return crypto.createHash('sha256').update(input).digest('hex');
}

function seedToUint32(seed) {
  const digest = sha256(String(seed));
  return Number.parseInt(digest.slice(0, 8), 16) >>> 0;
}

class SeededRandom {
  constructor(seed) {
    if (typeof seed !== 'string' || !seed.trim()) throw nativeError('SEED_INVALID');
    this.seed = seed;
    this.state = seedToUint32(seed);
  }

  next() {
    let t = this.state += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  integer(min, max) {
    if (!Number.isInteger(min) || !Number.isInteger(max) || max < min) throw nativeError('RANDOM_RANGE_INVALID');
    return min + Math.floor(this.next() * (max - min + 1));
  }

  pick(values) {
    if (!Array.isArray(values) || values.length === 0) throw nativeError('RANDOM_VALUES_EMPTY');
    return values[this.integer(0, values.length - 1)];
  }
}

class DeterministicClock {
  constructor(initialIso) {
    const parsed = new Date(initialIso);
    if (Number.isNaN(parsed.getTime())) throw nativeError('CLOCK_INITIAL_INVALID');
    this.initialIso = initialIso;
    this.currentMs = parsed.getTime();
  }

  date() { return new Date(this.currentMs); }
  iso() { return this.date().toISOString(); }

  advance(ms) {
    if (!Number.isFinite(ms) || ms < 0) throw nativeError('CLOCK_ADVANCE_INVALID');
    this.currentMs += Math.trunc(ms);
    return this.iso();
  }

  restore(iso) {
    const parsed = new Date(iso);
    if (Number.isNaN(parsed.getTime())) throw nativeError('CLOCK_RESTORE_INVALID');
    this.currentMs = parsed.getTime();
    return this.iso();
  }
}

class DeterministicIds {
  constructor(seed) {
    this.seed = String(seed);
    this.counters = new Map();
  }

  next(prefix) {
    const key = String(prefix || 'id');
    const next = (this.counters.get(key) || 0) + 1;
    this.counters.set(key, next);
    return `${key}_${sha256(`${this.seed}|${key}|${next}`).slice(0, 20)}`;
  }

  restore(entries = {}) {
    this.counters = new Map(Object.entries(entries).map(([key, value]) => [key, Number(value)]));
  }

  snapshot() { return Object.fromEntries(this.counters); }
}

module.exports = { canonicalize, canonicalJson, sha256, SeededRandom, DeterministicClock, DeterministicIds };
