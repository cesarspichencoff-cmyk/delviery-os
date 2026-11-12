'use strict';
// Self-attested, in-memory samples only. No service, database or persistence.
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const digest=s=>createHash('sha256').update(s,'utf8').digest('hex');
const {SCHEMA,genesis,makeReceipt,review}=
 require('./comandas_reader_local_receipt_journal_review_only.cjs');
const G='a'.repeat(32),A='a'.repeat(64),B='b'.repeat(64),C='c'.repeat(64);
const K='0001|01|LABSALE1|LABCMD1';
const clone=x=>JSON.parse(JSON.stringify(x));
function sample(kinds=[],hashes=[]){
 const journal=[],files=[];
 let prior=genesis(G);
 for(let i=0;i<kinds.length;i++){
  const snapshot=hashes[i]||A;
  const raw=kinds[i]==='EVENT_FILE_WRITTEN'
    ?JSON.stringify({schema:'tata.comandas.reader-event-witness-review.v1',
       local_seq:i+1,order_key:K,snapshot_hash:snapshot})
    :null;
  const rec=makeReceipt({generation_id:G,seq:i+1,
   kind:kinds[i],order_key:K,snapshot_hash:snapshot,
   prev_hash:prior,event_bytes_sha256:raw?digest(raw):null});
  journal.push(rec);prior=rec.receipt_hash;
  if(raw!==null)
   files.push({seq:rec.seq,receipt_hash:rec.receipt_hash,
    filename:'local_'+rec.seq+'_'+rec.snapshot_hash+'.json',
    json_utf8:raw,raw_sha256:digest(raw)});
 }
 return {schema:SCHEMA,checkpoint:{generation_id:G,last_seq:journal.length,
   last_receipt_hash:prior,
   entries:[{order_key:K,snapshot_hash:hashes.at(-1)||A}]},
  journal,event_witnesses:files};
}
let n=0;function test(label,run){run();n++;console.log('PASS '+label)}
function hold(x,reason){
 const r=review(x);
 assert.equal(r.status,'HOLD');assert.equal(r.reason,reason);
 for(const f of ['native_order_revision_proven','native_transaction_atomicity_proven',
  'all_source_transitions_observed','local_journal_durable_proven',
  'journal_origin_authenticated','no_reemit_proven','no_loss_proven',
  'migration_authorized','print_authorized'])assert.equal(r[f],false);
 assert.equal(r.recoverable_events,null);
 assert.ok(Object.values(r.effects).every(x=>x===false));
 return r;
}
const matched='LOCAL_OBSERVATION_CHAIN_ONLY_NO_SOURCE_PROOF';
test('empty history still provides no external proof',()=>{
 const x=sample();x.checkpoint.entries=[];
 assert.equal(hold(x,matched).witnessed_local_occurrences,0);
});
test('one observed revision is merely a local claim',()=>{
 const x=sample(['OBSERVED']);assert.equal(hold(x,matched).witnessed_local_occurrences,1);
});
test('bootstrap suppression is not an event and never print authority',()=>{
 const x=sample(['BOOTSTRAP_SUPPRESSED']);
 assert.equal(hold(x,matched).witnessed_files,0);
});
test('file-recorded receipt and witness are still self attested',()=>{
 const x=sample(['EVENT_FILE_WRITTEN']);
 assert.equal(hold(x,matched).witnessed_files,1);
});
test('three distinct local observations A B A have distinct sequence receipts',()=>{
 const x=sample(['OBSERVED','OBSERVED','OBSERVED'],[A,B,A]);
 assert.equal(new Set(x.journal.map(r=>r.receipt_hash)).size,3);
 assert.equal(hold(x,matched).witnessed_local_occurrences,3);
});
test('repeat A with separate observed occurrence has another sequence',()=>{
 const x=sample(['OBSERVED','OBSERVED'],[A,A]);
 assert.notEqual(x.journal[0].receipt_hash,x.journal[1].receipt_hash);
 hold(x,matched);
});
test('identical source A after unobserved B remains indistinguishable',()=>{
 const x=sample(['OBSERVED']);hold(x,matched);
 assert.equal(x.journal.length,1);
});
test('crash after journal append but before checkpoint is blocked',()=>{
 const x=sample(['OBSERVED','EVENT_FILE_WRITTEN']);x.checkpoint.last_seq=1;
 x.checkpoint.last_receipt_hash=x.journal[0].receipt_hash;
 hold(x,'CHECKPOINT_BEHIND_JOURNAL_RECOVERY_UNPROVEN');
});
test('checkpoint ahead after journal loss is blocked',()=>{
 const x=sample(['OBSERVED','EVENT_FILE_WRITTEN']);x.journal.pop();
 x.event_witnesses=[];
 hold(x,'CHECKPOINT_AHEAD_OF_JOURNAL');
});
test('checkpoint digest diverges from journal tip',()=>{
 const x=sample(['OBSERVED']);x.checkpoint.last_receipt_hash=C;
 hold(x,'CHECKPOINT_JOURNAL_FORK');
});
test('missing file witness is not counted as persisted event',()=>{
 const x=sample(['EVENT_FILE_WRITTEN']);x.event_witnesses=[];
 hold(x,'JOURNALED_EVENT_FILE_MISSING');
});
test('orphan event file without journal cannot establish existence',()=>{
 const x=sample();x.checkpoint.entries=[];
 x.event_witnesses=sample(['EVENT_FILE_WRITTEN']).event_witnesses;
 hold(x,'ORPHAN_OR_WRONG_EVENT_WITNESS');
});
test('event witness for bootstrap suppression cannot be adopted',()=>{
 const x=sample(['BOOTSTRAP_SUPPRESSED']);
 x.event_witnesses=[{...sample(['EVENT_FILE_WRITTEN']).event_witnesses[0],
  receipt_hash:x.journal[0].receipt_hash}];
 hold(x,'ORPHAN_OR_WRONG_EVENT_WITNESS');
});
test('file witness receipt SHA mismatch blocked',()=>{
 const x=sample(['EVENT_FILE_WRITTEN']);x.event_witnesses[0].receipt_hash=C;
 hold(x,'ORPHAN_OR_WRONG_EVENT_WITNESS');
});
test('wrong filename blocked',()=>{
 const x=sample(['EVENT_FILE_WRITTEN']);x.event_witnesses[0].filename='other.json';
 hold(x,'FILE_WITNESS_NAME_MISMATCH');
});
test('duplicate case-insensitive filename blocked',()=>{
 const x=sample(['EVENT_FILE_WRITTEN']);
 x.event_witnesses.push({...x.event_witnesses[0],filename:x.event_witnesses[0].filename.toUpperCase()});
 hold(x,'FILE_WITNESS_INVALID');
});
test('path traversal cannot escape fixture review',()=>{
 const x=sample(['EVENT_FILE_WRITTEN']);x.event_witnesses[0].filename='../oops';
 hold(x,'FILE_WITNESS_INVALID');
});
test('journal gap in local sequence fails closed',()=>{
 const x=sample(['OBSERVED','OBSERVED']);x.journal[1].seq=3;
 hold(x,'JOURNAL_SEQUENCE_OR_GENERATION_INVALID');
});
test('generation mismatch is not adopted',()=>{
 const x=sample(['OBSERVED']);x.journal[0].generation_id='b'.repeat(32);
 hold(x,'JOURNAL_SEQUENCE_OR_GENERATION_INVALID');
});
test('broken previous receipt hash refuses replay',()=>{
 const x=sample(['OBSERVED']);x.journal[0].prev_hash=C;
 hold(x,'JOURNAL_HASH_CHAIN_BROKEN');
});
test('edited observation content without rehashing refuses replay',()=>{
 const x=sample(['OBSERVED']);x.journal[0].snapshot_hash=B;
 hold(x,'JOURNAL_RECEIPT_CONTENT_CHANGED');
});
test('rollback of journal and checkpoint together remains undetectable structurally',()=>{
 const x=sample(['OBSERVED','EVENT_FILE_WRITTEN']);
 const rolled=clone(x);rolled.journal.pop();rolled.event_witnesses=[];
 rolled.checkpoint.last_seq=1;
 rolled.checkpoint.last_receipt_hash=rolled.journal[0].receipt_hash;
 hold(rolled,matched);
});
test('forged internally consistent chain can never prove native origin',()=>{
 const x=sample(['OBSERVED','OBSERVED'],[A,B]);
 const t=makeReceipt({...x.journal[1],snapshot_hash:C});
 x.journal[1]=t;x.checkpoint.last_receipt_hash=t.receipt_hash;
 x.checkpoint.entries[0].snapshot_hash=C;
 hold(x,matched);
});
test('more than 250 observations do not erase a local chain in memory',()=>{
 const x=sample(Array(251).fill('OBSERVED'));
 assert.equal(x.journal.length,251);
 assert.equal(hold(x,matched).witnessed_local_occurrences,251);
});
test('a checkpoint with 251 entries cannot be treated as durable state',()=>{
 const x=sample();x.checkpoint.entries=Array.from({length:251},(_,i)=>({
  order_key:'0001|01|LABSALE'+i+'|LABCMD'+i,snapshot_hash:A}));
 hold(x,'CHECKPOINT_SHAPE_INVALID');
});
test('case insensitive checkpoint identity duplicates are refused',()=>{
 const x=sample();x.checkpoint.entries.push({order_key:K.toLowerCase(),snapshot_hash:A});
 hold(x,'CHECKPOINT_ENTRIES_INVALID');
});
test('checkpoint restore from a different generation blocked',()=>{
 const x=sample(['OBSERVED']);x.checkpoint.generation_id='b'.repeat(32);
 hold(x,'JOURNAL_SEQUENCE_OR_GENERATION_INVALID');
});
test('no emission decisions returned for complete synthetic A B A with files',()=>{
 const x=sample(['EVENT_FILE_WRITTEN','EVENT_FILE_WRITTEN','EVENT_FILE_WRITTEN'],[A,B,A]);
 const r=hold(x,matched);
 assert.equal(r.witnessed_files,3);assert.equal(r.recoverable_events,null);
});
test('unknown checkpoint key cannot be fabricated',()=>{
 const x=sample(['OBSERVED']);x.checkpoint.entries[0].order_key='0001|01|FAKE|CMD';
 hold(x,'CHECKPOINT_ORDER_NOT_IN_JOURNAL');
});
test('checkpoint must match final journal snapshot for its key',()=>{
 const x=sample(['OBSERVED']);x.checkpoint.entries[0].snapshot_hash=B;
 hold(x,'CHECKPOINT_LAST_OBSERVED_HASH_MISMATCH');
});
test('extra checkpoint field cannot silently extend authority',()=>{
 const x=sample(['OBSERVED']);x.checkpoint.print_authorized=true;
 hold(x,'CHECKPOINT_SHAPE_INVALID');
});
test('extra journal field cannot be excluded from receipt digest',()=>{
 const x=sample(['OBSERVED']);x.journal[0].source_attested=true;
 hold(x,'JOURNAL_SEQUENCE_OR_GENERATION_INVALID');
});
test('extra witness field cannot claim physical print',()=>{
 const x=sample(['EVENT_FILE_WRITTEN']);x.event_witnesses[0].printed=true;
 hold(x,'FILE_WITNESS_INVALID');
});
test('root extras cannot claim an authenticated source',()=>{
 const x=sample(['OBSERVED']);x.source_receipt='FORGED';
 hold(x,'INPUT_INVALID');
});
test('edited file bytes with unchanged digest refused',()=>{
 const x=sample(['EVENT_FILE_WRITTEN']);x.event_witnesses[0].json_utf8+=' ';
 hold(x,'EVENT_WITNESS_BYTES_INVALID');
});
test('edited file bytes with recomputed self hash but stale journal refused',()=>{
 const x=sample(['EVENT_FILE_WRITTEN']);const w=x.event_witnesses[0];
 const event=JSON.parse(w.json_utf8);event.order_key='0001|01|OTHER|CMD';
 w.json_utf8=JSON.stringify(event);w.raw_sha256=digest(w.json_utf8);
 hold(x,'EVENT_WITNESS_RECEIPT_DIGEST_MISMATCH');
});
test('malformed JSON with updated self hash is refused',()=>{
 const x=sample(['EVENT_FILE_WRITTEN']);const w=x.event_witnesses[0];
 w.json_utf8='{invalid_json';w.raw_sha256=digest(w.json_utf8);
 hold(x,'EVENT_WITNESS_JSON_INVALID');
});
test('extra payload field is not silently normalized away',()=>{
 const x=sample(['EVENT_FILE_WRITTEN']);const w=x.event_witnesses[0];
 const event=JSON.parse(w.json_utf8);event.printed=true;
 w.json_utf8=JSON.stringify(event);w.raw_sha256=digest(w.json_utf8);
 hold(x,'EVENT_WITNESS_CONTENT_INVALID');
});
test('rewritten payload identity with full self-consistent SHA still mismatches receipt',()=>{
 const x=sample(['EVENT_FILE_WRITTEN']);const w=x.event_witnesses[0];
 const event=JSON.parse(w.json_utf8);event.order_key='0001|01|FORGED|CMD';
 w.json_utf8=JSON.stringify(event);w.raw_sha256=digest(w.json_utf8);
 const rec=makeReceipt({...x.journal[0],event_bytes_sha256:w.raw_sha256});
 x.journal[0]=rec;w.receipt_hash=rec.receipt_hash;
 x.checkpoint.last_receipt_hash=rec.receipt_hash;
 hold(x,'EVENT_WITNESS_PAYLOAD_MISMATCH');
});
test('UTF8 BOM cannot be a canonical witness',()=>{
 const x=sample(['EVENT_FILE_WRITTEN']);const w=x.event_witnesses[0];
 w.json_utf8='\uFEFF'+w.json_utf8;w.raw_sha256=digest(w.json_utf8);
 hold(x,'EVENT_WITNESS_BYTES_INVALID');
});
test('oversized self-reported event is refused',()=>{
 const x=sample(['EVENT_FILE_WRITTEN']);const w=x.event_witnesses[0];
 w.json_utf8=w.json_utf8+' '.repeat(1048577);w.raw_sha256=digest(w.json_utf8);
 hold(x,'EVENT_WITNESS_BYTES_INVALID');
});
test('a complete local A B A chain with three independent byte digests still HOLDs',()=>{
 const x=sample(['EVENT_FILE_WRITTEN','EVENT_FILE_WRITTEN','EVENT_FILE_WRITTEN'],[A,B,A]);
 const r=hold(x,matched);
 assert.equal(new Set(x.event_witnesses.map(w=>w.raw_sha256)).size,3);
 assert.equal(r.witnessed_files,3);
});
if(n!==42)throw Error('UNEXPECTED_CASE_COUNT_'+n);
console.log('READER_LOCAL_RECEIPT_JOURNAL_REVIEW_PASS '+n+'/'+n+
 ' SYNTHETIC_ONLY ALWAYS_HOLD NO_SOURCE_NO_SQL_NO_PRINT');
