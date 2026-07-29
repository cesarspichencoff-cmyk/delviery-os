'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const MANIFEST = require('../model-adapters/grammars/manifest.json');

function fail(code) { throw Object.assign(new Error(code), { code }); }

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function normalizedText(file) {
  return fs.readFileSync(file, 'utf8').replace(/\r\n/gu, '\n');
}

function fixedGrammar(jsonSchema = {}) {
  const entry = MANIFEST.schemas[jsonSchema.name];
  if (!entry) return null;
  if (sha256(JSON.stringify(jsonSchema.schema)) !== entry.schema_sha256) fail('STRUCTURED_SCHEMA_DRIFT');
  const file = path.resolve(__dirname, '../model-adapters/grammars', entry.grammar_file);
  const grammar = normalizedText(file);
  if (sha256(grammar) !== entry.grammar_sha256) fail('STRUCTURED_GRAMMAR_HASH_MISMATCH');
  return grammar;
}

function parseStrictJsonObject(raw) {
  if (typeof raw !== 'string') fail('STRUCTURED_CONTENT_TYPE_INVALID');
  if (!raw || raw !== raw.trim()) fail('STRUCTURED_JSON_BOUNDARY_INVALID');
  let value;
  try { value = JSON.parse(raw); } catch { fail('STRUCTURED_JSON_INVALID'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('STRUCTURED_JSON_OBJECT_REQUIRED');
  return value;
}

module.exports = { MANIFEST, sha256, normalizedText, fixedGrammar, parseStrictJsonObject };
