'use strict';
/**
 * Delivery OS Itaim — observed-demand feed from the EXISTING dedicated Gestor page.
 *
 * This is the executor that was missing, not a second reader: it runs the
 * EXISTING sensor (`scanMountedOrderProps`) inside the EXISTING dedicated Edge
 * page through the loopback DevTools port, validates the result with the
 * EXISTING differential, and writes one bounded local feed file plus an
 * append-only journal. The Home server reads those files.
 *
 * READ-ONLY BY CONSTRUCTION. The only protocol method ever sent is
 * `Runtime.evaluate` of one fixed expression. No click, focus, scroll,
 * navigation, reload, input, storage, cookie, download or provider API call.
 * No child process is ever created, so this process cannot open a window.
 *
 * WHAT THE FEED STATES: which orders were MOUNTED on the expedition view at a
 * local instant, with their lines. It never states full coverage, physical
 * preparation, readiness, dispatch or cancellation. A card that leaves the view
 * is journaled as `left_view`, nothing more. FIXTURE mode cannot produce `real`.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const {createHash} = require('node:crypto');
const {createMountedWindowDifferential} = require('./gestor_mounted_window_differential_v1.cjs');

const SCHEMA = 'deliveryos.gestor-mounted-demand-feed.v1';
const JOURNAL_SCHEMA = 'deliveryos.gestor-mounted-demand-journal.v1';
const SENSOR_SCHEMA = 'deliveryos.gestor-mounted-order-review.v1';
const VERSION = 'gestor-mounted-demand-feed@1';
const HOST = 'CAIXA_MOOCA';
const EXPEDITION = 'https://gestordepedidos.ifood.com.br/#/home/order-display/expedition';
const FIELD_HOSTNAME = 'gestordepedidos.ifood.com.br';
const FIELD_PROFILE = 'C:\\Users\\Tata\\AppData\\Local\\TataGestorObservationLab\\DedicatedEdgeProfile';
const FIELD_OUT = 'C:\\ProgramData\\DeliveryOS-Itaim-Observer\\gestor-demand-v1';
const SENSOR_FILE = path.join(__dirname, 'gestor_v3_visible_sensor.js');
const FEED_FILE = 'gestor-demand-feed-v1.json';
const INTERVAL_MS = 10000;
const EVAL_TIMEOUT_MS = 6000;
const HTTP_TIMEOUT_MS = 1800;
const MAX_LIST_BODY = 262144;
const MAX_FEED_BYTES = 4 * 1024 * 1024;
const MAX_JOURNAL_BYTES = 8 * 1024 * 1024;
const LEFT_RETENTION_MS = 6 * 60 * 60 * 1000;

const sha = x => createHash('sha256').update(x).digest('hex');
const isObject = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const reason = x => (typeof x === 'string' && /^[A-Z0-9_]{1,80}$/.test(x) ? x : 'UNSPECIFIED');

function readEdgePort(profile) {
  try {
    const first = fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split(/\r?\n/, 1)[0];
    if (!/^\d{2,5}$/.test(first)) return null;
    const n = Number(first);
    return n >= 1024 && n <= 65535 ? n : null;
  } catch { return null; }
}
function listTargets(port) {
  return new Promise(resolve => {
    let settled = false;
    const done = v => { if (!settled) { settled = true; resolve(v); } };
    const req = http.get({hostname: '127.0.0.1', port, path: '/json/list',
      headers: {Accept: 'application/json'}, timeout: HTTP_TIMEOUT_MS}, res => {
      let raw = '';
      res.on('data', chunk => {
        raw += chunk.toString();
        if (raw.length > MAX_LIST_BODY) req.destroy(new Error('OVERSIZED'));
      });
      res.on('end', () => {
        let value = null;
        try { value = JSON.parse(raw); } catch { /* not trusted */ }
        done({kind: res.statusCode === 200 && value !== null ? 'reply' : 'invalid', value});
      });
    });
    req.on('timeout', () => req.destroy(new Error('TIMEOUT')));
    req.on('error', () => done({kind: 'failed', value: null}));
  });
}
// The debugger endpoint must be the SAME loopback port we just queried.
function validWsUrl(url, port) {
  return typeof url === 'string' && Number.isInteger(port) &&
    new RegExp('^ws://127\\.0\\.0\\.1:' + port + '/devtools/page/[A-Za-z0-9-]{8,80}$').test(url);
}
/**
 * The page-side expression. The sensor is inlined behind a LOCAL `module`, so
 * its UMD wrapper exports into this closure and defines NO global on the page.
 * The private candidates are copied explicitly: they cross only the loopback
 * DevTools socket into this process, on the same machine.
 */
function buildExpression(sensorSource, sensorMode) {
  if (typeof sensorSource !== 'string' || !sensorSource.includes('scanMountedOrderProps') ||
      !['FIELD_REVIEW', 'FIXTURE'].includes(sensorMode)) throw Error('INVALID_SENSOR_EXPRESSION_INPUT');
  return '(function(){"use strict";var module={exports:{}};\n' + sensorSource +
    '\n;var r=module.exports.scanMountedOrderProps(document,{mode:' + JSON.stringify(sensorMode) + '});' +
    'var o={};for(var k in r){o[k]=r[k];}' +
    'o.privateCandidates=r.privateCandidates||null;' +
    'o.page={visibilityState:String(document.visibilityState),readyState:String(document.readyState),' +
    'hostname:String(location.hostname)};return o;})()';
}
function evaluateOverCdp(wsUrl, expression, timeoutMs = EVAL_TIMEOUT_MS) {
  return new Promise(resolve => {
    let settled = false, socket = null;
    const done = v => {
      if (settled) return;
      settled = true; clearTimeout(timer);
      try { if (socket) socket.close(); } catch { /* already closed */ }
      resolve(v);
    };
    const timer = setTimeout(() => done({kind: 'timeout'}), timeoutMs);
    try { socket = new WebSocket(wsUrl); } catch { done({kind: 'connect_failed'}); return; }
    socket.addEventListener('open', () => {
      try {
        socket.send(JSON.stringify({id: 1, method: 'Runtime.evaluate', params: {expression,
          returnByValue: true, awaitPromise: false, userGesture: false, silent: true,
          includeCommandLineAPI: false, timeout: 4000}}));
      } catch { done({kind: 'send_failed'}); }
    });
    socket.addEventListener('message', event => {
      let message = null;
      try { message = JSON.parse(typeof event.data === 'string' ? event.data : ''); } catch { return; }
      if (!isObject(message) || message.id !== 1) return;
      const result = message.result;
      if (message.error || !isObject(result) || result.exceptionDetails ||
          !isObject(result.result) || result.result.type !== 'object' || !isObject(result.result.value))
        return done({kind: 'evaluate_failed'});
      done({kind: 'value', value: result.result.value});
    });
    socket.addEventListener('error', () => done({kind: 'connect_failed'}));
    socket.addEventListener('close', () => done({kind: 'closed'}));
  });
}
// A wall time without an explicit zone would be read in the host's zone.
function explicitInstant(x) {
  if (typeof x !== 'string' || !/(?:Z|[+-]\d\d:\d\d)$/.test(x)) return null;
  const t = Date.parse(x);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}
/**
 * Private candidates -> feed orders. Shapes were validated by the sensor and
 * by the differential; this keeps only what the Home may show. The revision
 * digest covers the same content the differential fingerprints.
 */
function toOrders(candidates) {
  return candidates.map(c => {
    const content = c.items.map(i => [i.name, i.quantity, i.observations, i.externalCode ?? null,
      i.options.map(o => [o.name, o.quantity])]);
    return {
      ref: sha('deliveryos.gestor.order|' + c.merchantId + '|' + c.id).slice(0, 32),
      short_code: c.shortCode,
      placed_at: explicitInstant(c.placedAt),
      status_claim: c.statusClaim ?? null,
      revision: sha(JSON.stringify([c.shortCode, c.placedAt ?? null, c.statusClaim ?? null, content])),
      items: c.items.map(i => ({
        name: i.name, quantity: i.quantity,
        note: i.observations.trim() === '' ? null : i.observations.trim(),
        options: i.options.map(o => ({name: o.name, quantity: o.quantity})),
        external_code: i.externalCode ?? null,
      })),
    };
  });
}

function createDemandFeed({mode, pageUrl = null, edgePort, targets = listTargets, evaluate,
                           clock = () => Date.now(), writeFeed, appendJournal = () => {},
                           previous = null, sensorSha = null, intervalMs = INTERVAL_MS}) {
  if (mode !== 'FIELD' && mode !== 'FIXTURE') throw Error('INVALID_FEED_MODE');
  if (mode === 'FIXTURE' && !/^http:\/\/127\.0\.0\.1:\d{2,5}\/[A-Za-z0-9._/-]{0,120}$/.test(String(pageUrl)))
    throw Error('FIXTURE_PAGE_URL_INVALID');
  // Fixed by mode, never by a caller-supplied label: a lab page cannot be `real`.
  const sourceMode = mode === 'FIELD' ? 'real' : 'simulated';
  const expectedUrl = mode === 'FIELD' ? EXPEDITION : pageUrl;
  const expectedHostname = mode === 'FIELD' ? FIELD_HOSTNAME : '127.0.0.1';
  const differential = createMountedWindowDifferential({maxLocalAgeMs: 60000});
  const known = new Map();
  const startedAt = new Date(clock()).toISOString();
  let merchantRef = null, sequence = 0, lastWindow = null, contentChangedAt = null;
  let holding = null, consecutiveFailures = 0, writeFailures = 0, announced = false, busy = false;

  // Restart continuity: an order already journaled as seen is not "new" again.
  if (isObject(previous) && previous.schema === SCHEMA && previous.source_mode === sourceMode) {
    if (Number.isSafeInteger(previous.sequence) && previous.sequence >= 0) sequence = previous.sequence;
    if (isObject(previous.scope) && /^[a-f0-9]{32}$/.test(String(previous.scope.merchant_ref)))
      merchantRef = previous.scope.merchant_ref;
    if (isObject(previous.window) && Array.isArray(previous.window.orders)) {
      for (const o of previous.window.orders) {
        if (!isObject(o) || !/^[a-f0-9]{32}$/.test(String(o.ref)) || !/^[a-f0-9]{64}$/.test(String(o.revision)) ||
            !Number.isSafeInteger(o.revision_no) || o.revision_no < 1 ||
            explicitInstant(o.first_seen_at) === null || explicitInstant(o.revised_at) === null) continue;
        known.set(o.ref, {first_seen_at: o.first_seen_at, revision: o.revision, revision_no: o.revision_no,
          revised_at: o.revised_at, in_view: true, left_at: null});
      }
      lastWindow = previous.window;
      contentChangedAt = explicitInstant(previous.window.content_changed_at);
    }
  }

  function accept(candidates, scan, now, iso, lines) {
    const orders = toOrders(candidates), seen = new Set();
    let changed = false;
    for (const o of orders) {
      seen.add(o.ref);
      const k = known.get(o.ref);
      const line = kind => ({k: kind, t: iso, ref: o.ref, short_code: o.short_code, revision: o.revision});
      if (!k) {
        known.set(o.ref, {first_seen_at: iso, revision: o.revision, revision_no: 1, revised_at: iso,
          in_view: true, left_at: null});
        lines.push({...line('seen'), revision_no: 1}); changed = true; continue;
      }
      if (!k.in_view) { k.in_view = true; k.left_at = null; lines.push(line('back_in_view')); changed = true; }
      if (k.revision !== o.revision) {
        k.revision = o.revision; k.revision_no += 1; k.revised_at = iso;
        lines.push({...line('revised'), revision_no: k.revision_no}); changed = true;
      }
    }
    for (const [ref, k] of known) {
      // Leaving the view is NOT a cancellation, a dispatch or a conclusion.
      if (k.in_view && !seen.has(ref)) { k.in_view = false; k.left_at = now; lines.push({k: 'left_view', t: iso, ref}); changed = true; }
      else if (!k.in_view && k.left_at !== null && now - k.left_at > LEFT_RETENTION_MS) known.delete(ref);
    }
    if (changed || contentChangedAt === null) contentChangedAt = iso;
    lastWindow = {
      observed_at: iso, content_changed_at: contentChangedAt,
      visible_cards: scan.visibleCards, lines: scan.candidateLines, units: scan.candidateUnits,
      notes: scan.candidateDirectNotes, options: scan.candidateOptions, codes: scan.candidateCodes,
      orders: orders.map(o => {
        const k = known.get(o.ref);
        return {...o, first_seen_at: k.first_seen_at, revision_no: k.revision_no, revised_at: k.revised_at};
      }),
    };
  }

  async function tick() {
    if (busy) return null;
    busy = true;
    try {
      const now = clock(), iso = new Date(now).toISOString(), lines = [];
      const edge = {cdp_reachable: false, expedition_page_present: false, page_visibility: null, document_ready: null};
      let hold = null, scan = null;
      if (!announced) { announced = true; lines.push({k: 'start', t: iso, restored_orders: known.size}); }
      try {
        const port = edgePort();
        if (port === null) hold = 'EDGE_DEVTOOLS_PORT_UNREADABLE';
        else {
          const tabs = await targets(port);
          if (!isObject(tabs) || tabs.kind !== 'reply' || !Array.isArray(tabs.value)) hold = 'EDGE_DEVTOOLS_NOT_REACHABLE';
          else {
            edge.cdp_reachable = true;
            const pages = tabs.value.filter(t => isObject(t) && t.type === 'page' && t.url === expectedUrl);
            if (pages.length === 0) hold = 'EXPEDITION_PAGE_NOT_FOUND';
            else if (pages.length > 1) hold = 'MULTIPLE_EXPEDITION_PAGES';
            else if (!validWsUrl(pages[0].webSocketDebuggerUrl, port)) hold = 'DEVTOOLS_ENDPOINT_NOT_LOOPBACK';
            else {
              edge.expedition_page_present = true;
              const r = await evaluate(pages[0].webSocketDebuggerUrl);
              if (!isObject(r) || r.kind !== 'value') hold = 'CDP_EVALUATE_' + reason(String(r && r.kind).toUpperCase());
              else scan = r.value;
            }
          }
        }
        if (scan !== null) {
          const page = isObject(scan) ? scan.page : null;
          if (!isObject(scan) || scan.schema !== SENSOR_SCHEMA || !isObject(page)) hold = 'SENSOR_RESULT_MALFORMED';
          else {
            edge.page_visibility = ['visible', 'hidden'].includes(page.visibilityState) ? page.visibilityState : null;
            edge.document_ready = ['loading', 'interactive', 'complete'].includes(page.readyState) ? page.readyState : null;
            if (page.hostname !== expectedHostname) hold = 'PAGE_HOSTNAME_NOT_EXPECTED';
            else if (scan.state !== 'PRIVATE_REVIEW_ONLY') hold = 'SENSOR_' + reason(scan.reason);
            else {
              const candidates = Array.isArray(scan.privateCandidates) ? scan.privateCandidates : null;
              const review = {};
              for (const k of Object.keys(scan)) if (k !== 'privateCandidates' && k !== 'page') review[k] = scan[k];
              Object.defineProperty(review, 'privateCandidates', {value: candidates, enumerable: false});
              const diff = differential.review(review, now);
              if (diff.state !== 'PRIVATE_DIFFERENTIAL_REVIEW_ONLY') hold = 'DIFFERENTIAL_' + reason(diff.reason);
              else {
                const ref = sha('deliveryos.gestor.merchant|' + candidates[0].merchantId).slice(0, 32);
                // A different merchant on the same screen never continues silently.
                if (merchantRef !== null && merchantRef !== ref) hold = 'MERCHANT_CHANGED_REQUIRES_NEW_REVIEW_CONTEXT';
                else { merchantRef = ref; accept(candidates, scan, now, iso, lines); }
              }
            }
          }
        }
      } catch { hold = 'RUNNER_EXCEPTION'; }

      if (hold !== null) {
        consecutiveFailures += 1;
        if (holding !== hold) { lines.push({k: 'hold', t: iso, reason: hold}); holding = hold; }
      } else {
        if (holding !== null) lines.push({k: 'resume', t: iso});
        holding = null; consecutiveFailures = 0;
      }
      sequence += 1;
      // On HOLD the last qualified window stays, with its OLD `observed_at`:
      // the reader ages it out. Absence is never written as an empty window.
      const doc = {
        schema: SCHEMA, version: VERSION, written_at: iso, sequence, source_mode: sourceMode,
        runner: {started_at: startedAt, sensor_sha256: sensorSha, interval_ms: intervalMs,
          write_failures: writeFailures},
        scope: {unit: 'ITAIM', merchant_ref: merchantRef},
        edge,
        scan: hold === null ? {state: 'OBSERVED', reason: null} : {state: 'HOLD', reason: hold},
        window: lastWindow,
        consecutive_failures: consecutiveFailures,
        coverage: 'MOUNTED_CARDS_ONLY', physical_state_claimed: false,
        disappearance_means_cancellation: false, customer_data_exported: false, actions_executed: 0,
      };
      try { writeFeed(doc); } catch { writeFailures += 1; }
      for (const line of lines) {
        try { appendJournal({schema: JOURNAL_SCHEMA, seq: sequence, ...line}); } catch { /* journal is best effort */ }
      }
      return doc;
    } finally { busy = false; }
  }
  return Object.freeze({tick});
}

/* ----------------------------- process boundary ----------------------------- */

function parseArgs(argv) {
  const out = {fixture: false, once: false, profile: null, out: null, pageUrl: null, intervalMs: INTERVAL_MS};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], next = () => (i + 1 < argv.length ? argv[++i] : null);
    if (a === '--fixture') out.fixture = true;
    else if (a === '--once') out.once = true;
    else if (a === '--profile') out.profile = next();
    else if (a === '--out') out.out = next();
    else if (a === '--page-url') out.pageUrl = next();
    else if (a === '--interval-ms') out.intervalMs = Number(next());
    else return null;
  }
  if (!Number.isSafeInteger(out.intervalMs) || out.intervalMs < 2000 || out.intervalMs > 60000) return null;
  // The lab flags exist ONLY together with --fixture. FIELD takes no path from argv.
  if (!out.fixture && (out.profile !== null || out.out !== null || out.pageUrl !== null)) return null;
  if (out.fixture && ![out.profile, out.out].every(p => typeof p === 'string' && path.isAbsolute(p))) return null;
  return out;
}
function isSystemAccount() {
  // %USERNAME% under LocalSystem is `<MACHINE>$`; the account name is "SYSTEM".
  try { return String(os.userInfo().username).toUpperCase() === 'SYSTEM'; } catch { return false; }
}
function fileIo(outDir) {
  const feedPath = path.join(outDir, FEED_FILE);
  return {
    previous() {
      try {
        const st = fs.lstatSync(feedPath);
        if (!st.isFile() || st.isSymbolicLink() || st.size > MAX_FEED_BYTES) return null;
        return JSON.parse(fs.readFileSync(feedPath, 'utf8'));
      } catch { return null; }
    },
    writeFeed(doc) {
      const tmp = feedPath + '.writing';
      fs.writeFileSync(tmp, JSON.stringify(doc), {encoding: 'utf8', mode: 0o600});
      fs.renameSync(tmp, feedPath);
    },
    appendJournal(line) {
      const file = path.join(outDir, 'journal-' + String(line.t).slice(0, 10).replace(/-/g, '') + '.jsonl');
      let size = 0;
      try { size = fs.statSync(file).size; } catch { /* first line of the day */ }
      if (size > MAX_JOURNAL_BYTES) return;
      fs.appendFileSync(file, JSON.stringify(line) + '\n', {encoding: 'utf8', mode: 0o600});
    },
  };
}
async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args === null) { process.exitCode = 64; return; }
  if (typeof WebSocket !== 'function') { process.exitCode = 69; return; }
  let mode = 'FIXTURE', profile = args.profile, outDir = args.out;
  if (!args.fixture) {
    // FIELD: only the cashier, only as the non-interactive SYSTEM account.
    if (process.platform !== 'win32' || process.env.COMPUTERNAME !== HOST || !isSystemAccount()) {
      process.exitCode = 30; return;
    }
    mode = 'FIELD'; profile = FIELD_PROFILE; outDir = FIELD_OUT;
  }
  let sensorSource;
  try { sensorSource = fs.readFileSync(SENSOR_FILE, 'utf8'); fs.mkdirSync(outDir, {recursive: true}); }
  catch { process.exitCode = 66; return; }
  const expression = buildExpression(sensorSource, mode === 'FIELD' ? 'FIELD_REVIEW' : 'FIXTURE');
  const io = fileIo(outDir);
  const feed = createDemandFeed({mode, pageUrl: args.pageUrl, intervalMs: args.intervalMs,
    edgePort: () => readEdgePort(profile), evaluate: url => evaluateOverCdp(url, expression),
    writeFeed: io.writeFeed, appendJournal: io.appendJournal, previous: io.previous(),
    sensorSha: sha(sensorSource)});
  const check = () => feed.tick().catch(() => { /* never crash the cashier */ });
  await check();
  if (args.once) return;
  const interval = setInterval(() => { void check(); }, args.intervalMs);
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { clearInterval(interval); process.exit(0); });
}
if (require.main === module) void main().catch(() => { process.exitCode = 31; });
module.exports = Object.freeze({SCHEMA, JOURNAL_SCHEMA, VERSION, EXPEDITION, FEED_FILE,
  buildExpression, validWsUrl, toOrders, createDemandFeed, parseArgs});
