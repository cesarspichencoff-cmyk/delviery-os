'use strict';
// Private lab credentials stay on this host and never appear in receipts.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const base = 'http://100.107.78.202:5193';
const origin = 'https://deliveryos-piloto.eu1.netbird.services';
const root = __dirname;
async function main() {
  const results = [];
  async function check(name, url, expected, options) {
    const r = await fetch(url, {...options, signal: AbortSignal.timeout(8000)});
    assert.equal(r.status, expected, name);
    results.push({name, status: r.status});
    return r;
  }
  await check('pilot_health', base + '/api/health', 200);
  await check('platform_ready', 'http://127.0.0.1:8080/ready', 200);
  await check('term_requires_session', base + '/api/term', 401);
  await check('policies_require_session', base + '/api/policies', 401);
  const rejected = await check('untrusted_origin_denied', base + '/api/policies', 403,
    {method: 'OPTIONS', headers: {Origin: 'https://untrusted.invalid'}});
  assert.equal(rejected.headers.get('access-control-allow-origin'), null);
  const allowed = await check('public_origin_allowed', base + '/api/policies', 204,
    {method: 'OPTIONS', headers: {Origin: origin}});
  assert.equal(allowed.headers.get('access-control-allow-origin'), origin);
  const secrets = JSON.parse(fs.readFileSync(path.join(root, 'private-local.json'), 'utf8'));
  const response = await check('synthetic_session_policies', base + '/api/policies', 200,
    {headers: {Authorization: 'Bearer ' + secrets.users[0].token}});
  const policies = await response.json();
  assert.equal(policies.flags.gps_capture_enabled, false);
  assert.equal(policies.term.publishable, false);
  const receipt = {observedAtUtc: new Date().toISOString(),
    scope: 'HOST_HTTP_ONLY_NOT_AUTHENTICATED_PROXY_OR_PHYSICAL_DEVICE_PROOF',
    results, gps: false, termPublishable: false};
  fs.writeFileSync(path.join(root, 'remote-http-proof.json'), JSON.stringify(receipt, null, 2));
  console.log('REMOTE_HTTP_SMOKE_PASS', JSON.stringify(receipt));
}
main().catch(e => {console.error('REMOTE_HTTP_SMOKE_FAILED', e.message);process.exitCode = 1;});
