'use strict';
// Static contract for the native fixture-only pair adapter. Native evidence is a separate CI job.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const pair=fs.readFileSync(path.join(__dirname,'../../runtime/silent-runner/SnapshotPairAdapter.cs'),'utf8');
const host=fs.readFileSync(path.join(__dirname,'../../runtime/silent-runner/SilentObserverLab.cs'),'utf8');
const win=fs.readFileSync(path.join(__dirname,'verify-windows-fixture.ps1'),'utf8');
let passed=0;
function check(name,ok){assert.ok(ok,name);passed++}
const must=[
  'deliveryos.itaim.automatic-reader-status.v1',
  'tata.gestor.structure-v2','CONTROL_DIAGNOSTIC_NOT_REAL_PROOF',
  'SHADOW_READ_ONLY','STRUCTURE_ONLY_UNVERIFIED',
  'reader-sanitized.fixture.json','gestor-sanitized.fixture.json',
  'CAIXA_MOOCA','ITAIM','fixtureOnly','noActionExecuted',
  'customerDataExported','identifiersCaptured','personalDataCaptured',
  'verifiedMerchant','verifiedCoverage','liveSourceVerified',
  'HOLD_INVALID_PAIR','HOLD_STALE_OR_FUTURE','HOLD_UNPAIRED',
  'HOLD_DIVERGENT_REVISIONS_OR_LINES','HOLD_INVALID_RECORDS',
  'HOLD_NO_PAIR','SYNTHETIC_PAIR_ONLY'
];
for(const marker of must)check('marker '+marker,pair.includes(marker));
check('strict field checks',pair.includes('o.Count!=keys.Length')&&pair.includes('!o.ContainsKey(key)'));
check('no symlink source',pair.includes('FileAttributes.ReparsePoint'));
check('reject timestamp future',pair.includes('rAge>=-5')&&pair.includes('gAge>=-5'));
check('reject timestamp stale',pair.includes('rAge<=120')&&pair.includes('gAge<=120'));
check('bounded source size',pair.includes('info.Length>4096'));
check('bounded fixture array',pair.includes('array.Count>16')&&pair.includes('IList array=value as IList;'));
check('duplicate keys held',pair.includes('rows.ContainsKey(id)'));
check('synthetic labels only',pair.includes('LAB-[0-9]{4}'));
check('no direct operator file paths',!pair.includes('TataGestorObservationLab')&&!pair.includes('DeliveryOS-Edge-Gestor-Itaim'));
check('host integrates fixture pair',host.includes('SnapshotPairAdapter.Evaluate(folder,DateTime.UtcNow)'));
check('real join unproven',host.includes('realReaderJoinProven')&&host.includes('orderIdentityProven'));
check('no publishable output',host.includes('ordersPublishable')&&host.includes('customerFieldsExported'));
check('native fixture compiles pair',win.includes('SnapshotPairAdapter.cs')&&win.includes('System.Web.Extensions.dll'));
check('Windows native test contains pair coverage',win.includes('ONE_SYNTHETIC_PAIR')&&win.includes('DUPLICATE_KEY_HOLD')&&win.includes('STALE_READER_HOLD')&&win.includes('FUTURE_GESTOR_HOLD'));
check('no direct network or browser invocation',!/(HttpClient|WebRequest|Process\.Start|DllImport|msedge\.exe|ifood\.com\.br)/i.test(pair));
check('no secret copying',!/(password|cookie|bearer\s|authorization\s*:)/i.test(pair));
console.log('SILENT_PAIR_CONTRACT_PASS '+passed+'/'+passed+' (STATIC_ONLY)');
