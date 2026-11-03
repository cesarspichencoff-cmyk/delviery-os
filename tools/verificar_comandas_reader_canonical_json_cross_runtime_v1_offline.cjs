'use strict';
// PowerShell 5.1 <-> Node JSON.stringify byte/hash parity for invented Reader
// fixtures ONLY. Never run on a cashier host; no SQL, printer or network.
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {snapshotHash}=require('./tata_comanda_reader_native_essentials_v857_offline.cjs');
assert.notEqual(os.hostname().toUpperCase(),'CAIXA_MOOCA','CASHIER_HOST_FORBIDDEN');
const source=path.join(__dirname,'verificar_comandas_reader_canonical_json_v1_fixtures_REVIEW_ONLY.ps1');
const child=spawnSync('powershell.exe',
 ['-NoProfile','-NonInteractive','-WindowStyle','Hidden','-ExecutionPolicy','Bypass','-File',source],
 {encoding:'utf8',windowsHide:true,timeout:25000,maxBuffer:1024*1024});
assert.equal(child.status,0,'POWERSHELL_FIXTURE_RUN_FAILED '+String(child.stderr||'').slice(0,200));
const list=JSON.parse(child.stdout.trim());
const notes={
 no_note:null,ascii:'NO ONION',accent:'SEM ÇEBOLA',apostrophe:"L'IMITADO",
 double_quote:'SEM "CEBOLA"',backslash:'NO\\TEA',slashes:'A/B C/D',
 angle_and_ampersand:'< & >',em_dash:'A—B',emoji:'🍣',
 line_separator:'A\u2028B',paragraph_separator:'A\u2029B',
 combining_mark:'A\u0301B',tab:'A\tB',newline:'A\nB',nul:'A\u0000B'
};
const fields={CDFILIAL:'0001',CDLOJA:'01',NRVENDAREST:'FAKESALE1',NRCOMANDA:'FAKECMD1',
 NRCOMANDAEXT:'1234',IDORGCMDVENDA:'DLV_IFO',IDSTCOMANDA:'3',
 DTHRABERMESA:'2026-11-03T18:20:00.0000000'};
function fixture(note){
 const order={...fields,items:[{NRPRODCOMVEN:'LINE01',CDPRODUTO:'PROD01',
  CDARVPROD:'9200001000',QTPRODCOMVEN:'2.000',IDSTPRCOMVEN:'4'}]};
 if(note!==null)order.observation_rows=[{source_field:'DSOBSPEDDIGCMD',
  value:note,scope_hint:'item',join_proven:true,item_index:0,CDPRODUTO:'PROD01'}];
 return order;
}
let tested=0,highest=0,withNotes=0;
assert.equal(list.length,Object.keys(notes).length,'ALL_CASES_MUST_BE_RUN');
const seen=new Set();
for(const r of list){
 assert.ok(Object.hasOwn(notes,r.case),'UNEXPECTED_CASE');
 assert.ok(!seen.has(r.case),'CASE_DUPLICATED');
 seen.add(r.case);
 const o=fixture(notes[r.case]);
 const expected=JSON.stringify(o);
 const obtained=Buffer.from(r.json_b64,'base64').toString('utf8');
 assert.equal(obtained,expected,'BYTE_MISMATCH_'+r.case);
 const sh=crypto.createHash('sha256').update(obtained,'utf8').digest('hex');
 assert.equal(sh,r.sha,'POWERSHELL_HASH_MISMATCH_'+r.case);
 assert.equal(snapshotHash(o),r.sha,'REPLAY_HASH_MISMATCH_'+r.case);
 assert.match(r.sha,/^[0-9a-f]{64}$/,'DIGEST_CANONICAL');
 if(notes[r.case]!==null)withNotes++;
 highest=Math.max(highest,Buffer.byteLength(obtained));
 tested++;
}
assert.equal(seen.size,16);
console.log(JSON.stringify({schema:'tata.reader.canonical-json-crossruntime-lab.v1',
 status:'POWERSHELL_NODE_CANONICAL_UTF8_HASH_PARITY_PASS',cases:tested,
 cases_with_notes:withNotes,max_json_bytes:highest,
 includes_apostrophe:true,includes_unicode_and_control_escapes:true,
 production_source_authenticated:false,live_orders_examined:0,
 print:false,sql:false,service:false,spooler:false,deploy:false},null,2));
