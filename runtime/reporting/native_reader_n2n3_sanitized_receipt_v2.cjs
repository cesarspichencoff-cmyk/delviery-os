'use strict';
// Pure N2/N3 self-consistency review. NO I/O, production or dispatch authority.
// Caller-supplied legacy event; even a matching digest leaves state HOLD.
const {snapshotHash}=require('./native_reader_shadow_replay_v1.cjs');
const {review:reviewContract}=require('./native_reader_producer_contract_review_v1.cjs');
const {legacyDigestUpper,divergentClasses,checkBasisGuard}=
 require('./native_reader_legacy_ps51_digest_v1.cjs');
const SCHEMA='deliveryos.native-reader-n2n3-sanitized-receipt.v2';
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const code=x=>typeof x==='string'&&/^[A-Z0-9_]{1,64}$/.test(x)?x:'CONTRACT_REVIEW_UNKNOWN';
function empty(reason){
 return {schema:SCHEMA,state:'HOLD',reason,unit:'ITAIM',
  sourceKind:'CALLER_SUPPLIED_EVENT_NOT_AUTHENTICATED',
  storedDigestFormat:'INVALID_OR_UNSUPPORTED',
  n3CanonicalDigestMatch:false,n3LegacyPs51DigestMatch:false,
  n3DigestBoundToContent:false,n3DivergenceExplainedByLegacyEscaping:false,
  divergentClassesPresent:{apostrophe:false,angles:false,ampersand:false,unicodeSeparators:false},
  n2StructureSelfConsistent:false,n2StructureDetailCode:'NOT_REVIEWED',
  itemRows:null,noteRows:null,
  notesPerField:{DSOBSCOMANDA:0,DSOBSDESCIT:0,DSOBSPEDDIGCMD:0,TXPRODCOMVEN:0},
  sourceIdentityVerified:false,sourceFreshnessVerified:false,
  n2ObservationReadIndependentlyComplete:false,independentIfoodIdentityVerified:false,
  ordersPublishable:0,homePublishAuthorized:false,actionsExecuted:0,
  rawOrderIdsExported:0,customerDataExported:false,rawHashExported:false};
}
function review(event){
 try{
  const r=empty('REVIEW_ENVELOPE_OR_BOUNDS_INVALID');
  if(!obj(event)||!obj(event.order)||
    !Array.isArray(event.order.items)||event.order.items.length>200||
    !Array.isArray(event.order.observation_rows)||
    event.order.observation_rows.length>400)return Object.freeze(r);
  const o=event.order,received=event.snapshot_hash;
  const valid=typeof received==='string'&&/^[a-fA-F0-9]{64}$/.test(received);
  r.storedDigestFormat=valid?(received===received.toUpperCase()?'UPPER_HEX':
    received===received.toLowerCase()?'LOWER_HEX':'MIXED_HEX'):'INVALID_OR_UNSUPPORTED';
  const canonical=snapshotHash(o);
  const basisValid=canonical!==null&&checkBasisGuard(o);
  const legacy=basisValid?legacyDigestUpper(o):null;
  r.n3CanonicalDigestMatch=valid&&basisValid&&canonical===received.toLowerCase();
  r.n3LegacyPs51DigestMatch=valid&&basisValid&&legacy!==null&&legacy.toLowerCase()===received.toLowerCase();
  r.n3DigestBoundToContent=r.n3CanonicalDigestMatch||r.n3LegacyPs51DigestMatch;
  const flags=divergentClasses(o);
  if(flags)r.divergentClassesPresent={...flags};
  r.n3DivergenceExplainedByLegacyEscaping=r.n3LegacyPs51DigestMatch&&
    !r.n3CanonicalDigestMatch&&Object.values(r.divergentClassesPresent).some(Boolean);
  // Structural gate must run on recomputed canonical digest in memory,
  // independently of caller digest; never export this private copy.
  const copy=canonical===null?null:{...event,snapshot_hash:canonical};
  if(copy){
   const c=reviewContract(copy);
   r.n2StructureSelfConsistent=c.canonicalContractChecked===true;
   r.n2StructureDetailCode=code(c.reason);
  }else r.n2StructureDetailCode='CANONICAL_BASIS_INVALID';
  r.itemRows=o.items.length;
  r.noteRows=o.observation_rows.length;
  for(const row of o.observation_rows)
   if(obj(row)&&typeof row.source_field==='string'&&
      Object.hasOwn(r.notesPerField,row.source_field))
    r.notesPerField[row.source_field]++;
  r.reason=!r.n3DigestBoundToContent?'N3_DIGEST_NOT_BOUND_TO_CONTENT':
    !r.n2StructureSelfConsistent?'N2_STRUCTURE_NOT_SELF_CONSISTENT':
      'N2_N3_SELF_CONSISTENT_SOURCE_UNATTESTED';
  if(Buffer.byteLength(JSON.stringify(r),'utf8')>2048)
   return Object.freeze(empty('SANITIZED_RECEIPT_SIZE_EXCEEDED'));
  Object.freeze(r.divergentClassesPresent);Object.freeze(r.notesPerField);
  return Object.freeze(r);
 }catch{return Object.freeze(empty('REVIEW_EXCEPTION_HOLD'));}
}
module.exports=Object.freeze({SCHEMA,review});
