'use strict';
// Pure adversarial lab with ephemeral Ed25519 keys and fake digests only.
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const R=require('../../runtime/reporting/native_reader_source_receipt_review_v1.cjs');
const d=x=>JSON.parse(JSON.stringify(x));
const create=(role)=>{
 const keys=crypto.generateKeyPairSync('ed25519');
 const der=keys.publicKey.export({format:'der',type:'spki'});
 return {
  private:keys.privateKey,
  row:{key_id:crypto.createHash('sha256').update(der).digest('hex'),
   role,host:'CAIXA_MOOCA',unit:'ITAIM',spki_der_base64:der.toString('base64'),
   not_before_utc:'2026-11-02T00:00:00.000Z',not_after_utc:'2026-11-04T00:00:00.000Z'}
 };
};
const W=create('READER_SOURCE_WRITER'),A=create('INDEPENDENT_SOURCE_ATTESTER');
function make(){
 const statement={
  schema:R.S,host:'CAIXA_MOOCA',unit:'ITAIM',source_kind:'NATIVE_READER_V2',
  event_sha256:'a'.repeat(64),decision_sha256:'b'.repeat(64),
  opaque_order_ref:'c'.repeat(64),
  source_observed_utc:'2026-11-03T21:58:30.000Z',
  receipt_issued_utc:'2026-11-03T21:59:00.000Z',
  writer_key_id:W.row.key_id,attester_key_id:A.row.key_id};
 const writer_signature_base64=crypto.sign(null,R.statementBytes(statement),W.private).toString('base64');
 const attester_signature_base64=crypto.sign(null,R.attestationBytes(statement,writer_signature_base64),A.private).toString('base64');
 return {receipt:{statement,writer_signature_base64,attester_signature_base64},
  trust:{schema:'tata.reader.external-trust-pins.v1',keys:[d(W.row),d(A.row)]},
  now_utc:'2026-11-03T22:00:00.000Z'};
}
let n=0;
const check=(name,fn)=>{fn();console.log('PASS '+(++n)+' '+name);};
const run=fn=>{const x=make();fn(x);return R.review(x);};
const refusal=fn=>assert.equal(run(fn).state,'HOLD');
check('valid pair is review-only, never production proof',()=>{
 const result=R.review(make());
 assert.equal(result.state,'CRYPTOGRAPHIC_REVIEW_ONLY');
 assert.equal(result.cryptographicPairValid,true);
 assert.equal(result.sourceIdentityProven,false);
 assert.equal(result.hostProcessIdentityProven,false);
 assert.equal(result.independentIfoodIdentityProven,false);
 assert.equal(result.ordersPublishable,0);
 assert.equal(result.printAuthorized,false);
});
check('key IDs distinct',()=>assert.notEqual(W.row.key_id,A.row.key_id));
check('absent trust blocks',()=>refusal(x=>{x.trust.keys=[];}));
check('wrong trust shape blocks',()=>refusal(x=>{x.trust.keys='none';}));
check('extra key blocks',()=>refusal(x=>{x.trust.keys.push(d(W.row));}));
check('flipped pinned role blocks',()=>refusal(x=>{x.trust.keys[0].role='INDEPENDENT_SOURCE_ATTESTER';}));
check('changed writer key ID blocks',()=>refusal(x=>{x.receipt.statement.writer_key_id='e'.repeat(64);}));
check('changed attester key ID blocks',()=>refusal(x=>{x.receipt.statement.attester_key_id='e'.repeat(64);}));
check('repeated signer key blocks',()=>refusal(x=>{x.receipt.statement.attester_key_id=x.receipt.statement.writer_key_id;}));
check('signed event digest tampered blocks',()=>refusal(x=>{x.receipt.statement.event_sha256='d'.repeat(64);}));
check('signed decision digest tampered blocks',()=>refusal(x=>{x.receipt.statement.decision_sha256='e'.repeat(64);}));
check('signed opaque order ref tampered blocks',()=>refusal(x=>{x.receipt.statement.opaque_order_ref='f'.repeat(64);}));
check('signed source time tampered blocks',()=>refusal(x=>{x.receipt.statement.source_observed_utc='2026-11-03T21:58:00.000Z';}));
check('writer signature tampered blocks',()=>refusal(x=>{x.receipt.writer_signature_base64=x.receipt.attester_signature_base64;}));
check('attester signature tampered blocks',()=>refusal(x=>{x.receipt.attester_signature_base64=x.receipt.writer_signature_base64;}));
check('wrong host blocks',()=>refusal(x=>{x.receipt.statement.host='FOXXY';}));
check('wrong unit blocks',()=>refusal(x=>{x.receipt.statement.unit='MOOCA';}));
check('wrong source kind blocks',()=>refusal(x=>{x.receipt.statement.source_kind='GESTOR';}));
check('raw ID in new statement field blocks',()=>refusal(x=>{x.receipt.statement.NRCOMANDA='RAW123';}));
check('raw customer data in input blocks',()=>refusal(x=>{x.customerName='PERSON';}));
check('expired receipt blocks',()=>refusal(x=>{x.now_utc='2026-11-03T22:06:00.000Z';}));
check('source observed after receipt blocks',()=>refusal(x=>{x.receipt.statement.source_observed_utc='2026-11-03T22:00:01.000Z';}));
check('receipt from future blocks',()=>refusal(x=>{x.now_utc='2026-11-03T21:58:00.000Z';}));
check('impossible UTC date blocks',()=>refusal(x=>{x.now_utc='2026-02-30T22:00:00.000Z';}));
check('non-UTC receipt date blocks',()=>refusal(x=>{x.receipt.statement.receipt_issued_utc='2026-11-03T18:59:00-03:00';}));
check('writer trust expired blocks',()=>refusal(x=>{x.trust.keys[0].not_after_utc='2026-11-03T20:00:00.000Z';}));
check('attester key pin fingerprint incorrect blocks',()=>refusal(x=>{x.trust.keys[1].key_id='9'.repeat(64);}));
check('attester public key same as writer blocks',()=>refusal(x=>{x.trust.keys[1].spki_der_base64=x.trust.keys[0].spki_der_base64;}));
check('missing receipt blocks',()=>refusal(x=>{delete x.receipt;}));
check('no raw notes, keys or PII exported in successful review',()=>{
 const value=JSON.stringify(R.review(make()));
 for(const invalid of ['NRCOMANDA','customerName','private_key','TESTORDER',
 'a'.repeat(64),'b'.repeat(64),'c'.repeat(64),W.row.spki_der_base64])
  assert.equal(value.includes(invalid),false,invalid);
});
check('caller-provided trust remains incapable of live authorization',()=>{
 const alternateWriter=create('READER_SOURCE_WRITER'),alternateAttester=create('INDEPENDENT_SOURCE_ATTESTER');
 const x=make();
 x.receipt.statement.writer_key_id=alternateWriter.row.key_id;
 x.receipt.statement.attester_key_id=alternateAttester.row.key_id;
 x.trust.keys=[d(alternateWriter.row),d(alternateAttester.row)];
 x.receipt.writer_signature_base64=crypto.sign(null,R.statementBytes(x.receipt.statement),alternateWriter.private).toString('base64');
 x.receipt.attester_signature_base64=crypto.sign(null,
  R.attestationBytes(x.receipt.statement,x.receipt.writer_signature_base64),
  alternateAttester.private).toString('base64');
 const y=R.review(x);
 assert.equal(y.cryptographicPairValid,true);
 assert.equal(y.sourceIdentityProven,false);
 assert.equal(y.ordersPublishable,0);
});
console.log('NATIVE_READER_SOURCE_RECEIPT_REVIEW_PASS '+n+'/'+n+' PURE_FAKE_KEYS');
