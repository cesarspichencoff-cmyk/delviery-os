'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { nativeError } = require('./errors');

const SECRET_FILE = /^(?:\.env|.*\.(?:pem|key|p12|pfx)|credentials?\..*|cookies?\..*|session\..*)$/i;
const INDEPENDENT_PATTERNS = Object.freeze([
  ['email', /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu],
  ['cpf', /\b\d{3}[.\s]?\d{3}[.\s]?\d{3}[-\s]?\d{2}\b/gu],
  ['phone', /(?<![A-Za-z0-9])(?:\+?55[\s.-]*)?(?:\(?\d{2}\)?[\s.-]*)?9?\d{4}[\s.-]?\d{4}(?![A-Za-z0-9])/gu],
  ['url_credentials', /https?:\/\/[^\s/@:]+:[^\s/@]+@[^\s]+/giu],
  ['sensitive_query', /[?&](?:token|access_token|auth|authorization|cookie|session|password|senha|secret|key)=[^&#\s]+/giu],
  ['private_path', /[A-Z]:\\Users\\[^\s"']+/giu],
  ['secret_assignment', /\b(?:token|cookie|password|senha|secret|authorization)\s*[:=]\s*[^\s,;]+/giu],
  ['stack_trace', /\bat\s+[A-Za-z0-9_.<>]+\s+\([^)\r\n]+:\d+:\d+\)/gu]
]);

function markerHash(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function compact(value) {
  return String(value).normalize('NFKC').replace(/[\u200B-\u200D\uFEFF]/gu, '').replace(/\s+/gu, '');
}

function scanText(text, options = {}) {
  const types = new Set();
  const source = String(text);
  const compacted = compact(source);
  for (const [type, pattern] of INDEPENDENT_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(source)) types.add(type);
  }
  for (const marker of options.markers || []) {
    const value = String(marker);
    if (value && (source.includes(value) || compacted.includes(compact(value)))) {
      types.add(`synthetic_marker:${markerHash(value)}`);
    }
  }
  return [...types].sort();
}

function logicalFindings(value, options, logicalPath = '$', output = []) {
  if (typeof value === 'string') {
    const types = scanText(value, options);
    if (types.length) output.push({ logical_path: logicalPath, types });
    return output;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => logicalFindings(item, options, `${logicalPath}[${index}]`, output));
    return output;
  }
  if (value && typeof value === 'object') {
    for (const [key, nested] of Object.entries(value)) logicalFindings(nested, options, `${logicalPath}.${key}`, output);
  }
  return output;
}

function scanTree(root, options = {}) {
  const resolved = path.resolve(root);
  const findings = [];
  let files = 0;
  let readErrors = 0;
  if (!fs.existsSync(resolved)) {
    return Object.freeze({
      root_label: path.basename(resolved),
      root_exists: false,
      files: 0,
      read_errors: 0,
      findings: Object.freeze([{ relative_path: '.', logical_path: '$', types: Object.freeze(['root_missing']) }]),
      passed: false
    });
  }
  const visit = (directory) => {
    let entries;
    try {
      entries = fs.readdirSync(directory, { withFileTypes: true });
    } catch {
      readErrors += 1;
      findings.push({ relative_path: path.relative(resolved, directory).split(path.sep).join('/') || '.', logical_path: '$', types: ['read_error'] });
      return;
    }
    for (const entry of entries) {
      const full = path.join(directory, entry.name);
      const relative = path.relative(resolved, full).split(path.sep).join('/');
      if (entry.isDirectory()) {
        visit(full);
        continue;
      }
      if (!entry.isFile()) continue;
      files += 1;
      if (SECRET_FILE.test(entry.name)) findings.push({ relative_path: relative, logical_path: '$', types: ['secret_file_name'] });
      const fileNameTypes = scanText(entry.name, options);
      if (fileNameTypes.length) findings.push({ relative_path: relative, logical_path: '$file_name', types: fileNameTypes });
      try {
        const buffer = fs.readFileSync(full);
        if (buffer.includes(0)) continue;
        const text = buffer.toString('utf8');
        const direct = scanText(text, options);
        if (direct.length) findings.push({ relative_path: relative, logical_path: '$raw', types: direct });
        if (/\.jsonl?$|\.json$/i.test(entry.name)) {
          const lines = /\.jsonl$/i.test(entry.name) ? text.split(/\r?\n/u).filter((line) => line.trim()) : [text];
          lines.forEach((line, index) => {
            try {
              const parsed = JSON.parse(line);
              for (const item of logicalFindings(parsed, options)) {
                findings.push({ relative_path: relative, logical_path: /\.jsonl$/i.test(entry.name) ? `$line[${index + 1}]${item.logical_path.slice(1)}` : item.logical_path, types: item.types });
              }
            } catch {
              if (/\.json$/i.test(entry.name)) findings.push({ relative_path: relative, logical_path: '$', types: ['json_read_error'] });
            }
          });
        }
      } catch {
        readErrors += 1;
        findings.push({ relative_path: relative, logical_path: '$', types: ['read_error'] });
      }
    }
  };
  visit(resolved);
  if (files === 0) findings.push({ relative_path: '.', logical_path: '$', types: ['no_artifacts'] });
  return Object.freeze({
    root_label: path.basename(resolved),
    root_exists: true,
    files,
    read_errors: readErrors,
    findings: Object.freeze(findings.map((item) => Object.freeze({ ...item, types: Object.freeze([...item.types]) }))),
    passed: files > 0 && readErrors === 0 && findings.length === 0
  });
}

function assertTreeSafe(root, options = {}) {
  const result = scanTree(root, options);
  if (!result.passed) throw nativeError('PRIVACY_SCAN_FAILED', { files: result.files, findings: result.findings.length, read_errors: result.read_errors });
  return result;
}

module.exports = {
  SECRET_FILE,
  INDEPENDENT_PATTERNS,
  markerHash,
  scanText,
  logicalFindings,
  scanTree,
  assertTreeSafe
};

