'use strict';

function hashSeed(value) {
  let hash = 2166136261;
  for (const char of String(value)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

class SeededRandom {
  constructor(seed) {
    this.seed = String(seed);
    this.state = hashSeed(seed) || 1;
  }

  next() {
    let value = this.state;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    this.state = value >>> 0;
    return this.state / 0x100000000;
  }

  pick(values) {
    if (!Array.isArray(values) || !values.length) throw new Error('EXPERIENCE_LAB_EMPTY_VARIANT_SET');
    return values[Math.floor(this.next() * values.length)];
  }
}

module.exports = { hashSeed, SeededRandom };
