'use strict';
// Static SQL safety checks only. No DB, network, service or printer executed.
const fs=require('node:fs'),path=require('node:path');
const assert=require('node:assert/strict');
const {review}=require('./comandas_reader_sql_consistency_gate_v1_review_only.cjs');
const template=fs.readFileSync(path.join(__dirname,'comandas_reader_one_order_serializable_REVIEW_ONLY.sql'),'utf8');
const original=fs.readFileSync(path.join(__dirname,'comandas_reader_notes_single_select_v1_REVIEW_ONLY.sql'),'utf8');
const strip=x=>x.replace(/\/\*[\s\S]*?\*\//g,' ').replace(/--[^\r\n]*/g,' ');
const sql=strip(template),old=strip(original);
let n=0;const test=(name,fn)=>{fn();n++;console.log('PASS '+name)};
test('one bounded SELECT only, no SQL write or dynamic execution',()=>{
 assert.equal((sql.match(/\bSELECT\b/ig)||[]).length,1);
 assert.match(sql,/\bSELECT TOP \(201\)\s/i);
 assert.doesNotMatch(sql,/\b(?:INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|MERGE|TRUNCATE|EXEC|EXECUTE|BACKUP|RESTORE)\b/i);
 assert.doesNotMatch(sql,/\b(?:NOLOCK|READUNCOMMITTED|READPAST|OPENROWSET|OPENQUERY)\b/i);
});
test('serializable is isolated per statement with low priority and bounded reader wait',()=>{
 assert.match(sql,/SET TRANSACTION ISOLATION LEVEL SERIALIZABLE\s*;/i);
 assert.match(sql,/SET LOCK_TIMEOUT 100\s*;/i);
 assert.match(sql,/SET DEADLOCK_PRIORITY LOW\s*;/i);
 assert.match(sql,/OPTION \(MAXDOP 1\)\s*;/i);
 assert.doesNotMatch(sql,/\bBEGIN TRAN(?:SACTION)?\b/i);
});
test('mandatory exact Itaim origin and four-part native key',()=>{
 for(const condition of ["c.CDFILIAL='0001'","c.CDLOJA='01'",
  "c.IDORGCMDVENDA='DLV_IFO'","c.NRVENDAREST=@nrVendaRest",
  "c.NRCOMANDA=@nrComanda"])assert.ok(sql.includes(condition),condition);
 assert.doesNotMatch(sql,/LIKE N'DLV/i);
 assert.doesNotMatch(sql,/TOP \(@top\)/i);
});
test('all seventeen original native fields preserved exactly',()=>{
 const columns=['c.CDFILIAL','c.CDLOJA','c.NRVENDAREST','c.NRCOMANDA',
  'c.NRCOMANDAEXT','c.IDORGCMDVENDA','c.IDSTCOMANDA','v.DTHRABERMESA',
  'i.NRPRODCOMVEN','i.CDPRODUTO','p.CDARVPROD','i.QTPRODCOMVEN',
  'i.IDSTPRCOMVEN','c.DSOBSCOMANDA','i.DSOBSDESCIT',
  'i.DSOBSPEDDIGCMD','i.TXPRODCOMVEN'];
 assert.equal(columns.length,17);
 const match=sql.match(/\bSELECT TOP \(201\)([\s\S]*?)\bFROM TEKNISA\.COMANDAVEN/i);
 assert.ok(match,'query projection parse');
 assert.deepEqual(match[1].split(',').map(v=>v.trim()),columns);
 for(const col of columns)assert.ok(old.includes(col),'original SELECT missing '+col);
});
test('joins preserve item-to-order and product routing',()=>{
 for(const name of ['TEKNISA.COMANDAVEN','TEKNISA.VENDAREST',
  'TEKNISA.ITCOMANDAVEN','TEKNISA.PRODUTO'])assert.ok(sql.includes(name));
 for(const name of ['i.NRCOMANDA=c.NRCOMANDA','i.NRVENDAREST=c.NRVENDAREST',
  'i.CDFILIAL=c.CDFILIAL','i.CDLOJA=c.CDLOJA',
  'v.CDLOJA=c.CDLOJA','p.CDPRODUTO=i.CDPRODUTO'])assert.ok(sql.includes(name));
 assert.match(sql,/ORDER BY i\.NRPRODCOMVEN ASC/i);
});
test('VENDAREST and ITCOMANDAVEN both join on native shop code',()=>{
 // Those columns are present in the installed Teknisa INSERT statements.
 // A reused sale and comanda number from another shop must not join Itaim.
 assert.match(sql,/INNER JOIN TEKNISA\.VENDAREST AS v\s+ON v\.CDFILIAL=c\.CDFILIAL\s+AND v\.CDLOJA=c\.CDLOJA\s+AND v\.NRVENDAREST=c\.NRVENDAREST/i);
 assert.match(sql,/LEFT JOIN TEKNISA\.ITCOMANDAVEN AS i\s+ON i\.CDFILIAL=c\.CDFILIAL\s+AND i\.CDLOJA=c\.CDLOJA\s+AND i\.NRVENDAREST=c\.NRVENDAREST\s+AND i\.NRCOMANDA=c\.NRCOMANDA/i);
});
test('native order parameters use exact varchar10 types observed in Itaim SQL catalog',()=>{
 assert.match(template,/COMANDAVEN\.NRVENDAREST is varchar\(10\), NRCOMANDA is varchar\(10\)/);
 assert.match(template,/SqlDbType\.VarChar, Size=10/);
 assert.match(template,/never use\s+SqlDbType\.NVarChar or nvarchar\(64\)/i);
 for(const key of ['c.NRVENDAREST=@nrVendaRest','c.NRCOMANDA=@nrComanda'])assert.ok(sql.includes(key));
});
test('no customer, fiscal or remote action fields are selected',()=>{
 for(const name of ['TELEFONE','CPF','CNPJ','ENDERECO','DSQRCODENFCE',
  'NRPROTOCOLONFCE','spoolsv','msdb','sp_send_dbmail','xp_cmdshell'])
  assert.ok(!sql.toUpperCase().includes(name.toUpperCase()),name);
});
test('existing RCSI-OFF validator retains HOLD on this proposal',()=>{
 const result=review({
  schema:'tata.comandas.reader-sql-consistency-input.v1',
  metadata:{database_name:'teknisa',current_login:'NT SERVICE\\TataComandaReader',
   is_read_committed_snapshot_on:0,snapshot_isolation_state_desc:'OFF'},
  proposal:{statement_count:1,isolation_level:'SERIALIZABLE',target_orders:1,
   uses_nolock:false,reader_host:'CAIXA_MOOCA',unit:'ITAIM',
   source_query_kind:'NATIVE_HEADER_ITEMS_AND_NOTES'}
 });
 assert.equal(result.state,'HOLD');
 assert.equal(result.actualStatementSnapshotProven,false);
 assert.equal(result.ordersPublishable,0);
 assert.equal(result.printAuthorized,false);
 assert.equal(result.eligibleToConsiderSingleStatementSnapshot,false);
});
test('warnings make writer-blocking and plan costs explicit',()=>{
 assert.match(template,/DO NOT EXECUTE against the live Teknisa database/);
 assert.match(template,/can temporarily block POS WRITERS/);
 assert.match(template,/NOT time writers wait for it/);
 assert.match(template,/plan review, rollback, monitoring/);
 assert.match(template,/Result >200 lines or any timeout => HOLD/);
 assert.match(template,/Free-text observations MAY include customer PII/);
 assert.match(template,/SqlDbType\.NVarChar or nvarchar\(64\) here, which risks implicit conversion\/scan/);
});

test('201-row sentinel is rejected by the existing 200-row private assembler',()=>{
 // This is a contract test, not a SQL execution: TOP(201) signals truncation
 // only if ALL 201 rows reach the consumer. Never slice to 200 or claim
 // source_read_exhausted automatically from a successful HTTP/SQL command.
 const {build}=require('./comandas_reader_native_note_rowset_v1_review_only.cjs');
 const sample={
  CDFILIAL:'0001',CDLOJA:'01',NRVENDAREST:'LABSALE',NRCOMANDA:'LABCMD',
  NRCOMANDAEXT:'1234',IDORGCMDVENDA:'DLV_IFO',IDSTCOMANDA:'3',
  DTHRABERMESA:'2026-11-04T12:01:00.0000000',
  NRPRODCOMVEN:'000001',CDPRODUTO:'PROD01',CDARVPROD:'9200001000',
  QTPRODCOMVEN:'1.000',IDSTPRCOMVEN:'4',
  DSOBSCOMANDA:null,DSOBSDESCIT:null,DSOBSPEDDIGCMD:null,
  TXPRODCOMVEN:null
 };
 const input=(count,exhausted)=>({
  schema:'tata.comandas.native-note-rowset-input.v1',
  source_read_exhausted:exhausted,
  rows:Array.from({length:count},(_,i)=>({
   ...sample,NRPRODCOMVEN:String(i+1).padStart(6,'0')
  }))
 });
 const bounded=build(input(200,true));
 assert.equal(bounded.status,'PRIVATE_CANONICAL_EVENT_CANDIDATE');
 assert.equal(bounded.itemsCount,200);
 assert.equal(bounded.realOrderPublishable,false);
 assert.equal(bounded.printAuthorized,false);
 const sentinel=build(input(201,true));
 assert.equal(sentinel.status,'HOLD');
 assert.equal(sentinel.reason,'BOUNDED_EXHAUSTED_SOURCE_ROWSET_NOT_SUPPLIED');
 assert.equal(sentinel.privateEvent,null);
 const nonExhausted=build(input(200,false));
 assert.equal(nonExhausted.status,'HOLD');
 assert.equal(nonExhausted.privateEvent,null);
});

console.log('READER_SERIALIZABLE_ONE_ORDER_STATIC_REVIEW_PASS '+n+'/'+n+' NO_SQL');
// Same existing Reader SQL template: run its strict column/one-JOIN checks
// as part of the already-gated offline CI, without changing workflow permissions.
require('./verificar_comandas_reader_notes_single_select_v1_offline.cjs');
