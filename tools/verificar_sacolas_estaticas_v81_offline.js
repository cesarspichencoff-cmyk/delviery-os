'use strict';
/* V8.1: ACTUAL V7.14 subprocess, synthetic exact bag policy in temp files only.
 * The installed candidate and canonical Academy motor remain byte-identical.
 * No historical decision update, SQL, service, network, spooler or print. */
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const crypto=require('node:crypto'),assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const {CASES,N}=require('./comandas-human-review-v1/human_review_v1.cjs');
const {PACKAGING_SOURCE_SHA256_V78}=require('../dist/src/production/currentPackagingBridgeV63.js');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const blob=b=>crypto.createHash('sha1').update(Buffer.concat([Buffer.from('blob '+b.length+'\0'),b])).digest('hex');
const consumerSource=path.join(__dirname,'../runtime/shadow/live_shadow_consumer_v2_candidate_v714.cjs');
const engineSource=path.join(__dirname,'fixtures/canonical-packaging-v63-pinned.js');
const humanSource=path.join(__dirname,'../runtime/shadow/human-validations-cesar-20261014.review.json');
const consumer=fs.readFileSync(consumerSource),motor=fs.readFileSync(engineSource);
const ledger=fs.readFileSync(humanSource);
assert.equal(sha(motor),PACKAGING_SOURCE_SHA256_V78);
// Git checkout on Windows may materialize CRLF. Verify EXACT committed LF
// bytes, allowing ONLY a reversible line-ending normalization (no data edits).
const ledgerCommitBlob='cd30d2039ea9228ff59c7581b0bc1c1f4cbaef98';
const canonicalLedger=Buffer.from(ledger.toString('utf8').replace(/\r\n/g,'\n'));
assert.equal(blob(canonicalLedger),ledgerCommitBlob,'HUMAN_LEDGER_CANONICAL_BLOB_MISMATCH');
const cases=CASES.filter(([id])=>['B1','B5','B8','B9'].includes(id));
assert.equal(cases.length,7);
const human=JSON.parse(ledger).bags,defs=Object.fromEntries(
 Object.entries(N).map(([key,[code,name]])=>[key,{key,code,name}]));
for(const [id,parts,sizes] of cases){
 const r=human.find(x=>x.id===id);
 assert.equal(r?.authority,'HUMAN_CONFIRMATION_2026-10-14');
 assert.equal(r?.print_authorized,false);
 assert.deepEqual(r?.value?.bags,sizes);
 assert.deepEqual(sizes,['M']);
 for(const [key,qty]of parts)assert.ok(defs[key]&&Number.isSafeInteger(qty));
}
const anchor='packEntries.push({ product: { nome: name, classification }, quantity });';
const original=consumer.toString('utf8');
assert.equal(original.split(anchor).length,2,'EXACTLY_ONE_V2_MOTOR_INPUT_ANCHOR');
const future=original.replace(anchor,
 'packEntries.push({ product: { nome: name, classification, canonical_code: code }, quantity });');
const policy=cases.map(([id,parts,bags])=>({id,bags,
  parts:parts.map(([key,qty])=>({code:defs[key].code,name:defs[key].name,qty}))}));
const overlay=[
 '(function(){ "use strict";',
 ' const api=globalThis.TATAPackaging,old=api.packComanda;',
 ' const policies='+JSON.stringify(policy)+';',
 ' const norm=s=>String(s||"").normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").trim().toUpperCase();',
 ' api.packComanda=function(entries){',
 '  const result=old.call(this,entries);',
 '  if(!Array.isArray(entries)||!entries.length)return result;',
 '  const q=new Map();',
 '  for(const item of entries){',
 '   const code=item?.product?.canonical_code,name=item?.product?.nome,qty=item?.quantity;',
 '   if(typeof code!=="string"||typeof name!=="string"||!Number.isSafeInteger(qty)||qty<1)return result;',
 '   const key=code+"|"+norm(name);q.set(key,(q.get(key)||0)+qty);',
 '  }',
 '  const have=[...q.entries()].sort((a,b)=>a[0].localeCompare(b[0]));',
 '  const matches=policies.filter(rule=>{',
 '   const want=rule.parts.map(p=>[p.code+"|"+norm(p.name),p.qty]).sort((a,b)=>a[0].localeCompare(b[0]));',
 '   return JSON.stringify(have)===JSON.stringify(want);',
 '  });',
 '  if(matches.length!==1||!result?.bags)return result;',
 '  return {...result,bags:{...result.bags,size:matches[0].bags[0],size_status:"FACT",',
 '    exact_bag_count:matches[0].bags.length,exact_bag_count_status:"FACT"}};',
 ' };',
 '})();'
].join('\n');
const wrapped=Buffer.concat([motor,Buffer.from('\n'+overlay+'\n')]);
// V8.1's overlay is explicitly SYNTHETIC and must never be granted the
// approved SHA in production. Re-pin only the disposable lab consumer copy;
// the checked-in V7.14 candidate and approved engine remain unchanged.
assert.equal(future.split(PACKAGING_SOURCE_SHA256_V78).length,2);
const labFuture=Buffer.from(future.replace(PACKAGING_SOURCE_SHA256_V78,sha(wrapped)));
const root=fs.mkdtempSync(path.join(os.tmpdir(),'tata-exact-bags-v81-'));
const keys=Object.keys(defs),idFor=Object.fromEntries(keys.map((k,i)=>[k,'T'+String(i).padStart(4,'0')]));
const combo=new Set(['EXEC','KIDS','ESPECIAL_1P']);
const roll=new Set(['TEMAKI','TEMAKI_BARRIGA','HOSSO','URAMAKI_ESP']);
const route=k=>k==='SPRITE'?'00007':roll.has(k)?'00006':'00009';
const classOf=k=>({family:k==='SPRITE'?'bebida':combo.has(k)?'combinado':roll.has(k)?'enrolado':'sashimi',
 station:k==='SPRITE'?'bar_bebidas':roll.has(k)?'enrolados':'combinados',review_required:false});
function configs(){
 return {
  'app-data.json':{products:[]},
  'product-identity-cache-v1.json':{schema:'deliveryos.product-identity-cache.v1',
   rows:keys.map(k=>({CDPRODUTO:idFor[k],canonical:defs[k].code,NMPRODUTO:defs[k].name}))},
  'product-aliases-v1.json':{schema:'deliveryos.academia-live-product-aliases.v1',
   aliases:keys.map(k=>({live_name:defs[k].name,canonical_code:defs[k].code,
    classification:classOf(k)}))},
  'human-order-overrides-v1.json':{schema:'deliveryos.human-exact-order-overrides.v1',orders:[]},
  'routing.json':{schema:'deliveryos.odhen.product-routing.compact.v1',
   products:Object.fromEntries(keys.map(k=>[defs[k].code,[route(k)]]))},
  'printer-map.json':{schema:'deliveryos.runtime-printer-map.v1',
   mappings:['00009','00006','00007'].map(code=>({printer_code:code,
    printer_name:'FICTIONAL_'+code,printer_ip:'0.0.0.0'}))},
  'non-production.json':{items:{}}
 };
}
function create(dir,app,engine){
 fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'consumer.cjs'),app);
 fs.writeFileSync(path.join(dir,'packaging-current.js'),engine);
 for(const [n,data]of Object.entries(configs()))fs.writeFileSync(path.join(dir,n),JSON.stringify(data));
}
const oldDir=path.join(root,'old'),newDir=path.join(root,'new');
function hashOrder(order){
 const h=['CDFILIAL','CDLOJA','NRVENDAREST','NRCOMANDA',
  'NRCOMANDAEXT','IDORGCMDVENDA','IDSTCOMANDA','DTHRABERMESA'];
 const f=['NRPRODCOMVEN','CDPRODUTO','CDARVPROD','QTPRODCOMVEN','IDSTPRCOMVEN'];
 const obj=Object.fromEntries(h.map(k=>[k,order[k]]));
 obj.items=order.items.map(x=>Object.fromEntries(f.map(k=>[k,x[k]])));
 return sha(JSON.stringify(obj));
}
let index=0;
function eventFor(parts){
 const nr=String(++index).padStart(10,'0');
 const order={CDFILIAL:'0001',CDLOJA:'01',NRVENDAREST:nr,NRCOMANDA:nr,
  NRCOMANDAEXT:'TEST_'+nr,IDORGCMDVENDA:'DLV_TEST',IDSTCOMANDA:'A',
  DTHRABERMESA:'2026-10-14T12:00:00.0000000',
  items:parts.map(([k,qty],i)=>({NRPRODCOMVEN:String(i+1).padStart(6,'0'),
   CDPRODUTO:idFor[k],CDARVPROD:defs[k].code.replace(/\./g,''),
   QTPRODCOMVEN:qty+'.000',IDSTPRCOMVEN:'A'})),
  observation_scan_complete:true,observation_rows:[]};
 return {schema:'deliveryos.tata-reader-stable-order-event.v1',
  order_key:['0001','01',nr,nr].join('|'),snapshot_hash:hashOrder(order),
  ready_for_downstream_shadow:true,blockers:[],
  service_resolution:{service:'LUNCH',evidence:'HUMAN_CONFIRMED_RULE',
   source_ref:'FICTIONAL_ONLY',blockers:[]},order};
}
function invoke(dir,event){
 const filename=path.join(root,'fake-'+index+'.json');fs.writeFileSync(filename,JSON.stringify(event));
 const r=spawnSync(process.execPath,[path.join(dir,'consumer.cjs'),filename],
   {encoding:'utf8',timeout:10000,maxBuffer:1024*1024,
    env:{PATH:process.env.PATH||'',GITHUB_ACTIONS:'true',CI:'true',RUNNER_OS:process.platform==='win32'?'Windows':'Linux'}});
 assert.ok([0,5].includes(r.status),'CHILD_ERROR '+r.status+' '+r.stderr.slice(0,260));
 const d=JSON.parse(r.stdout);
 assert.equal(d.schema,'deliveryos.live-shadow-decision.v1');
 assert.equal(d.order_key,event.order_key);
 assert.equal(d.snapshot_hash,event.snapshot_hash);
 assert.equal(d.ready,r.status===0);
 assert.ok(Object.values(d.effects).every(x=>x===false));
 return d;
}
try{
 assert.ok(process.platform==='linux'||(process.platform==='win32'&&process.env.CI==='true'));
 create(oldDir,consumer,motor);create(newDir,labFuture,wrapped);
 let positive=0,negative=0,unknownRemoved=0,remainsBlocked=0;
 const remainingReasons=new Map();
 for(const [id,parts]of cases){
  const event=eventFor(parts),baseline=invoke(oldDir,event),next=invoke(newDir,event);
  assert.deepEqual(next.items,baseline.items,'item source classifications must not change');
  assert.deepEqual(next.kits,baseline.kits,'kits must not change');
  assert.deepEqual(next.order_observations,baseline.order_observations);
  assert.equal(next.packaging?.bags?.size,'M',id);
  assert.equal(next.packaging?.bags?.size_status,'FACT',id);
  assert.equal(next.packaging?.bags?.exact_bag_count,1);
  assert.equal(next.packaging?.bags?.exact_bag_count_status,'FACT');
  const other=d=>d.blocking_reasons.filter(x=>x!=='BAG_SIZE_NOT_FACT');
  assert.deepEqual(other(next),other(baseline),'other V2 blockers cannot be removed');
  if(baseline.blocking_reasons.includes('BAG_SIZE_NOT_FACT'))unknownRemoved++;
  if(!next.ready)remainsBlocked++;
  for(const reason of next.blocking_reasons)remainingReasons.set(reason,(remainingReasons.get(reason)||0)+1);
  positive++;
  for(const miss of [
   [...parts,['SHIMEJI',1]],
   parts.map(([k,q],i)=>[k,i===0?q+1:q]),
   parts.map(([k,q],i)=>[i===0?'SHIMEJI':k,q])
  ]){
   const e=eventFor(miss),a=invoke(oldDir,e),b=invoke(newDir,e);
   assert.deepEqual(b.packaging?.bags,a.packaging?.bags,'no inherited bag on near miss');
   assert.deepEqual(b.blocking_reasons,a.blocking_reasons);
   negative++;
  }
 }
 assert.equal(positive,7);assert.equal(negative,21);
 assert.ok(fs.readFileSync(consumerSource).equals(consumer));
 assert.ok(fs.readFileSync(engineSource).equals(motor));
 console.log(JSON.stringify({schema:'tata.static-bag-policy-v81-lab',
  status:'PASS',positive,negative,unknownRemoved,remainsBlocked,
  original_consumer_unchanged:true,original_motor_unchanged:true,
  remaining_blockers_by_reason:Object.fromEntries([...remainingReasons].sort()),
  source_event_fake:true,all_effects_false:true,real_world_authority:false,
  historical_v2_promotions:0,physical_prints:0}));
}finally{fs.rmSync(root,{recursive:true,force:true})}
