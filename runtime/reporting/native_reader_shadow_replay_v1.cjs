'use strict';
// Pure offline replay of the Reader V2 event + decision contract used by TATÁ Comandas.
// SOURCE SELF-CONSISTENCY IS NOT INDEPENDENT AUTHENTICITY. Nothing is publishable.
// No filesystem, network, UI, SQL, order actions, printing or persistent storage.
const {createHash,createHmac}=require('node:crypto');
const SCHEMA='deliveryos.native-reader-shadow-replay-input.v1';
const OUT='deliveryos.native-reader-shadow-replay-output.v1';
const REQUIRED=['CDFILIAL','CDLOJA','NRVENDAREST','NRCOMANDA','NRCOMANDAEXT',
  'IDORGCMDVENDA','IDSTCOMANDA','DTHRABERMESA'];
const ITEM=['NRPRODCOMVEN','CDPRODUTO','CDARVPROD','QTPRODCOMVEN','IDSTPRCOMVEN'];
const safe=x=>typeof x==='string'&&x.length>0&&x.length<=2000&&
  x===x.trim()&&!/[\x00-\x08\x0b-\x1f\x7f]/.test(x);
const id=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,64}$/.test(x);
const hex=x=>typeof x==='string'&&/^[0-9a-f]{64}$/.test(x);
const obj=x=>x&&typeof x==='object'&&!Array.isArray(x);
const sha=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
function day(x){
  if(typeof x!=='string')return null;
  const m=/^(\d{4})-(\d{2})-(\d{2})T/.exec(x);
  if(!m)return null;
  const [y,mo,d]=m.slice(1).map(Number);
  const dt=new Date(Date.UTC(y,mo-1,d));
  return y>=2020&&y<=2100&&dt.getUTCFullYear()===y&&
    dt.getUTCMonth()+1===mo&&dt.getUTCDate()===d?m[1]+'-'+m[2]+'-'+m[3]:null;
}
function canonical(raw){
  if(!safe(raw))return null;
  const c=raw.toUpperCase();
  return /^[A-Z0-9]\.[A-Z0-9]{2}\.[A-Z0-9]{2}\.[A-Z0-9]{3}\.[A-Z0-9]{2}$/.test(c)
    ?c:/^[A-Z0-9]{10}$/.test(c)
      ?[c.slice(0,1),c.slice(1,3),c.slice(3,5),c.slice(5,8),c.slice(8,10)].join('.')
      :null;
}
// Exact hashing procedure mirrors the Reader V8.57 functions from PR #127.
// If the source changes its hashing contract, fail closed; do not guess.
function snapshotHash(o){
  if(!obj(o)||REQUIRED.some(k=>!Object.hasOwn(o,k))||!Array.isArray(o.items))return null;
  const basis={};
  for(const k of REQUIRED)basis[k]=o[k];
  basis.items=o.items.map(x=>{
    if(!obj(x)||ITEM.some(k=>!Object.hasOwn(x,k)))return null;
    const item={};for(const k of ITEM)item[k]=x[k];return item;
  });
  if(basis.items.includes(null))return null;
  if(Array.isArray(o.observation_rows)&&o.observation_rows.length)
    basis.observation_rows=o.observation_rows;
  return sha(basis);
}
function decisionHash(d){
  if(!obj(d))return null;
  const core={order_key:d.order_key,snapshot_hash:d.snapshot_hash,
    ifood_sequence:d.ifood_sequence,teknisa_sequence:d.teknisa_sequence,
    service:d.service,items:d.items};
  core.order_observations=d.order_observations;
  core.observation_scan_complete=d.observation_scan_complete;
  core.packaging=d.packaging;core.kits=d.kits;core.sequence=d.sequence;
  return sha(core);
}
function evaluatePair(p,key){
  if(!obj(p)||!obj(p.event)||!obj(p.decision))return null;
  const e=p.event,d=p.decision,o=e.order;
  if(e.schema!=='deliveryos.tata-reader-stable-order-event.v1'||
    d.schema!=='deliveryos.live-shadow-decision.v1'||!obj(o)||
    REQUIRED.some(k=>!Object.hasOwn(o,k))||
    o.CDFILIAL!=='0001'||o.CDLOJA!=='01'||
    o.IDORGCMDVENDA!=='DLV_IFO'||!['3','P','X'].includes(o.IDSTCOMANDA)||
    !day(o.DTHRABERMESA)||!id(o.NRVENDAREST)||!id(o.NRCOMANDA)||
    !/^\d{1,12}$/.test(o.NRCOMANDAEXT)||!Array.isArray(o.items)||
    !Array.isArray(o.observation_rows)||o.items.length<1||o.items.length>200||
    !Array.isArray(d.items)||o.items.length!==d.items.length||
    !Array.isArray(d.order_observations)||o.observation_scan_complete!==true||
    d.observation_scan_complete!==true)return null;
  const nativeKey=[o.CDFILIAL,o.CDLOJA,o.NRVENDAREST,o.NRCOMANDA].join('|');
  if(e.order_key!==nativeKey||d.order_key!==nativeKey||
    d.ifood_sequence!==o.NRCOMANDAEXT||d.teknisa_sequence!==o.NRCOMANDA||
    !hex(e.snapshot_hash)||e.snapshot_hash!==d.snapshot_hash||
    snapshotHash(o)!==e.snapshot_hash||
    !hex(d.fingerprint)||decisionHash(d)!==d.fingerprint)return null;
  const general=[],itemNotes=new Map(),seenNotes=new Set();
  for(const n of o.observation_rows){
    if(!obj(n)||n.join_proven!==true||!safe(n.value))return null;
    if(n.scope_hint==='order'){
      if(n.source_field!=='DSOBSCOMANDA'||general.length)return null;
      general.push({source_field:n.source_field,value:n.value});
    }else if(n.scope_hint==='item'){
      if(!['DSOBSDESCIT','DSOBSPEDDIGCMD','TXPRODCOMVEN'].includes(n.source_field)||
        !Number.isInteger(n.item_index)||n.item_index<0||n.item_index>=o.items.length||
        n.CDPRODUTO!==o.items[n.item_index].CDPRODUTO)return null;
      const noteKey=n.item_index+'|'+n.source_field;
      if(seenNotes.has(noteKey))return null;
      seenNotes.add(noteKey);
      const found=itemNotes.get(n.item_index)||[];
      found.push({source_field:n.source_field,value:n.value});
      itemNotes.set(n.item_index,found);
    }else return null;
  }
  if(JSON.stringify(general)!==JSON.stringify(d.order_observations))return null;
  const seenLines=new Set();
  for(let i=0;i<o.items.length;i++){
    const n=o.items[i],x=d.items[i];
    if(!obj(n)||!obj(x)||!id(n.NRPRODCOMVEN)||seenLines.has(n.NRPRODCOMVEN)||
      !id(n.CDPRODUTO)||n.IDSTPRCOMVEN!=='4'||
      x.CDPRODUTO!==n.CDPRODUTO||x.item_index!==i+1||
      !safe(x.product_name)||canonical(n.CDARVPROD)!==x.canonical_code||
      typeof n.QTPRODCOMVEN!=='string'||
      !/^0*[1-9]\d*(?:\.0+)?$/.test(n.QTPRODCOMVEN)||
      !Number.isSafeInteger(Number(n.QTPRODCOMVEN))||
      Number(n.QTPRODCOMVEN)!==x.quantity||!Array.isArray(x.observations)||
      JSON.stringify(itemNotes.get(i)||[])!==JSON.stringify(x.observations.map(
        note=>({source_field:note?.source_field,value:note?.value}))))return null;
    seenLines.add(n.NRPRODCOMVEN);
  }
  // HMAC references prevent raw native keys or notes from escaping the result.
  const tag=x=>createHmac('sha256',key).update(x).digest('hex');
  return Object.freeze({
    orderRef:tag('native-order-v1|'+nativeKey+'|'+day(o.DTHRABERMESA)),
    revisionRef:tag('native-revision-v1|'+nativeKey+'|'+e.snapshot_hash),
    operationalDay:day(o.DTHRABERMESA),
    nativeState:o.IDSTCOMANDA,itemRows:o.items.length,
    noteRows:o.observation_rows.length,
    evidence:'SELF_CONSISTENT_NOT_AUTHENTICATED'
  });
}
function hold(reason,extra={}){
  return Object.freeze({
    schema:OUT,state:'HOLD',reason,scope:'ITAIM',source:'READER_V2_SELF_CONSISTENCY_ONLY',
    nativeSourceAuthenticated:false,sourceFreshnessProven:false,
    independentIfoodPresenceProven:false,independentIfoodIdentityProven:false,
    completeIfoodCoverageProven:false,nativeLifecycleSemanticsProven:false,
    readerToDeliveryBindingProven:false,callerClockAttested:false,
    ordersPublishable:0,operationalEventEmissionAuthorized:false,
    navigationAuthorized:false,actionsExecuted:0,customerFieldsExported:0,
    rawOrderIdsExported:0,previewOnly:true,rows:[],...extra
  });
}
function replay(input){
  if(!obj(input)||Object.keys(input).sort().join('|')!==
    ['schema','host','unit','hmacKey','pairs'].sort().join('|')||
    input.schema!==SCHEMA||input.host!=='CAIXA_MOOCA'||input.unit!=='ITAIM'||
    !Buffer.isBuffer(input.hmacKey)||input.hmacKey.length<32||
    input.hmacKey.length>64||!Array.isArray(input.pairs)||
    input.pairs.length<1||input.pairs.length>64)return hold('INVALID_ENVELOPE');
  const rows=[],byOrder=new Map(),seenRevisions=new Set();
  let duplicates=0;
  for(const p of input.pairs){
    const r=evaluatePair(p,input.hmacKey);
    if(!r)return hold('NATIVE_PAIR_INVALID',{evaluatedSnapshots:input.pairs.length});
    const seen=byOrder.get(r.orderRef);
    if(seen&&seen!==r.revisionRef)
      return hold('CONFLICTING_NATIVE_REVISIONS_NO_ORDERING_PROOF',
        {evaluatedSnapshots:input.pairs.length});
    if(seenRevisions.has(r.revisionRef)){duplicates++;continue;}
    seenRevisions.add(r.revisionRef);
    byOrder.set(r.orderRef,r.revisionRef);
    rows.push(r);
  }
  // These are candidate observations for offline replay, NOT live order events.
  return hold('NATIVE_SOURCE_AUTHENTICITY_AND_FRESHNESS_NOT_PROVEN',{
    evaluatedSnapshots:input.pairs.length,selfConsistentCandidates:rows.length,
    duplicateSnapshotsIgnored:duplicates,rows:Object.freeze(rows)
  });
}
module.exports={SCHEMA,OUT,replay,snapshotHash,decisionHash};