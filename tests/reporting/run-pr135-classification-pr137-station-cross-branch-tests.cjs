'use strict';
// Executes actual PR135 classifier/catalog and PR137 Reader adapter + R5D3
// station connector. Entirely synthetic, never SQL/print/watcher/real order.
const assert=require('node:assert/strict'),path=require('node:path');
const root=process.argv[2];
if(!root||!path.isAbsolute(root))throw Error('ABSOLUTE_PINNED_PR135_WORKTREE_REQUIRED');
const from=(p)=>require(path.join(root,p));
const {syntheticReaderPairV857}=from('tools/verificar_tata_comanda_reader_native_v857_offline.cjs');
const {snapshotHash,decisionHash}=from('tools/tata_comanda_reader_native_essentials_v857_offline.cjs');
const {CATALOG_SCHEMA}=from('tools/comandas_packaging_classification_review_v1_offline.cjs');
const {bindNativeReview}=from('tools/comandas_reader_bound_classification_v1_offline.cjs');
const {convergeReaderCatalogClassification}=from('tools/comandas_reader_catalog_identity_crosscheck_v1_offline.cjs');
const {adaptStableTataOrderV1}=require('../../runtime/reporting/copiloto_tata_reader_adapter_v1.cjs');
const {vincularReaderTrabalhoPraca}=require('../../dist/src/product/eventos/vinculo-reader-trabalho-praca.js');
const {revisarClassificacaoTrabalhoPraca}=require('../../dist/src/product/eventos/revisar-classificacao-trabalho-praca.js');
const {produzirTrabalhoPraca}=require('../../dist/src/product/eventos/produtor-trabalho-praca.js');
const now='2026-10-20T15:34:00.000Z';
const policy={
 unitId:'ITAIM',sourceUnitId:'0001',sourceStoreId:'01',
 mappingEvidenceRef:'LAB_SYNTHETIC_ONLY',sourceMode:'control',
 sourceTimePolicy:{schema:'deliveryos.source-time-policy.v1',unitId:'ITAIM',
 sourceUnitId:'0001',sourceStoreId:'01',field:'DTHRABERMESA',
 basis:'NATIVE_LOCAL_WALL_TIME',timeZone:'America/Sao_Paulo',
 evidenceRef:'LAB_SYNTHETIC_ONLY'}
};
const effects={database_read:true,database_write:false,network_call:false,
 odhen_write:false,print:false,spooler_write:false,fiscal_action:false,
 sefaz_call:false,cutover:false};
function refresh(d){
 d.event.snapshot_hash=snapshotHash(d.event.order);
 d.decision.snapshot_hash=d.event.snapshot_hash;
 d.decision.fingerprint=decisionHash(d.decision);
}
function setup(){
 const pair=syntheticReaderPairV857();
 pair.event.order.IDSTCOMANDA='3';
 pair.event.order.items.forEach(x=>x.IDSTPRCOMVEN='4');
 pair.event.order.observation_rows=[];
 pair.decision.order_observations=[];
 pair.decision.items.forEach(x=>x.observations=[]);
 refresh(pair);
 const claims=pair.decision.items.map((x,i)=>({
  source_item_index:i,product_code:x.canonical_code,
  product_name:x.product_name,quantity:x.quantity,
  family:i===0?'COMBINADOS':'ENROLADOS',
  station:i===0?'combinados':'enrolados',
  review_required:false,review_source_ref:'LAB_SYNTHETIC_ONLY'
 }));
 const catalog={schema:CATALOG_SCHEMA,
  source_kind:'LOCAL_READ_ONLY_CAPTURE_CLAIM',
  source_ref:'LAB_SYNTHETIC_ONLY',store_id:'0001',store_unit:'01',
  captured_local_date:'2026-10-20',
  entries:pair.decision.items.map(x=>({CDPRODUTO:x.CDPRODUTO,
   canonical_code:x.canonical_code,product_name:x.product_name,active:true}))};
 return {pair,claims,catalog};
}
function joined(x,station=null){
 const {pair,claims,catalog}=x;
 const classification=bindNativeReview(pair,claims);
 const convergence=convergeReaderCatalogClassification(pair,catalog,claims);
 const e={...pair.event,ready_for_downstream_shadow:true,blockers:[],
  observed_at:'2026-10-20T12:32:00-03:00',effects,
  service_resolution:{service:'LUNCH',evidence:'HUMAN_CONFIRMED_RULE',
   source_ref:'LAB_SYNTHETIC_ONLY',blockers:[]}};
 const a=adaptStableTataOrderV1(e,policy);
 assert.equal(a.state,'adapted',a.reason);
 const revision=a.revision;
 const initial=vincularReaderTrabalhoPraca({revision,tenant:'tata',
  unit:'ITAIM',now,workEvents:[]});
 assert.equal(initial.state,'NO_PHYSICAL_EVENTS');
 let events=[];
 if(station!==null){
  const event=produzirTrabalhoPraca({tenant:'tata',unidade:'ITAIM',praca:station,
   pedido_id:initial.opaque_order_ref,grupo:initial.lines[0].line_ref,
   estado:'aguardando',ocorrido_em:'2026-10-20T12:33:00-03:00',
   observado_em:'2026-10-20T12:33:00-03:00',
   operador:'terminal-1',revisao:1,quantidade:2});
  assert.equal(event.ok,true);
  events=[event.evento];
 }
 const binding=vincularReaderTrabalhoPraca({revision,tenant:'tata',unit:'ITAIM',
  now,workEvents:events});
 const review=revisarClassificacaoTrabalhoPraca({
  revision,binding,classification,claims,catalog:convergence
 });
 return {classification,convergence,binding,revision,review};
}
let ok=0;
const test=(name,cb)=>{cb();ok++;console.log('PASS '+name)};
test('actual PR135 catalog and classification reach PR137 line work REVIEW only',()=>{
 const x=joined(setup());
 assert.equal(x.classification.status,'REVIEW_CANDIDATE_ONLY');
 assert.equal(x.convergence.status,'JOINT_SELF_CONSISTENCY_REVIEW_ONLY');
 assert.equal(x.review.status,'REVIEW_CANDIDATE_ONLY',x.review.reasons.join(','));
 assert.equal(x.review.checked_lines,2);
 assert.deepEqual(x.review.declared_station_candidates.map(x=>x.station),
  ['combinados','enrolados']);
 assert.equal(x.review.live_home_authorized,false);
 assert.equal(x.review.ready_for_dispatch,null);
 assert.equal(x.review.current_catalog_homologation_proven,false);
 assert.equal(x.review.station_physically_attested,false);
});
test('matching physical-work declaration remains candidate, never proof of ready',()=>{
 const r=joined(setup(),'combinados').review;
 assert.equal(r.status,'REVIEW_CANDIDATE_ONLY');
 assert.equal(r.declared_station_candidates[0].work_event_count,1);
 assert.equal(r.station_physically_attested,false);
});
test('wrong work station fails closed against PR135 candidate classification',()=>{
 const r=joined(setup(),'duplas').review;
 assert.equal(r.status,'HOLD');
 assert.deepEqual(r.reasons,['WORK_EVENT_STATION_CONTRADICTS_CLASSIFICATION']);
});
test('an archived pending classification code remains HOLD despite matching catalog',()=>{
 const x=setup();
 x.pair.event.order.items[0].CDARVPROD='9100500000';
 x.pair.decision.items[0].canonical_code='9.10.05.000.00';
 x.claims[0].product_code='9.10.05.000.00';
 x.catalog.entries[0].canonical_code='9.10.05.000.00';
 refresh(x.pair);
 const r=joined(x);
 assert.equal(r.classification.status,'HOLD');
 assert.equal(r.convergence.status,'HOLD');
 assert.equal(r.review.status,'HOLD');
});
test('catalog mismatch revokes joint review despite correct physical-work claim',()=>{
 const x=setup();x.catalog.entries[0].canonical_code='9.99.00.000.00';
 const r=joined(x,'combinados');
 assert.equal(r.convergence.status,'HOLD');
 assert.equal(r.review.status,'HOLD');
});
test('native special note stops classification until explicit disposition',()=>{
 const x=setup();
 x.pair.event.order.observation_rows.push({
  source_field:'DSOBSPEDDIGCMD',value:'ALERGIA FICTICIA',
  scope_hint:'item',join_proven:true,item_index:0,
  CDPRODUTO:x.pair.event.order.items[0].CDPRODUTO
 });
 x.pair.decision.items[0].observations.push({
  source_field:'DSOBSPEDDIGCMD',value:'ALERGIA FICTICIA'
 });
 refresh(x.pair);
 const r=joined(x);
 assert.equal(r.classification.status,'HOLD');
 assert.equal(r.review.status,'HOLD');
 assert.equal(JSON.stringify(r.review).includes('ALERGIA FICTICIA'),false);
});
test('old snapshot classification receipt never applies to a different revision',()=>{
 const x=joined(setup());
 const mutated={...x.revision,
  identity:{...x.revision.identity,snapshot_hash:'f'.repeat(64)}};
 const binding=vincularReaderTrabalhoPraca({revision:mutated,
  tenant:'tata',unit:'ITAIM',now,workEvents:[]});
 const r=revisarClassificacaoTrabalhoPraca({
  revision:mutated,binding,classification:x.classification,
  claims:setup().claims,catalog:x.convergence,
 });
 assert.equal(r.status,'HOLD');
});
test('review surfaces never leak source IDs, product names or physical authority',()=>{
 const r=joined(setup(),'combinados').review;
 const rendered=JSON.stringify(r);
 for(const txt of ['0000001111','COMBINADO SUSHI','0000349281',
   '0000348850','TEKNISA','PRIVATE_SENTINEL'])
   assert.equal(rendered.includes(txt),false);
 assert.equal(r.live_home_authorized,false);
 assert.equal(r.source_modified,false);
});
console.log('PR135_CLASSIFICATION_TO_PR137_STATION_PASS '+ok+'/'+ok+' SYNTHETIC_ONLY');
