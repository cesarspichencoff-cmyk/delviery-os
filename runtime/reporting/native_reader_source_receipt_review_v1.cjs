'use strict';
// Future source-receipt review only. Never converts a self-declared signature,
// a caller-supplied trust list, or a caller clock into proven live Itaim orders.
// No filesystem, network, SQL, printer, service, browser or scheduling actions.
const crypto=require('node:crypto');
const S='tata.reader.native-source-receipt.v1';
const FIELDS=['schema','host','unit','source_kind','event_sha256','decision_sha256',
 'opaque_order_ref','source_observed_utc','receipt_issued_utc','writer_key_id','attester_key_id'];
const hex=x=>typeof x==='string'&&/^[0-9a-f]{64}$/.test(x);
const exact=(x,keys)=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&
 Object.keys(x).length===keys.length&&keys.every(k=>Object.hasOwn(x,k));
const stamp=x=>{
 if(typeof x!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(x))return null;
 const v=Date.parse(x);
 return Number.isFinite(v)&&new Date(v).toISOString()===x?v:null;
};
const bytes=x=>Buffer.from(JSON.stringify(x),'utf8');
const statementBytes=s=>bytes(FIELDS.map(k=>[k,s[k]]));
const attestationBytes=(s,w)=>bytes([['statement',FIELDS.map(k=>[k,s[k]])],['writer_signature_base64',w]]);
const deny=reason=>Object.freeze({
 schema:'tata.reader.source-receipt-review.v1',state:'HOLD',reason,
 cryptographicPairValid:false,sourceIdentityProven:false,
 hostProcessIdentityProven:false,sourceClockIndependentlyProven:false,
 sourceFreshnessIndependentlyProven:false,independentIfoodIdentityProven:false,
 nativeOrderItemDetailProven:false,ordersPublishable:0,
 operationalEventEmissionAuthorized:false,printAuthorized:false,
 customerDataExported:false,rawOrderIdsExported:0,
 nextGate:'AUTHORIZED_HOST_SOURCE_AND_INDEPENDENT_IFOOD_PROOF'
});
function publicKey(row){
 if(!exact(row,['key_id','role','host','unit','spki_der_base64',
  'not_before_utc','not_after_utc']))return null;
 if(!hex(row.key_id)||row.host!=='CAIXA_MOOCA'||row.unit!=='ITAIM'||
  !['READER_SOURCE_WRITER','INDEPENDENT_SOURCE_ATTESTER'].includes(row.role)||
  stamp(row.not_before_utc)===null||stamp(row.not_after_utc)===null||
  stamp(row.not_after_utc)<=stamp(row.not_before_utc)||
  typeof row.spki_der_base64!=='string'||row.spki_der_base64.length>256)return null;
 try{
  const der=Buffer.from(row.spki_der_base64,'base64');
  if(der.toString('base64')!==row.spki_der_base64||der.length>128)return null;
  const key=crypto.createPublicKey({key:der,format:'der',type:'spki'});
  if(key.asymmetricKeyType!=='ed25519')return null;
  if(crypto.createHash('sha256').update(der).digest('hex')!==row.key_id)return null;
  return key;
 }catch{return null;}
}
function signature(x){
 if(typeof x!=='string'||!/^[A-Za-z0-9+/]{86}==$/.test(x))return null;
 const b=Buffer.from(x,'base64');
 return b.length===64&&b.toString('base64')===x?b:null;
}
function review(input){
 try{
  if(!exact(input,['receipt','trust','now_utc']))return deny('INVALID_ENVELOPE');
  const {receipt,trust,now_utc}=input;
  if(!exact(receipt,['statement','writer_signature_base64','attester_signature_base64'])||
    !exact(receipt.statement,FIELDS)||
    !exact(trust,['schema','keys'])||
    trust.schema!=='tata.reader.external-trust-pins.v1'||!Array.isArray(trust.keys)||
    trust.keys.length!==2||
    Buffer.byteLength(JSON.stringify(input),'utf8')>8192)return deny('INVALID_RECEIPT_OR_TRUST_SHAPE');
  const s=receipt.statement;
  if(s.schema!==S||s.host!=='CAIXA_MOOCA'||s.unit!=='ITAIM'||
    s.source_kind!=='NATIVE_READER_V2'||!hex(s.event_sha256)||
    !hex(s.decision_sha256)||!hex(s.opaque_order_ref)||
    !hex(s.writer_key_id)||!hex(s.attester_key_id)||
    s.writer_key_id===s.attester_key_id)return deny('INVALID_SCOPE_OR_DIGESTS');
  const now=stamp(now_utc),obs=stamp(s.source_observed_utc),issued=stamp(s.receipt_issued_utc);
  if(now===null||obs===null||issued===null)return deny('INVALID_TIMESTAMP');
  if(obs>issued||issued-now>5000||now-issued>300000||
    now-obs>600000)return deny('EXPIRED_OR_UNORDERED_SOURCE_RECEIPT');
  const writer=trust.keys.find(k=>k?.role==='READER_SOURCE_WRITER');
  const attester=trust.keys.find(k=>k?.role==='INDEPENDENT_SOURCE_ATTESTER');
  if(!writer||!attester||writer.key_id!==s.writer_key_id||
    attester.key_id!==s.attester_key_id)return deny('TRUST_KEYS_NOT_PINNED');
  const writerPublic=publicKey(writer),attesterPublic=publicKey(attester);
  if(!writerPublic||!attesterPublic)return deny('INVALID_PINNED_KEYS');
  if([writer,attester].some(k=>stamp(k.not_before_utc)>issued||
    stamp(k.not_after_utc)<issued))return deny('SIGNER_TIME_OUT_OF_SCOPE');
  const w=signature(receipt.writer_signature_base64);
  const a=signature(receipt.attester_signature_base64);
  if(!w||!a||!crypto.verify(null,statementBytes(s),writerPublic,w)||
    !crypto.verify(null,attestationBytes(s,receipt.writer_signature_base64),attesterPublic,a))
    return deny('INVALID_OR_TAMPERED_SIGNATURE');
  // The trust argument and time are caller-supplied. This module cannot tell
  // whether keys were provisioned into the actual Reader service, whether the
  // host's OS identity is genuine, or whether the order existed in the DB.
  return Object.freeze({...deny('EXTERNAL_SOURCE_PROOF_AND_IFOOD_STILL_REQUIRED'),
    state:'CRYPTOGRAPHIC_REVIEW_ONLY',cryptographicPairValid:true,
    nextGate:'PIN_TRUST_TO_APPROVED_HOST_AND_VERIFY_REAL_NATIVE_SOURCE'});
 }catch{return deny('SOURCE_REVIEW_EXCEPTION');}
}
module.exports={review,statementBytes,attestationBytes,S};
