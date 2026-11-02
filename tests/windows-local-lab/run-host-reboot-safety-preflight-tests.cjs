'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { inspect } = require('../../tools/windows-local-lab/host-reboot-safety-preflight.cjs');

function fixture(fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lab-reboot-readonly-'));
  const mk = (p, obj) => {
    const full = path.join(root, p);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, JSON.stringify(obj));
  };
  mk('pilot-local.json', {
    mode: 'test', source_mode: 'simulated', unit_id: 'ITAIM',
    features: { gps: false, source: false, orders: false },
  });
  mk('pilot-storage.json', {
    schema: 'deliveryos.lab-pilot-storage.v1', kind: 'postgres',
    unitId: 'ITAIM', sourceMode: 'simulated',
    scope: 'isolated_legacy_console_only',
  });
  mk('gps-disabled.json', { gps_capture_enabled: false });
  mk('app/dist/build-stamp.json', { commit: 'be5a3e346981f22a7cab2f39470756c7dc00ef07' });
  mk('runtime-pids.json', { critical: 111, async: 222, pilot: 333 });
  fs.mkdirSync(path.join(root, 'pgdata'), { recursive: true });
  fs.writeFileSync(path.join(root, 'pgdata', 'postmaster.pid'), '123');
  fs.writeFileSync(path.join(root, 'private-local.json'), 'DO_NOT_READ_OR_OUTPUT');
  try { fn({ root, mk }); }
  finally { fs.rmSync(root, { recursive: true, force: true }); }
}
const opts = { hostname: 'CAIXA_MOOCA', bootTimeMs: Date.now() + 2000 };

test('simulated ITAIM config is not permission to start; source and secrets are untouched', () => fixture(({root}) => {
  const before = fs.readFileSync(path.join(root, 'private-local.json'), 'utf8');
  const r = inspect(root, opts);
  assert.equal(r.status, 'PREFLIGHT_ONLY_NO_GO');
  assert.equal(r.activationAllowed, false);
  assert.equal(r.liveDatabaseChecked, false);
  assert.equal(r.processIdentityVerified, false);
  assert.equal(r.sourceRead, false);
  assert.equal(r.credentialsRead, false);
  assert.equal(r.modificationsExecuted, false);
  assert.equal(r.pidsRecordOlderThanBoot, true);
  assert.equal(r.postmasterRecordOlderThanBoot, true);
  assert.ok(r.reasons.includes('POSTMASTER_RECORD_PRE_BOOT'));
  assert.ok(r.reasons.includes('LIVE_PROCESS_IDENTITY_NOT_PROVEN'));
  assert.equal(fs.readFileSync(path.join(root, 'private-local.json'), 'utf8'), before);
  assert.equal(fs.readFileSync(path.join(root, 'pgdata', 'postmaster.pid'), 'utf8'), '123');
  assert.equal(JSON.stringify(r).includes('111'), false);
}));

test('GPS ON is hard unsafe and never inferred as approved', () => fixture(({root,mk}) => {
  mk('gps-disabled.json', { gps_capture_enabled: true });
  const r = inspect(root, opts);
  assert.equal(r.status, 'UNSAFE_SCOPE_NO_GO');
  assert.ok(r.reasons.includes('GPS_FLAG_NOT_PROVEN_DISABLED'));
  assert.equal(r.activationAllowed, false);
}));

test('non-simulated data or enabled feature refuses scope', () => fixture(({root,mk}) => {
  mk('pilot-local.json', { mode: 'real', source_mode: 'real', unit_id: 'ITAIM',
    features: { gps: false, source: true } });
  const r = inspect(root, opts);
  assert.equal(r.status, 'UNSAFE_SCOPE_NO_GO');
  assert.ok(r.reasons.includes('TEST_SIMULATED_SCOPE_NOT_PROVEN'));
}));

test('cross-unit storage is rejected independent of config', () => fixture(({root,mk}) => {
  mk('pilot-storage.json', { schema:'deliveryos.lab-pilot-storage.v1',
    kind:'postgres', unitId:'MOOCA', sourceMode:'real', scope:'isolated_legacy_console_only' });
  assert.equal(inspect(root, opts).status, 'UNSAFE_SCOPE_NO_GO');
}));

test('unexpected host and missing files fail closed', () => fixture(({root}) => {
  assert.equal(inspect(root, { ...opts, hostname: 'UNTRUSTED' }).status, 'UNSAFE_SCOPE_NO_GO');
  fs.unlinkSync(path.join(root, 'pilot-local.json'));
  const result = inspect(root, opts);
  assert.equal(result.status, 'UNSAFE_SCOPE_NO_GO');
  assert.ok(result.reasons.some(v=>v.startsWith('MISSING_OR_INVALID_PILOT_LOCAL')));
}));

test('uncertain boot metadata never makes a PID or database live', () => fixture(({root}) => {
  const r = inspect(root, { hostname:'CAIXA_MOOCA' });
  assert.equal(r.activationAllowed, false);
  assert.equal(r.postmasterRecordOlderThanBoot, false);
  assert.ok(r.reasons.includes('BOOT_TIME_UNKNOWN'));
  assert.ok(r.reasons.includes('LIVE_PROCESS_IDENTITY_NOT_PROVEN'));
}));

test('preflight contains no execution, deletion, file creation, or network primitives', () => {
  const src = fs.readFileSync(path.join(__dirname,'../../tools/windows-local-lab/host-reboot-safety-preflight.cjs'),'utf8');
  for (const forbidden of [
    /require\(['"]node:child_process['"]\)/,
    /\bfs\.(?:writeFile|rename|rm|unlink|rmdir|mkdir|appendFile|cp|copyFile)Sync?\s*\(/,
    /\bprocess\.kill\s*\(/,
    /\bnet\.connect\s*\(/,
    /\bfetch\s*\(/,
  ]) assert.equal(forbidden.test(src), false, String(forbidden));
});
