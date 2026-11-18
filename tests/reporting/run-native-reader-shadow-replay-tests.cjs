'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {SCHEMA,OUT,replay,snapshotHash,decisionHash}=
  require('../../runtime/reporting/native_reader_shadow_replay_v1.cjs');
const source=fs.readFileSync(path.join(__dirname,
  '../../runtime/reporting/native_reader_shadow_replay_v1.cjs'),'utf8');
const HMAC=Buffer.alloc(32,7);
let passed=0;
const test=(name,fn)=>{fn();passed++;};
const copy=x=>JSON.parse(JSON.stringify(x));
function fixture(){
  const order={
    CDFILIAL:'0001',CDLOJA:'01',NRVENDAREST:'LABSALE01',
    NRCOMANDA:'LABCMD01',NRCOMANDAEXT:'1234',
    IDORGCMDVENDA:'DLV_IFO',IDSTCOMANDA:'3',
    DTHRABERMESA:'2026-11-03T12:31:00.0000000',
    items:[
      {NRPRODCOMVEN:'LINE01',CDPRODUTO:'PROD01',CDARVPROD:'9200001000',
        QTPRODCOMVEN:'2.000',IDSTPRCOMVEN:'4'},
      {NRPRODCOMVEN:'LINE02',CDPRODUTO:'PROD02',CDARVPROD:'9200002000',
        QTPRODCOMVEN:'1.000',IDSTPRCOMVEN:'4'}
    ],observation_scan_complete:true,
    observation_rows:[
      {source_field:'DSOBSPEDDIGCMD',value:'FICTITIOUS_PRIVATE_NOTE',
        scope_hint:'item',join_proven:true,item_index:0,CDPRODUTO:'PROD01'},
      {source_field:'DSOBSCOMANDA',value:'FICTITIOUS_ORDER_NOTE',
        scope_hint:'order',join_proven:true}
    ]
  };
  const key=['0001','01','LABSALE01','LABCMD01'].join('|');
  const event={schema:'deliveryos.tata-reader-stable-order-event.v1',
    order_key:key,snapshot_hash:'',order,
    // Pure positive-shape fixture: no claimed native-source authority.
    // The actual PR135 producer explicitly sets false + blockers, tested below.
    blockers:[],
    service_resolution:{service:null,evidence:'UNKNOWN',source_ref:null,blockers:[]}};
  const decision={schema:'deliveryos.live-shadow-decision.v1',
    order_key:key,snapshot_hash:'',ifood_sequence:'1234',teknisa_sequence:'LABCMD01',
    ready:false,blocking_reasons:[],service:event.service_resolution,
    items:[
      {item_index:1,CDPRODUTO:'PROD01',canonical_code:'9.20.00.010.00',
        product_name:'FICTITIOUS_SUSHI',quantity:2,
        observations:[{source_field:'DSOBSPEDDIGCMD',value:'FICTITIOUS_PRIVATE_NOTE'}]},
      {item_index:2,CDPRODUTO:'PROD02',canonical_code:'9.20.00.020.00',
        product_name:'FICTITIOUS_TEMAKI',quantity:1,observations:[]}
    ],
    order_observations:[{source_field:'DSOBSCOMANDA',value:'FICTITIOUS_ORDER_NOTE'}],
    observation_scan_complete:true,
    packaging:{has_unknown:true,total_items:3},kits:{status:'UNKNOWN'},
    sequence:{shadow_candidate:'999',binding_written:false}
  };
  const pair={event,decision};
  return refresh(pair);
}
function refresh(p){
  p.event.snapshot_hash=snapshotHash(p.event.order);
  p.decision.snapshot_hash=p.event.snapshot_hash;
  p.decision.fingerprint=decisionHash(p.decision);
  return p;
}
const input=(pairs=[fixture()])=>({schema:SCHEMA,host:'CAIXA_MOOCA',
  unit:'ITAIM',hmacKey:HMAC,pairs});
const output=(change=()=>{})=>{
  const x=input();change(x);return replay(x);
};
const invalid=(change)=>assert.equal(output(change).reason,'NATIVE_PAIR_INVALID');
const valid=()=>output();
test('correct output contract',()=>assert.equal(valid().schema,OUT));
test('always HOLD',()=>assert.equal(valid().state,'HOLD'));
test('exact reason retains source proof gap',()=>assert.equal(
  valid().reason,'NATIVE_SOURCE_AUTHENTICITY_AND_FRESHNESS_NOT_PROVEN'));
test('candidate preview one',()=>assert.equal(valid().selfConsistentCandidates,1));
test('opaque reference is HMAC',()=>assert.match(valid().rows[0].orderRef,/^[0-9a-f]{64}$/));
test('opaque revision is HMAC',()=>assert.match(valid().rows[0].revisionRef,/^[0-9a-f]{64}$/));
test('never releases operational events',()=>assert.equal(valid().operationalEventEmissionAuthorized,false));
test('never publishes orders',()=>assert.equal(valid().ordersPublishable,0));
test('never claims iFood',()=>assert.equal(valid().independentIfoodIdentityProven,false));
test('never claims source authenticity',()=>assert.equal(valid().nativeSourceAuthenticated,false));
test('never claims freshness',()=>assert.equal(valid().sourceFreshnessProven,false));
test('never claims lifecycle',()=>assert.equal(valid().nativeLifecycleSemanticsProven,false));
test('never claims delivery binding',()=>assert.equal(valid().readerToDeliveryBindingProven,false));
test('never exports native ID',()=>assert.equal(valid().rawOrderIdsExported,0));
test('never exports customer fields',()=>assert.equal(valid().customerFieldsExported,0));
test('no secrets, product names or notes in output',()=>{
  const s=JSON.stringify(valid());
  for(const forbidden of ['LABSALE01','LABCMD01','PROD01','FICTITIOUS_','1234'])
    assert.equal(s.includes(forbidden),false,forbidden);
});
test('source and fixture are not mutated',()=>{
  const x=input(),before=JSON.stringify(x.pairs);replay(x);
  assert.equal(JSON.stringify(x.pairs),before);
});
test('real observed header P can be reviewed',()=>{
  const p=fixture();p.event.order.IDSTCOMANDA='P';refresh(p);
  assert.equal(replay(input([p])).rows[0].nativeState,'P');
});
test('real observed header X remains unknown, not cancellation',()=>{
  const p=fixture();p.event.order.IDSTCOMANDA='X';refresh(p);
  assert.equal(replay(input([p])).rows[0].nativeState,'X');
  assert.equal(replay(input([p])).nativeLifecycleSemanticsProven,false);
});
test('same revision repeated is deduplicated',()=>{
  const p=fixture(),r=replay(input([p,copy(p)]));
  assert.equal(r.selfConsistentCandidates,1);
  assert.equal(r.duplicateSnapshotsIgnored,1);
});
test('different revisions same native key are never automatically ordered',()=>{
  const a=fixture(),b=copy(a);
  b.event.order.items[0].QTPRODCOMVEN='3.000';
  b.decision.items[0].quantity=3;refresh(b);
  assert.equal(replay(input([a,b])).reason,
    'CONFLICTING_NATIVE_REVISIONS_NO_ORDERING_PROOF');
});
test('independent orders remain distinct',()=>{
  const a=fixture(),b=copy(a);
  b.event.order.NRCOMANDA='LABCMD02';
  b.event.order_key='0001|01|LABSALE01|LABCMD02';
  b.decision.order_key=b.event.order_key;b.decision.teknisa_sequence='LABCMD02';refresh(b);
  assert.equal(replay(input([a,b])).selfConsistentCandidates,2);
});
test('different HMAC key produces different opaque reference',()=>{
  const a=input(),b=input();b.hmacKey=Buffer.alloc(32,8);
  assert.notEqual(replay(a).rows[0].orderRef,replay(b).rows[0].orderRef);
});
test('invalid order header cancellation blocked',()=>{
  invalid(x=>{x.pairs[0].event.order.IDSTCOMANDA='4';refresh(x.pairs[0]);});
});
test('legacy scheduled A blocked',()=>{
  invalid(x=>{x.pairs[0].event.order.IDSTCOMANDA='A';refresh(x.pairs[0]);});
});
test('cancelled item 6 blocked',()=>{
  invalid(x=>{x.pairs[0].event.order.items[0].IDSTPRCOMVEN='6';refresh(x.pairs[0]);});
});
test('item 3 blocked',()=>{
  invalid(x=>{x.pairs[0].event.order.items[0].IDSTPRCOMVEN='3';refresh(x.pairs[0]);});
});
test('wrong unit blocked even after rehash',()=>{
  invalid(x=>{x.pairs[0].event.order.CDLOJA='02';refresh(x.pairs[0]);});
});
test('wrong origin blocked',()=>{
  invalid(x=>{x.pairs[0].event.order.IDORGCMDVENDA='DLV_NMO';refresh(x.pairs[0]);});
});
test('bad native key blocked',()=>{
  invalid(x=>{x.pairs[0].event.order_key='0001|01|OTHER|LABCMD01';});
});
test('wrong short code blocked',()=>{
  invalid(x=>{x.pairs[0].decision.ifood_sequence='1235';refresh(x.pairs[0]);});
});
test('timestamp impossible blocked',()=>{
  invalid(x=>{x.pairs[0].event.order.DTHRABERMESA='2026-02-30T12:31:00';refresh(x.pairs[0]);});
});
test('tampered snapshot blocked',()=>{
  invalid(x=>{x.pairs[0].event.order.items[0].QTPRODCOMVEN='3.000';});
});
test('rehash but wrong quantity blocked',()=>{
  invalid(x=>{x.pairs[0].event.order.items[0].QTPRODCOMVEN='3.000';refresh(x.pairs[0]);});
});
test('rehash but discarded item note blocked',()=>{
  invalid(x=>{x.pairs[0].decision.items[0].observations=[];refresh(x.pairs[0]);});
});
test('general note mismatch blocked',()=>{
  invalid(x=>{x.pairs[0].event.order.observation_rows[1].value='CHANGED';refresh(x.pairs[0]);});
});
test('incomplete observation scan blocked',()=>{
  invalid(x=>{x.pairs[0].event.order.observation_scan_complete=false;refresh(x.pairs[0]);});
});
test('duplicate item line blocked',()=>{
  invalid(x=>{x.pairs[0].event.order.items[1].NRPRODCOMVEN='LINE01';refresh(x.pairs[0]);});
});
test('duplicate note source blocked',()=>{
  invalid(x=>{x.pairs[0].event.order.observation_rows.push(
    copy(x.pairs[0].event.order.observation_rows[0]));refresh(x.pairs[0]);});
});
test('note item join blocked',()=>{
  invalid(x=>{x.pairs[0].event.order.observation_rows[0].CDPRODUTO='OTHER';refresh(x.pairs[0]);});
});
test('missing snapshot blocked',()=>invalid(x=>{x.pairs[0].event.snapshot_hash='';}));
test('missing fingerprint blocked',()=>invalid(x=>{x.pairs[0].decision.fingerprint='';}));
test('no pair blocked',()=>assert.equal(replay(input([])).reason,'INVALID_ENVELOPE'));
test('invalid HMAC blocked',()=>assert.equal(replay({...input(),hmacKey:Buffer.alloc(8)}).reason,'INVALID_ENVELOPE'));
test('input scope cannot be redirected',()=>assert.equal(
  replay({...input(),unit:'MOOCA'}).reason,'INVALID_ENVELOPE'));
test('no unrecognised input fields',()=>assert.equal(
  replay({...input(),authToken:'FICTITIOUS'}).reason,'INVALID_ENVELOPE'));
test('too many snapshots blocked',()=>assert.equal(
  replay(input(Array.from({length:65},fixture))).reason,'INVALID_ENVELOPE'));
test('native child-table blocker refuses HMAC candidate even if decision is rehashed',()=>{
  const p=fixture();
  p.event.blockers=['NATIVE_CHILD_ITEM_AND_OBSERVATION_TABLES_NOT_READ'];
  const r=replay(input([p]));
  assert.equal(r.reason,'NATIVE_PAIR_INVALID');
  assert.equal(r.ordersPublishable,0);
  assert.equal(r.rows.length,0);
  assert.equal(r.selfConsistentCandidates,undefined);
});
test('explicit native downstream false refuses even with cleared blocker array',()=>{
  const p=fixture();
  p.event.ready_for_downstream_shadow=false;
  p.event.blockers=[];
  const r=replay(input([p]));
  assert.equal(r.reason,'NATIVE_PAIR_INVALID');
  assert.equal(r.rows.length,0);
  assert.equal(r.operationalEventEmissionAuthorized,false);
});
test('spoofed completeness flag cannot override producer native-source veto',()=>{
  const p=fixture();
  p.event.order.observation_scan_complete=false;
  p.event.blockers=['NATIVE_CHILD_ITEM_AND_OBSERVATION_TABLES_NOT_READ'];
  // An intermediary toggles the flag and rehashes the event and decision.
  p.event.order.observation_scan_complete=true;
  refresh(p);
  const r=replay(input([p]));
  assert.equal(r.reason,'NATIVE_PAIR_INVALID');
  assert.equal(r.rows.length,0);
  assert.equal(r.nativeSourceAuthenticated,false);
});
test('no filesystem/network/console/browser dependencies',()=>{
  assert.equal(/require\(['"](?:node:)?(?:fs|http|https|net|child_process)['"]\)/.test(source),false);
  assert.equal(/\b(?:spawn|execFile|Start-Process|ShowWindow|setInterval)\b/.test(source),false);
  assert.equal(/https?:\/\/|ifood\.com\.br|localhost:/.test(source),false);
});
console.log('NATIVE_READER_SHADOW_REPLAY_PASS '+passed+'/'+passed+' (PURE_SYNTHETIC_ONLY)');