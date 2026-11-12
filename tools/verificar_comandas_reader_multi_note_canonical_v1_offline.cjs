'use strict';
// Two-item, three-note PowerShell-native Reader fingerprint integration lab.
// The Reader source and iFood relationship remain UNAUTHENTICATED.
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {build}=require('./comandas_reader_native_note_rowset_v1_review_only.cjs');
const {snapshotHash}=require('./tata_comanda_reader_native_essentials_v857_offline.cjs');
assert.notEqual(os.hostname().toUpperCase(),'CAIXA_MOOCA','NO_SHELL_ON_CASHIER');
const head={CDFILIAL:'0001',CDLOJA:'01',NRVENDAREST:'TESTSALE',
 NRCOMANDA:'TESTCMD',NRCOMANDAEXT:'1234',IDORGCMDVENDA:'DLV_IFO',
 IDSTCOMANDA:'3',DTHRABERMESA:'2026-11-03T18:30:00.0000000'};
const rows=[
 {...head,NRPRODCOMVEN:'LINE01',CDPRODUTO:'PROD01',CDARVPROD:'9200001000',
  QTPRODCOMVEN:'2.000',IDSTPRCOMVEN:'4',DSOBSCOMANDA:'TESTE FICTICIO',
  DSOBSDESCIT:null,DSOBSPEDDIGCMD:'SEM CEBOLINHA',TXPRODCOMVEN:null},
 {...head,NRPRODCOMVEN:'LINE02',CDPRODUTO:'PROD02',CDARVPROD:'9200002000',
  QTPRODCOMVEN:'1.000',IDSTPRCOMVEN:'4',DSOBSCOMANDA:'TESTE FICTICIO',
  DSOBSDESCIT:null,DSOBSPEDDIGCMD:null,TXPRODCOMVEN:"L'IMITADO"}
];
const prepared=build({schema:'tata.comandas.native-note-rowset-input.v1',
 source_read_exhausted:true,rows});
assert.equal(prepared.status,'PRIVATE_CANONICAL_EVENT_CANDIDATE');
assert.equal(prepared.itemsCount,2);
assert.equal(prepared.notesCount,3);
assert.equal(prepared.sourceAuthenticated,false);
assert.equal(prepared.printAuthorized,false);
const order=prepared.privateEvent.order;
assert.equal(order.observation_scan_complete,true);
const basis={};
for(const k of ['CDFILIAL','CDLOJA','NRVENDAREST','NRCOMANDA',
 'NRCOMANDAEXT','IDORGCMDVENDA','IDSTCOMANDA','DTHRABERMESA'])basis[k]=order[k];
basis.items=order.items.map(i=>{
 const x={};for(const k of ['NRPRODCOMVEN','CDPRODUTO','CDARVPROD',
  'QTPRODCOMVEN','IDSTPRCOMVEN'])x[k]=i[k];return x;
});
basis.observation_rows=order.observation_rows;
const expected=JSON.stringify(basis);
const script=path.join(__dirname,'verificar_comandas_reader_multi_note_canonical_v1_fixtures_REVIEW_ONLY.ps1');
const ps=spawnSync('powershell.exe',
 ['-NoProfile','-NonInteractive','-WindowStyle','Hidden','-ExecutionPolicy','Bypass','-File',script],
 {windowsHide:true,encoding:'utf8',timeout:25000,maxBuffer:1024*1024});
assert.equal(ps.status,0,'PS_FIXTURE_FAILED '+String(ps.stderr).slice(0,200));
const proof=JSON.parse(ps.stdout.trim());
assert.equal(Buffer.from(proof.canonical_b64,'base64').toString('utf8'),expected,
 'POWERSHELL_NATIVE_BYTES_DIFFER_FROM_REAL_NODE_ASSEMBLER');
const calculated=crypto.createHash('sha256').update(expected,'utf8').digest('hex');
assert.equal(proof.sha256,calculated);
assert.equal(prepared.privateEvent.snapshot_hash,calculated);
assert.equal(snapshotHash(order),calculated);
assert.equal(prepared.privateEvent.ready_for_downstream_shadow,false);
console.log(JSON.stringify({status:'READER_MULTI_NOTE_PS_NODE_CANONICAL_BRIDGE_PASS',
 items:prepared.itemsCount,notes:prepared.notesCount,
 hash_byte_parity:true,includes_apostrophe:true,uses_real_canonical_snapshot_hash:true,
 source_authenticity_proven:false,sql_executed:false,
 orders_publishable:0,prints:0,no_customer_data_in_output:true},null,2));
