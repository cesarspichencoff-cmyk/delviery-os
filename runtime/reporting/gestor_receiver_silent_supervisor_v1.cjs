'use strict';
/**
 * Delivery OS Itaim: process reliability for the EXISTING V2 receiver.
 * The supervisor does NOT control Edge, browse iFood, read orders, or publish
 * business events. V2 is STRUCTURE ONLY. It may only restart its OWN receiver
 * child on the local cashier, after verifying the pinned existing code hash.
 * Installation is an independent, explicit, reversible production gate.
 */
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const net = require('node:net');
const {createHash} = require('node:crypto');
const {spawn} = require('node:child_process');

const SCHEMA = 'deliveryos.itaim.existing-gestor-v2-receiver-supervisor.v1';
const HOST = 'CAIXA_MOOCA';
const RECEIVER = 'C:\\Users\\Tata\\AppData\\Local\\TataGestorObservationLab\\GestorWebReadOnlyV2\\receiver.cjs';
const EXPECTED_SHA256 = 'c3f8072f78115970549279ad4248700bc722a0a5f9d6a3da3d7837dcc500386a';
const EDGE_PROFILE = 'C:\\Users\\Tata\\AppData\\Local\\TataGestorObservationLab\\DedicatedEdgeProfile';
const STATUS_FILE = 'C:\\ProgramData\\DeliveryOS-Itaim-Observer\\gestor-receiver-supervision-v1.json';
const PORT = 5195;
const INTERVAL_MS = 20000;
const RETRY_MS = 60000;
const HEALTH_TIMEOUT_MS = 1800;
const MAX_BODY = 8192;
const EXPEDITION = 'https://gestordepedidos.ifood.com.br/#/home/order-display/expedition';
const SAFE_STATE = Object.freeze({
  RECEIVER_RECOVERING: 'RECEIVER_RECOVERING',
  STRUCTURE_ONLY_CURRENT: 'STRUCTURE_ONLY_CURRENT',
  STRUCTURE_ONLY_STALE: 'STRUCTURE_ONLY_STALE',
  RECEIVER_DOWN: 'RECEIVER_DOWN',
  PORT_UNTRUSTED: 'PORT_UNTRUSTED',
  HASH_MISMATCH: 'HASH_MISMATCH',
});

function httpJson(port, route, timeoutMs = HEALTH_TIMEOUT_MS) {
  return new Promise(resolve => {
    let settled = false;
    const done = result => {if (!settled) {settled = true; resolve(result);}};
    const req = http.get({hostname: '127.0.0.1', port, path: route,
      headers: {Accept: 'application/json'}, timeout: timeoutMs}, res => {
      let raw = '';
      res.on('data', chunk => {
        raw += chunk.toString();
        if (raw.length > MAX_BODY) req.destroy(new Error('OVERSIZED'));
      });
      res.on('end', () => {
        let value = null;
        try {value = JSON.parse(raw);} catch { /* Not trusted. */ }
        done({kind: res.statusCode === 200 && value !== null ? 'reply' : 'invalid', value});
      });
    });
    req.on('timeout', () => req.destroy(new Error('TIMEOUT')));
    req.on('error', () => done({kind: 'failed', value: null}));
  });
}
function tcpOpen(port, timeoutMs = 500) {
  return new Promise(resolve => {
    const socket = net.createConnection({host: '127.0.0.1', port});
    let done = false;
    const finish = value => {if (!done) {done = true; socket.destroy(); resolve(value);}};
    socket.setTimeout(timeoutMs, () => finish(false));
    socket.on('connect', () => finish(true));
    socket.on('error', () => finish(false));
  });
}
function readEdgePort() {
  try {
    const firstLine = fs.readFileSync(path.join(EDGE_PROFILE, 'DevToolsActivePort'), 'utf8').split(/\r?\n/, 1)[0];
    if (!/^\d{2,5}$/.test(firstLine)) return null;
    const n = Number(firstLine);
    return n >= 1024 && n <= 65535 ? n : null;
  } catch {return null;}
}
function qualifiedReceiverHealth(data) {
  return data !== null && typeof data === 'object' && !Array.isArray(data) &&
    data.status === 'SHADOW_STRUCTURE_ONLY' &&
    data.merchantVerified === false && data.coverageVerified === false &&
    typeof data.stale === 'boolean' &&
    Number.isSafeInteger(data.received) && data.received >= 0 &&
    (data.ageMs === null || Number.isFinite(data.ageMs) && data.ageMs >= 0);
}
function scopedEdgeTabs(data) {
  // Never return tab IDs, URLs, target WebSocket tokens, titles or customer text.
  return Array.isArray(data) && data.some(t => t && t.type === 'page' &&
    typeof t.url === 'string' && t.url === EXPEDITION);
}
function verifyReceiverHash() {
  try {
    const code = fs.readFileSync(RECEIVER);
    const expected = createHash('sha256').update(code).digest('hex');
    return expected === EXPECTED_SHA256;
  } catch {return false;}
}
function atomicStatus(doc) {
  // Bounded, PII-free, no order IDs or full URLs; no logs in visible windows.
  const sanitized = {
    schema: SCHEMA, checkedAtUtc: new Date().toISOString(), host: HOST,
    state: doc.state, edgeCdpReachable: Boolean(doc.edgeCdpReachable),
    expeditionPagePresent: Boolean(doc.expeditionPagePresent),
    receiverHealthResponded: Boolean(doc.receiverHealthResponded),
    receiverSourceStale: doc.receiverSourceStale === null ? null : Boolean(doc.receiverSourceStale),
    receiverActions: doc.receiverActions, receiverManaged: Boolean(doc.receiverManaged),
    readOnlyGestor: true, liveOrderFeedProven: false,
    printAuthorized: false, productionOrderEventsPublished: 0,
  };
  try {
    const tmp = STATUS_FILE + '.writing';
    fs.writeFileSync(tmp, JSON.stringify(sanitized), {encoding: 'utf8', mode: 0o600});
    fs.renameSync(tmp, STATUS_FILE);
  } catch { /* Observability failure must not affect cashier or Edge. */ }
  return sanitized;
}
function createSupervisor({receiverHealth = () => httpJson(PORT, '/health'),
                           portOpen = () => tcpOpen(PORT),
                           edgePort = readEdgePort,
                           edgeTabs = port => httpJson(port, '/json/list'),
                           hashOk = verifyReceiverHash,
                           spawnReceiver = () => spawn(process.execPath, [RECEIVER],
                             {windowsHide: true, stdio: 'ignore', detached: false}),
                           clock = () => Date.now(),
                           publish = atomicStatus} = {}) {
  let child = null;
  let startedAt = -Infinity;
  let consecutiveUnresponsive = 0;
  let actions = 0;
  let inFlight = false;
  async function tick() {
    if (inFlight) return null;
    inFlight = true;
    try {
      const now = clock();
      let cdp = false, expedition = false;
      const port = edgePort();
      if (port !== null) {
        const result = await edgeTabs(port);
        cdp = result.kind === 'reply' && Array.isArray(result.value);
        expedition = cdp && scopedEdgeTabs(result.value);
      }
      const reply = await receiverHealth();
      const valid = reply.kind === 'reply' && qualifiedReceiverHealth(reply.value);
      let state = SAFE_STATE.RECEIVER_DOWN;
      let stale = null;
      if (valid) {
        consecutiveUnresponsive = 0;
        stale = reply.value.stale;
        state = stale ? SAFE_STATE.STRUCTURE_ONLY_STALE : SAFE_STATE.STRUCTURE_ONLY_CURRENT;
      } else {
        const occupied = await portOpen();
        if (occupied) {
          // A foreign port or hung receiver must not be killed blindly.
          if (child && child.exitCode === null && child.signalCode === null) {
            consecutiveUnresponsive += 1;
            if (consecutiveUnresponsive >= 3 && now - startedAt >= RETRY_MS) {
              try {child.kill();} catch { /* Only our child is targetable. */ }
            }
          }
          state = SAFE_STATE.PORT_UNTRUSTED;
        } else if (child && child.exitCode === null && child.signalCode === null) {
          // No listening socket, but our child still exists: never create a
          // duplicate. After its startup grace window, stop only our child.
          if (now - startedAt >= RETRY_MS) {
            try {child.kill();} catch { /* only child we own */ }
          }
        } else if (now - startedAt >= RETRY_MS) {
          if (!hashOk()) state = SAFE_STATE.HASH_MISMATCH;
          else {
            try {
              child = spawnReceiver();
              if (!child || !Number.isInteger(child.pid)) throw Error('NO_CHILD');
              if (typeof child.on === 'function') child.on('error', () => {});
              startedAt = now;
              actions += 1;
              state = SAFE_STATE.RECEIVER_RECOVERING;
            } catch { state = SAFE_STATE.RECEIVER_DOWN; }
          }
        }
      }
      return publish({state, edgeCdpReachable: cdp, expeditionPagePresent: expedition,
        receiverHealthResponded: valid, receiverSourceStale: stale,
        receiverActions: actions, receiverManaged: Boolean(child)});
    } finally {inFlight = false;}
  }
  function stop() { if (child && child.exitCode === null && child.signalCode === null) {
    try {child.kill();} catch { /* own child only */ }
  }}
  return Object.freeze({tick, stop});
}
async function main() {
  if (process.platform !== 'win32' || process.env.COMPUTERNAME !== HOST ||
    String(process.env.USERNAME || '').toUpperCase() !== 'SYSTEM') {
    process.exitCode = 30; return;
  }
  const supervisor = createSupervisor();
  let busy = false;
  async function check() {if (busy) return;busy = true;try {await supervisor.tick();} finally {busy = false;}}
  await check();
  const interval = setInterval(() => {void check().catch(() => { /* never crash UI */ });}, INTERVAL_MS);
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
    clearInterval(interval);supervisor.stop();process.exit(0);
  });
}
if (require.main === module) void main().catch(() => {process.exitCode = 31;});
module.exports = Object.freeze({SCHEMA, SAFE_STATE, qualifiedReceiverHealth,
  scopedEdgeTabs, createSupervisor});
