'use strict';
// PR #135 / Stage 3: counterexamples for SQL JOIN cardinality under TOP(201).
// Fully fictional tables. This is NOT a SQL Server optimizer, catalog,
// execution plan, live rowset, unique constraint, or permission to publish.
// Reuse the actual reviewed private assembler and its fail-closed contract.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {build}=require('./comandas_reader_native_note_rowset_v1_review_only.cjs');
const sql=fs.readFileSync(path.join(__dirname,
 'comandas_reader_one_order_serializable_REVIEW_ONLY.sql'),'utf8');
const strip=x=>x.replace(/\/\*[\s\S]*?\*\//g,' ').replace(/--[^\r\n]*/g,' ');
const query=strip(sql);
const expectedCols=['c.CDFILIAL','c.CDLOJA','c.NRVENDAREST','c.NRCOMANDA',
 'c.NRCOMANDAEXT','c.IDORGCMDVENDA','c.IDSTCOMANDA','v.DTHRABERMESA',
 'i.NRPRODCOMVEN','i.CDPRODUTO','p.CDARVPROD','i.QTPRODCOMVEN',
 'i.IDSTPRCOMVEN','c.DSOBSCOMANDA','i.DSOBSDESCIT',
 'i.DSOBSPEDDIGCMD','i.TXPRODCOMVEN'];
const header=()=>({
 CDFILIAL:'0001',CDLOJA:'01',NRVENDAREST:'LABSALE',
 NRCOMANDA:'LABCMD',NRCOMANDAEXT:'1234',IDORGCMDVENDA:'DLV_IFO',
 IDSTCOMANDA:'3',DSOBSCOMANDA:'FICTICIO'
});
const sale=()=>({CDFILIAL:'0001',CDLOJA:'01',NRVENDAREST:'LABSALE',
 DTHRABERMESA:'2026-11-04T18:30:00.0000000'});
const item=(line,cd='LABPROD')=>({CDFILIAL:'0001',CDLOJA:'01',
 NRVENDAREST:'LABSALE',NRCOMANDA:'LABCMD',NRPRODCOMVEN:String(line).padStart(6,'0'),
 CDPRODUTO:cd,QTPRODCOMVEN:'1.000',IDSTPRCOMVEN:'4',
 DSOBSDESCIT:null,DSOBSPEDDIGCMD:null,TXPRODCOMVEN:null});
const product=(cd='LABPROD',tree='9200001000')=>({CDPRODUTO:cd,CDARVPROD:tree});
const model=(opts={})=>({
 headers:opts.headers??[header()],
 sales:opts.sales??[sale()],
 items:opts.items??[item(1),item(2,'LABPROD2')],
 products:opts.products??[product(),product('LABPROD2','9200002000')]
});
// Simulates equijoin cardinality only; never claims to simulate SQL isolation,
// collation, execution order, locks, missing rows between application commits,
// physical reads, or whether an index actually guarantees uniqueness.
function joinFixture(t){
 const out=[];
 for(const c of t.headers){
  if(c.CDFILIAL!=='0001'||c.CDLOJA!=='01'||
     c.IDORGCMDVENDA!=='DLV_IFO'||c.NRVENDAREST!=='LABSALE'||
     c.NRCOMANDA!=='LABCMD')continue;
  const matchingSales=t.sales.filter(v=>v.CDFILIAL===c.CDFILIAL&&
   v.CDLOJA===c.CDLOJA&&v.NRVENDAREST===c.NRVENDAREST);
  const matchingItems=t.items.filter(i=>i.CDFILIAL===c.CDFILIAL&&
   i.CDLOJA===c.CDLOJA&&i.NRVENDAREST===c.NRVENDAREST&&
   i.NRCOMANDA===c.NRCOMANDA);
  for(const v of matchingSales){
   // LEFT JOIN item, LEFT JOIN product; zero items yields a null-extended row.
   for(const i of matchingItems.length?matchingItems:[null]){
    const products=i?t.products.filter(p=>p.CDPRODUTO===i.CDPRODUTO):[];
    for(const p of products.length?products:[null]){
     out.push({
      CDFILIAL:c.CDFILIAL,CDLOJA:c.CDLOJA,
      NRVENDAREST:c.NRVENDAREST,NRCOMANDA:c.NRCOMANDA,
      NRCOMANDAEXT:c.NRCOMANDAEXT,IDORGCMDVENDA:c.IDORGCMDVENDA,
      IDSTCOMANDA:c.IDSTCOMANDA,DTHRABERMESA:v.DTHRABERMESA,
      NRPRODCOMVEN:i?.NRPRODCOMVEN??null,CDPRODUTO:i?.CDPRODUTO??null,
      CDARVPROD:p?.CDARVPROD??null,QTPRODCOMVEN:i?.QTPRODCOMVEN??null,
      IDSTPRCOMVEN:i?.IDSTPRCOMVEN??null,DSOBSCOMANDA:c.DSOBSCOMANDA,
      DSOBSDESCIT:i?.DSOBSDESCIT??null,
      DSOBSPEDDIGCMD:i?.DSOBSPEDDIGCMD??null,
      TXPRODCOMVEN:i?.TXPRODCOMVEN??null
     });
    }
   }
  }
 }
 out.sort((a,b)=>a.NRPRODCOMVEN===b.NRPRODCOMVEN?0:
  a.NRPRODCOMVEN===null?-1:b.NRPRODCOMVEN===null?1:
  a.NRPRODCOMVEN<b.NRPRODCOMVEN?-1:1);
 return out.slice(0,201);
}
const assemble=(t,exhausted=true)=>build({schema:'tata.comandas.native-note-rowset-input.v1',
 source_read_exhausted:exhausted,rows:joinFixture(t)});
const assertHold=(r,why)=>{assert.equal(r.status,'HOLD');assert.equal(r.reason,why);
 assert.equal(r.privateEvent,null);assert.equal(r.printAuthorized,false);
 assert.equal(r.realOrderPublishable,false);
 assert.ok(Object.values(r.effects).every(v=>v===false));};
let n=0;
const test=(name,fn)=>{fn();n++;console.log('PASS '+name)};
test('SQL candidate has exactly 17 projected columns, no more',()=>{
 const m=query.match(/\bSELECT TOP \(201\)([\s\S]*?)\bFROM TEKNISA\.COMANDAVEN AS c/i);
 assert.ok(m);assert.deepEqual(m[1].split(',').map(x=>x.trim()),expectedCols);
});
test('candidate uses two separate LEFT JOINs, not guarantee of one row per item',()=>{
 assert.match(query,/LEFT JOIN TEKNISA\.ITCOMANDAVEN AS i/i);
 assert.match(query,/LEFT JOIN TEKNISA\.PRODUTO AS p/i);
});
test('PRODUCT join only on CDPRODUTO; catalog index prefixes do not prove uniqueness',()=>{
 assert.match(query,/ON p\.CDPRODUTO=i\.CDPRODUTO/i);
});
test('SALE join includes store code, while uniqueness still requires native proof',()=>{
 assert.match(query,/ON v\.CDFILIAL=c\.CDFILIAL\s+AND v\.CDLOJA=c\.CDLOJA\s+AND v\.NRVENDAREST=c\.NRVENDAREST/i);
});
test('ITEM join includes store code and native order key',()=>{
 assert.match(query,/ON i\.CDFILIAL=c\.CDFILIAL\s+AND i\.CDLOJA=c\.CDLOJA\s+AND i\.NRVENDAREST=c\.NRVENDAREST\s+AND i\.NRCOMANDA=c\.NRCOMANDA/i);
});
test('order key includes four native identity components',()=>{
 assert.match(query,/c\.CDFILIAL='0001'/i);
 assert.match(query,/c\.CDLOJA='01'/i);
 assert.match(query,/c\.NRVENDAREST=@nrVendaRest/i);
 assert.match(query,/c\.NRCOMANDA=@nrComanda/i);
});
test('TOP201 is a result-row sentinel, not a native-item count',()=>{
 assert.match(query,/SELECT TOP \(201\)/i);
 assert.match(query,/ORDER BY i\.NRPRODCOMVEN ASC/i);
});
test('two simulated items with one product per key produce only private shadow event',()=>{
 const t=model(),rows=joinFixture(t),r=assemble(t);
 assert.equal(rows.length,2);
 assert.equal(r.status,'PRIVATE_CANONICAL_EVENT_CANDIDATE');
 assert.equal(r.itemsCount,2);assert.equal(r.privateEvent.ready_for_downstream_shadow,false);
 assert.equal(r.printAuthorized,false);assert.equal(r.realOrderPublishable,false);
});
test('duplicated PRODUCT code with different tree multiplies native line',()=>{
 const t=model();t.products.push(product('LABPROD','9200003000'));
 assert.equal(joinFixture(t).length,3);
 assertHold(assemble(t),'NATIVE_ITEM_LINE_KEY_DUPLICATE');
});
test('duplicated PRODUCT rows identical still multiply a native item',()=>{
 const t=model();t.products.push({...t.products[0]});
 assert.equal(joinFixture(t).length,3);
 assertHold(assemble(t),'NATIVE_ITEM_LINE_KEY_DUPLICATE');
});
test('foreign VENDAREST with reused sale key is excluded by exact store join',()=>{
 const t=model();t.sales.push({...sale(),CDLOJA:'02'});
 assert.equal(joinFixture(t).length,2);
 assert.equal(assemble(t).status,'PRIVATE_CANONICAL_EVENT_CANDIDATE');
});
test('only foreign VENDAREST with reused sale key returns no candidate',()=>{
 const t=model({sales:[{...sale(),CDLOJA:'02'}]});
 assert.equal(joinFixture(t).length,0);
 assertHold(assemble(t),'BOUNDED_EXHAUSTED_SOURCE_ROWSET_NOT_SUPPLIED');
});
test('foreign ITCOMANDAVEN item with reused sale and comanda key is excluded',()=>{
 const t=model();t.items.push({...item(3),CDLOJA:'02'});
 assert.equal(joinFixture(t).length,2);
 assert.equal(assemble(t).status,'PRIVATE_CANONICAL_EVENT_CANDIDATE');
});
test('only foreign ITCOMANDAVEN items produce null extended row and HOLD',()=>{
 const t=model({items:[{...item(1),CDLOJA:'02'}]});
 assert.equal(joinFixture(t).length,1);
 assertHold(assemble(t),'NATIVE_SOURCE_COLUMNS_OR_VALUES_UNTRUSTED');
});
test('two VENDAREST rows for same join key multiply every item',()=>{
 const t=model();t.sales.push({...t.sales[0]});
 assert.equal(joinFixture(t).length,4);
 assertHold(assemble(t),'NATIVE_ITEM_LINE_KEY_DUPLICATE');
});
test('two COMANDAVEN rows with same full native key also duplicate output',()=>{
 const t=model();t.headers.push({...t.headers[0]});
 assert.equal(joinFixture(t).length,4);
 assertHold(assemble(t),'NATIVE_ITEM_LINE_KEY_DUPLICATE');
});
test('duplicate item-line identity is rejected even with unique products',()=>{
 const t=model();t.items[1].NRPRODCOMVEN=t.items[0].NRPRODCOMVEN;
 assertHold(assemble(t),'NATIVE_ITEM_LINE_KEY_DUPLICATE');
});
test('missing product routing tree does not pass silently',()=>{
 const t=model();t.products=[product()];
 assert.equal(joinFixture(t).length,2);
 assertHold(assemble(t),'NATIVE_SOURCE_COLUMNS_OR_VALUES_UNTRUSTED');
});
test('zero item LEFT JOIN produces null item fields and cannot become a printable row',()=>{
 const t=model({items:[]});assert.equal(joinFixture(t).length,1);
 assertHold(assemble(t),'NATIVE_SOURCE_COLUMNS_OR_VALUES_UNTRUSTED');
});
test('zero sale matches causes zero rows and no private order',()=>{
 const t=model({sales:[]});assert.equal(joinFixture(t).length,0);
 assertHold(assemble(t),'BOUNDED_EXHAUSTED_SOURCE_ROWSET_NOT_SUPPLIED');
});
test('201 independent items must be treated as bounded truncation',()=>{
 const t=model({items:Array.from({length:201},(_,i)=>item(i+1))});
 assert.equal(joinFixture(t).length,201);
 assertHold(assemble(t),'BOUNDED_EXHAUSTED_SOURCE_ROWSET_NOT_SUPPLIED');
});
test('200 independent items still not independent source authentication',()=>{
 const t=model({items:Array.from({length:200},(_,i)=>item(i+1))});
 const r=assemble(t);
 assert.equal(joinFixture(t).length,200);
 assert.equal(r.status,'PRIVATE_CANONICAL_EVENT_CANDIDATE');
 assert.equal(r.itemsCount,200);assert.equal(r.sourceAuthenticated,false);
 assert.equal(r.realOrderPublishable,false);assert.equal(r.printAuthorized,false);
});
test('200 items with one duplicated product yields 201 output and blocks',()=>{
 const t=model({items:Array.from({length:200},(_,i)=>item(i+1))});
 t.products.push(product('LABPROD','9900009999'));
 assert.equal(joinFixture(t).length,201);
 assertHold(assemble(t),'BOUNDED_EXHAUSTED_SOURCE_ROWSET_NOT_SUPPLIED');
});
test('99 items with a duplicate product make 198 rows and block by native line key',()=>{
 const t=model({items:Array.from({length:99},(_,i)=>item(i+1))});
 t.products.push(product('LABPROD','9900009999'));
 assert.equal(joinFixture(t).length,198);
 assertHold(assemble(t),'NATIVE_ITEM_LINE_KEY_DUPLICATE');
});
test('single item with extra product row can never become two distinct tickets',()=>{
 const t=model({items:[item(1)]});t.products.push(product('LABPROD','9900000001'));
 assertHold(assemble(t),'NATIVE_ITEM_LINE_KEY_DUPLICATE');
});
test('cross sale item with another native key does not enter exact order fixture',()=>{
 const t=model();t.items.push({...item(3),NRVENDAREST:'ANOTHER'});
 assert.equal(joinFixture(t).length,2);
 assert.equal(assemble(t).status,'PRIVATE_CANONICAL_EVENT_CANDIDATE');
});
test('cross command item with same sale does not enter exact command fixture',()=>{
 const t=model();t.items.push({...item(3),NRCOMANDA:'ANOTHER'});
 assert.equal(joinFixture(t).length,2);
 assert.equal(assemble(t).status,'PRIVATE_CANONICAL_EVENT_CANDIDATE');
});
test('cross filial item does not enter Itaim command fixture',()=>{
 const t=model();t.items.push({...item(3),CDFILIAL:'0002'});
 assert.equal(joinFixture(t).length,2);
 assert.equal(assemble(t).status,'PRIVATE_CANONICAL_EVENT_CANDIDATE');
});
test('wrong filial header is rejected at SQL scope of fixture',()=>{
 const t=model();t.headers[0].CDFILIAL='0002';
 assertHold(assemble(t),'BOUNDED_EXHAUSTED_SOURCE_ROWSET_NOT_SUPPLIED');
});
test('wrong iFood native origin is rejected at SQL scope of fixture',()=>{
 const t=model();t.headers[0].IDORGCMDVENDA='DLV_NMO';
 assertHold(assemble(t),'BOUNDED_EXHAUSTED_SOURCE_ROWSET_NOT_SUPPLIED');
});
test('different SALE header timestamps in duplicated join still rejected',()=>{
 const t=model();t.sales.push({...sale(),DTHRABERMESA:'2026-11-04T18:31:00.0000000'});
 assertHold(assemble(t),'NATIVE_HEADER_OR_ORDER_NOTE_NOT_SAME_SNAPSHOT');
});
test('changing header order note across joined rows is not independently proven',()=>{
 const t=model();t.headers.push({...header(),DSOBSCOMANDA:'OTHER'});
 assertHold(assemble(t),'NATIVE_HEADER_OR_ORDER_NOTE_NOT_SAME_SNAPSHOT');
});
test('read exhausted flag self-report false refuses even nominal two rows',()=>{
 assertHold(assemble(model(),false),'BOUNDED_EXHAUSTED_SOURCE_ROWSET_NOT_SUPPLIED');
});
test('read exhausted flag true is still not native transaction proof',()=>{
 const r=assemble(model(),true);
 assert.equal(r.currentSqlSnapshotProven,false);
 assert.equal(r.observationScanIndependentlyProven,false);
 assert.equal(r.realOrderPublishable,false);
});
test('catalog uniqueness for COMANDAVEN, VENDAREST and PRODUTO is still unknown',()=>{
 const r=assemble(model());
 assert.equal(r.sourceAuthenticated,false);
 assert.equal(r.printAuthorized,false);
});
if(n!==35)throw Error('JOIN_CARDINALITY_EXPECTED_35_GOT_'+n);
console.log('COMANDAS_JOIN_CARDINALITY_COUNTEREXAMPLES_PASS '+n+'/'+n+
 ' SYNTHETIC_ONLY_NO_SQL_NO_PRINT_ALWAYS_HOLD');
