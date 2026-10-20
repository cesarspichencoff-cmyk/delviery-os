'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {SCHEMA,RESULT,STAGES,digest,review}=require('./comandas_human_custody_protocol_v842_offline.cjs');
const A='a'.repeat(64),B='b'.repeat(64),C='c'.repeat(64);
const request={request_id:'request:mooca-0042',store_id:'store:mooca',shift_record_id:'shift:20261020',from_revision:3,to_revision:4,from_sha256:A,to_sha256:B,target_shift:'JANTAR'};
const hash=digest(request);
const events=STAGES.map(([kind,actor_domain],i)=>({kind,actor_domain,request_sha256:hash,authorization_id:i===0?null:'grant:only-once-0042',observed_at_s:100+i*10,receipt_sha256:C,expires_at_s:i===2?500:null}));
const good={schema:SCHEMA,request,events};
let checks=0;
function check(name,fn){try{fn();checks++}catch(e){e.message='V842 '+name+': '+e.message;throw e}}
function noAuthority(x){assert.equal(x.schema,RESULT);for(const k of ['authenticated_human_proven','transaction_display_binding_proven','cryptographic_witness_signature_verified','independent_failure_domain_proven','independent_clock_and_revocation_proven','atomic_external_nonce_reservation_proven','real_protected_writer_verified','local_state_change_proven','durable_external_settlement_proven','operational_authorization','production_shift_changed','host_effects','filesystem','network','sql','printer','service','teknisa'])assert.equal(x[k],false,k)}
function hold(x,reason){const y=review(x);noAuthority(y);assert.equal(y.status,'HOLD');assert.ok(y.reasons.includes(reason),JSON.stringify(y))}
function clone(x=good){return structuredClone(x)}
check('complete synthetic sequence never operationally authorizes',()=>{const x=review(good);noAuthority(x);assert.equal(x.status,'REVIEW_ONLY_UNTRUSTED_SEQUENCE_COHERENT');assert.deepEqual(x.reasons,[])});
check('self-declared auth flag rejected',()=>hold({...good,human_authenticated:true},'ENVELOPE_INVALID'));
check('missing events not a success',()=>hold({...good,events:[]},'PROTOCOL_INCOMPLETE_REQUIRES_RECONCILIATION'));
check('request only must hold',()=>hold({...good,events:events.slice(0,1)},'PROTOCOL_INCOMPLETE_REQUIRES_RECONCILIATION'));
check('approval without reserve must hold',()=>hold({...good,events:events.slice(0,2)},'PROTOCOL_INCOMPLETE_REQUIRES_RECONCILIATION'));
check('reserved but not applied must hold',()=>hold({...good,events:events.slice(0,3)},'PROTOCOL_INCOMPLETE_REQUIRES_RECONCILIATION'));
check('applied without remote settlement must hold',()=>hold({...good,events:events.slice(0,4)},'PROTOCOL_INCOMPLETE_REQUIRES_RECONCILIATION'));
check('null envelope rejected',()=>hold(null,'ENVELOPE_INVALID'));
check('bad schema rejected',()=>hold({...good,schema:'production-allowed'},'ENVELOPE_INVALID'));
check('invalid request shape rejected',()=>hold({...good,request:{...request,local_approval:true}},'REQUEST_SHAPE_INVALID'));
check('duplicate request not allowed',()=>hold({...good,events:[...events,events[0]]},'EVENT_COUNT_INVALID'));
check('steps swapped rejected',()=>{const x=clone();[x.events[1],x.events[2]]=[x.events[2],x.events[1]];hold(x,'ORDER_OR_DUPLICATE_INVALID')});
check('reader pretending external custodian rejected',()=>{const x=clone();x.events[1].actor_domain='READER';hold(x,'ROLE_CLAIM_MISMATCH')});
check('wrong request hash rejected',()=>{const x=clone();x.events[1].request_sha256=A;hold(x,'SCOPE_DIGEST_MISMATCH')});
check('tampered request revision rejected',()=>{const x=clone();x.request.to_revision=99;hold(x,'REVISION_INVALID')});
check('tampered request shift rejected',()=>{const x=clone();x.request.target_shift='MANHA';hold(x,'TARGET_SHIFT_INVALID')});
check('same state digest rejected',()=>{const x=clone();x.request.to_sha256=A;hold(x,'PREPOST_HASH_INVALID')});
check('authorization id switched rejected',()=>{const x=clone();x.events[3].authorization_id='grant:different';hold(x,'AUTHORIZATION_ID_CHANGED')});
check('grant cannot appear in initial request',()=>{const x=clone();x.events[0].authorization_id='grant:fake';hold(x,'REQUEST_MUST_NOT_CONTAIN_GRANT')});
check('grant must have expiry',()=>{const x=clone();x.events[2].expires_at_s=null;hold(x,'EXPIRY_INVALID')});
check('grant above 15 minute limit rejected',()=>{const x=clone();x.events[2].expires_at_s=2000;hold(x,'EXPIRY_INVALID')});
check('apply at expiry rejected',()=>{const x=clone();x.events[2].expires_at_s=x.events[3].observed_at_s;hold(x,'CLAIMED_GRANT_EXPIRED')});
check('nonmonotonic claimed timestamps rejected',()=>{const x=clone();x.events[2].observed_at_s=110;hold(x,'CLAIMED_TIME_ORDER_INVALID')});
check('malformed receipt digest rejected',()=>{const x=clone();x.events[4].receipt_sha256='claimed-proof';hold(x,'RECEIPT_DIGEST_INVALID')});
check('untrusted expiry field on human event rejected',()=>{const x=clone();x.events[1].expires_at_s=500;hold(x,'EXPIRY_FIELD_UNEXPECTED')});
check('forged extra event field rejected',()=>{const x=clone();x.events[2].identity_verified=true;hold(x,'EVENT_SHAPE_INVALID')});
check('request from_revision invalid',()=>{const x=clone();x.request.from_revision=-1;hold(x,'REVISION_INVALID')});
check('request identifier invalid',()=>{const x=clone();x.request.request_id='..';hold(x,'REQUEST_ID_INVALID')});
check('receipt not verified by trustless hash',()=>{const x=clone();x.events[1].receipt_sha256='d'.repeat(64);const y=review(x);noAuthority(y);assert.equal(y.status,'REVIEW_ONLY_UNTRUSTED_SEQUENCE_COHERENT')});
check('module performs no filesystem reads',()=>{const rd=fs.readFileSync,st=fs.statSync;try{fs.readFileSync=()=>{throw Error('READ')};fs.statSync=()=>{throw Error('STAT')};const x=review(good);noAuthority(x);assert.equal(x.status,'REVIEW_ONLY_UNTRUSTED_SEQUENCE_COHERENT')}finally{fs.readFileSync=rd;fs.statSync=st}});
assert.equal(checks,30,'V842_COUNT_DRIFT');
console.log(JSON.stringify({schema:'deliveryos.comandas.v842.protocol-adversarial-tests',status:'PASS',checks,review_only:true,real_human_authenticated:false,external_witness_proven:false,atomic_external_nonce_proven:false,real_shift_changed:false,production_authorized:false,host_effects:false,teknisa:false,sql:false,printer:false,service:false}));
