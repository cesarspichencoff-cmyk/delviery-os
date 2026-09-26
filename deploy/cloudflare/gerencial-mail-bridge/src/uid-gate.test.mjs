import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { selectDualSinkMailboxUids } from './uid-gate.js';

test('705-709 known in both sinks are skipped', async () => {
  const known = ['705', '706', '707', '708', '709'];
  const result = await selectDualSinkMailboxUids({
    candidateUids: known,
    loadKnownPrimary: async () => known,
    loadKnownMirror: async () => known,
  });
  assert.deepEqual(result, {
    known,
    unknown: [],
    divergent: [],
  });
});

test('one-sink-only UID is reprocessed for repair', async () => {
  const result = await selectDualSinkMailboxUids({
    candidateUids: [708, 709, 710],
    loadKnownPrimary: async () => ['708', '709'],
    loadKnownMirror: async () => ['709'],
  });
  assert.deepEqual(result.known, ['709']);
  assert.deepEqual(result.unknown, ['708', '710']);
  assert.deepEqual(result.divergent, ['708']);
});

test('mirror-only UID is also reprocessed for repair', async () => {
  const result = await selectDualSinkMailboxUids({
    candidateUids: [711],
    loadKnownPrimary: async () => [],
    loadKnownMirror: async () => ['711'],
  });
  assert.deepEqual(result.unknown, ['711']);
  assert.deepEqual(result.divergent, ['711']);
});

test('lookup failure fails before any BODY.PEEK path can be selected', async () => {
  let mirrorCalls = 0;
  await assert.rejects(() => selectDualSinkMailboxUids({
    candidateUids: [712],
    loadKnownPrimary: async () => {
      throw new Error('D1_LOOKUP_FAILED');
    },
    loadKnownMirror: async () => {
      mirrorCalls += 1;
      return [];
    },
  }), /D1_LOOKUP_FAILED/);
  assert.equal(mirrorCalls, 0);
});
test('malformed UIDs fail before persistence lookups', async () => {
  let calls = 0;
  await assert.rejects(() => selectDualSinkMailboxUids({
    candidateUids: ['709 OR 1=1'],
    loadKnownPrimary: async () => {
      calls += 1;
      return [];
    },
    loadKnownMirror: async () => {
      calls += 1;
      return [];
    },
  }), /INVALID_MAILBOX_UID/);
  assert.equal(calls, 0);
});

test('runIngestion gates UIDs before its first BODY.PEEK', () => {
  const source = readFileSync(new URL('./index.js', import.meta.url), 'utf8');
  const ingestion = source.slice(source.indexOf('async function runIngestion'));
  const gateCall = ingestion.indexOf('const gate = await selectDualSinkMailboxUids');
  const gatedLoop = ingestion.indexOf('for (const uid of gate.unknown)');
  const firstPeek = ingestion.indexOf('BODY.PEEK[HEADER.FIELDS');
  assert.ok(gateCall >= 0);
  assert.ok(gatedLoop > gateCall);
  assert.ok(firstPeek > gatedLoop);
});
