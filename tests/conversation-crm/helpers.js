'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function deterministicOptions() {
  let sequence = 0;
  return {
    clock: () => new Date('2026-01-01T12:00:00.000Z'),
    id: (prefix) => `${prefix}_synthetic_${++sequence}`
  };
}

function tempDirectory(prefix = 'deliveryos-crm-test-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function removeDirectory(directory) {
  fs.rmSync(directory, { recursive: true, force: true });
}

function syntheticPhone(suffix = 1) {
  return `11${9}${String(10000000 + suffix).padStart(8, '0')}`;
}

function syntheticEmail(suffix = 1) {
  return `record-${suffix}@example.invalid`;
}

module.exports = { deterministicOptions, tempDirectory, removeDirectory, syntheticPhone, syntheticEmail };

