"use strict";
/**
 * V2 signed ledger core: disposable SQLite file tests, NO operational host.
 * The module has no DB open/file handling of its own and cannot print.
 * Every identity and key in this test is synthetic.
 */
const assert=require("node:assert/strict");
const fs=require("node:fs"),os=require("node:os"),path=require("node:path"),crypto=require("node:crypto");
const {DatabaseSync}=require("node:sqlite");
const {syntheticReaderPairV857}=require("./verificar_tata_comanda_reader_native_v857_offline.cjs");
const {snapshotHash,decisionHash}=require("./tata_comanda_reader_native_essentials_v857_offline.cjs");
const {inspectStrongKeySequence,STATE_SCHEMA}=require("./comandas_strong_key_sequence_v2_review_only.cjs");
const C=require("./comandas_sequence_v2_authorized_ledger_core_v1.cjs");
const {reviewPersistedDayWriterReceiptsV1:reviewReceipts}=
 require("./comandas_sequence_v2_writer_receipt_review_v1.cjs");
const {attestSignedLedgerV2}=require("./comandas_sequence_v2_independent_attester_core_v1.cjs");
const A=require("../dist/src/production/tataSequenceAttestationV1.js");
const N=require("../dist/src/production/nativeReaderChainV1.js");
const temp=fs.mkdtempSync(path.join(os.tmpdir(),"comandas-authorized-test-"));
const file=path.join(temp,"synthetic-ledger-only.sqlite");
const writer=crypto.generateKeyPairSync("ed25519"),otherWriter=crypto.generateKeyPairSync("ed25519");
const attester=crypto.generateKeyPairSync("ed25519");
const pk=k=>k.export({type:"spki",format:"der"}).toString("base64");
const id=k=>crypto.createHash("sha256").update(k.export({type:"spki",format:"der"})).digest("hex");
const writerId=id(writer.publicKey),otherWriterId=id(otherWriter.publicKey),attesterId=id(attester.publicKey);
const NOW=Math.floor(Date.parse("2026-11-03T16:00:00Z")/1000);
const anchors={schema:C.WRITERS,store:"0001|01",writer_key_ids:[writerId],
 attester_key_ids:[attesterId],writer_anchors:[{key_id:writerId,
  public_key_spki_base64:pk(writer.publicKey),role:"TATA_SEQUENCE_WRITER",
  scope:"PRODUCTION_ITAIM",not_before_s:NOW-86400,not_after_s:NOW+86400}]};
const makePair=(id,day="2026-11-03",header="3")=>{
 const p=syntheticReaderPairV857(),o=p.event.order;
 o.NRVENDAREST="TEST_"+id;o.NRCOMANDA="TEST_"+id;
 o.DTHRABERMESA=day+"T13:00:00.0000000";o.IDSTCOMANDA=header;
 for(const x of o.items)x.IDSTPRCOMVEN="4";
 const key=[o.CDFILIAL,o.CDLOJA,o.NRVENDAREST,o.NRCOMANDA].join("|");
 p.event.order_key=key;p.decision.order_key=key;p.decision.teknisa_sequence=o.NRCOMANDA;
 p.event.snapshot_hash=snapshotHash(o);p.decision.snapshot_hash=p.event.snapshot_hash;
 p.decision.fingerprint=decisionHash(p.decision);
 return p;
};
const request=(pair,{key=writer.privateKey,keyId=writerId,issuedAt=NOW,nonce=crypto.randomBytes(16).toString("hex")}={})=>{
 const o=pair.event.order;
 const x={schema:C.REQUEST,store:"0001|01",day:o.DTHRABERMESA.slice(0,10),
 order_key:pair.event.order_key,writer_key_id:keyId,issued_at_s:issuedAt,nonce};
 return {...x,signature_base64:crypto.sign(null,C.writerPayloadV1(x),key).toString("base64")};
};
let db,n=0;const test=(s,f)=>{f();process.stdout.write("PASS "+(++n)+" "+s+"\n");};
const orderA=makePair("A"),orderB=makePair("B"),nextDay=makePair("A","2026-11-04");
const bind=(pair,req=request(pair),trust=anchors,now=NOW)=>
 C.bindAuthorizedNativeV2(db,pair,req,trust,now);
const rows=()=>db.prepare("SELECT scope,order_key,seq,writer_key_id,request_issued_at_s,request_nonce,request_signature_base64 FROM tata_seq_v2_binding ORDER BY scope,seq").all();
const actualState=()=>({schema:STATE_SCHEMA,policy:{width:3,min_value:1,max_value:999},
 bindings:rows().map(r=>({scope_id:r.scope,native_order_key:r.order_key,
  tata_sequence:String(r.seq).padStart(3,"0")}))});
const digest=()=>crypto.createHash("sha256").update(JSON.stringify(rows())).digest("hex");
try{
 db=new DatabaseSync(file);
 db.exec("PRAGMA journal_mode=WAL");
 db.exec("PRAGMA synchronous=FULL");
 for(const sql of C.schemaStatementsV1())db.exec(sql);
 test("signed writer appends 001 durably but never returns an operational print number",()=>{
  const out=bind(orderA);
  assert.equal(out.status,"V2_BOUND_PERSISTED_NOT_ATTESTED",JSON.stringify(out));
  assert.equal(out.bound_number_for_attester,"001");
  assert.equal(out.number_for_operational_ticket,null);
  assert.equal(out.live_attested,false);assert.equal(out.print_authorized,false);
  assert.ok(Object.values(out.effects).every(x=>x===false));
  assert.equal(inspectStrongKeySequence({pair:orderA,state:actualState()}).status,
   "STRONG_KEY_PRESENT_IN_SUPPLIED_STATE_NOT_ATTESTED");
 });
 test("persisted writer receipt independently validates signature and rejects tampering",()=>{
  const row=rows()[0];
  assert.equal(row.request_issued_at_s,NOW);
  assert.ok(/^[a-f0-9]{32}$/.test(row.request_nonce));
  assert.ok(/^[A-Za-z0-9+/]{86}==$/.test(row.request_signature_base64));
  const scope="STORE:0001/01|DATE:2026-11-03";
  const clean=reviewReceipts(db,scope,anchors);
  assert.equal(clean.status,"SIGNED_DAY_RECEIPTS_VERIFIED_READ_ONLY_NOT_ATTESTED",JSON.stringify(clean));
  assert.equal(clean.row_count,1);
  assert.equal(clean.number_for_operational_ticket,null);
  // Corruption only inside a rolled-back transaction on the DISPOSABLE database.
  db.exec("BEGIN IMMEDIATE");
  try{
   db.exec("DROP TRIGGER tata_seq_v2_binding_no_update");
   db.prepare("UPDATE tata_seq_v2_binding SET request_signature_base64=? WHERE scope=? AND seq=1")
    .run("A".repeat(86)+"==",scope);
   assert.equal(reviewReceipts(db,scope,anchors).reason,"HISTORIC_WRITER_SIGNATURE_INVALID");
  }finally{db.exec("ROLLBACK");}
  assert.equal(reviewReceipts(db,scope,anchors).status,
    "SIGNED_DAY_RECEIPTS_VERIFIED_READ_ONLY_NOT_ATTESTED");
 });
 test("same order across revisions keeps 001 without another commit",()=>{
  const before=digest();
  const p=structuredClone(orderA);
  // Only a new signed request for this same persisted source identity.
  const again=bind(p);
  assert.equal(again.status,"V2_BOUND_REUSED_NOT_ATTESTED",JSON.stringify(again));
  assert.equal(again.bound_number_for_attester,"001");
  assert.equal(digest(),before);
 });
 test("different order obtains 002, no number collision",()=>{
  const out=bind(orderB);
  assert.equal(out.bound_number_for_attester,"002");
  assert.equal(out.status,"V2_BOUND_PERSISTED_NOT_ATTESTED");
  assert.equal(rows().filter(x=>x.scope==="STORE:0001/01|DATE:2026-11-03").length,2);
 });
 test("another local store day starts from 001 without touching the previous day",()=>{
  const out=bind(nextDay);
  assert.equal(out.bound_number_for_attester,"001");
  assert.equal(rows().length,3);
  assert.equal(inspectStrongKeySequence({pair:nextDay,state:actualState()}).status,
   "STRONG_KEY_PRESENT_IN_SUPPLIED_STATE_NOT_ATTESTED");
 });
 test("independent read-only attester verifies receipts before signing; test scope never prints",()=>{
  const attTrust={schema:A.TATA_ATTESTERS_SCHEMA_V1,store:"0001|01",
   writer_key_ids:[writerId],attesters:[{
    key_id:attesterId,role:"TATA_SEQUENCE_ATTESTER",scope:"TEST_ISOLATED",
    not_before_s:NOW-3600,not_after_s:NOW+3600,
    public_key_spki_base64:pk(attester.publicKey)}]};
  const ro=new DatabaseSync(file,{readOnly:true});
  try{
   const args={db:ro,pair:orderB,writerTrust:anchors,attesterTrust:attTrust,
    attesterPrivateKey:attester.privateKey,nowS:NOW,nonce:"b".repeat(32)};
   const signed=attestSignedLedgerV2(args);
   assert.equal(signed.status,"SIGNED_WRITER_LEDGER_ATTESTED_NOT_PRINT_AUTHORIZED",
    JSON.stringify(signed));
   assert.ok(/^[a-f0-9]{64}$/.test(signed.signed_writer_receipts_sha256));
   assert.equal(signed.number_for_operational_ticket,null);
   assert.equal(signed.print_authorized,false);
   assert.equal(A.verifyTataSequenceAttestationV1(signed.attestation,attTrust,NOW).ok,true);
   const state=actualState(),inspection=inspectStrongKeySequence({pair:orderB,state});
   const chain=N.sequenceVerdictV1(signed.chain_binding,orderB.event,{
    attesters:attTrust,now_s:NOW,ledger:{inspection_status:inspection.status,
     review_binding_number:inspection.review_binding_number,
     rows:state.bindings.filter(b=>b.scope_id==="STORE:0001/01|DATE:2026-11-03")}});
   assert.equal(chain.level,"CANDIDATE_PERSISTED_IN_LAB");
   assert.equal(chain.candidate_number,"002");
   assert.equal(chain.number,null);
   const noKeys=attestSignedLedgerV2({...args,attesterTrust:{...attTrust,attesters:[]}});
   assert.equal(noKeys.status,"HOLD");
   const unsigned=attestSignedLedgerV2({...args,writerTrust:{...anchors,writer_key_ids:[]}});
   assert.equal(unsigned.status,"HOLD");
  }finally{ro.close();}
 });
 test("untrusted writer, unsigned writer and malformed signature cause zero writes",()=>{
  const before=digest();
  const p=makePair("C"),r=request(p);
  assert.match(bind(p,r,{...anchors,writer_key_ids:[]}).reason,/WRITER_NOT_PROVISIONED/);
  assert.match(bind(p,r,{...anchors,writer_key_ids:[otherWriterId]}).reason,/WRITER_NOT_PROVISIONED/);
  assert.equal(bind(p,{...r,signature_base64:"x"}).reason,"WRITER_SIGNATURE_INVALID");
  assert.equal(digest(),before);
 });
 test("changed signed order cannot allocate a number to a different native revision",()=>{
  const before=digest(),r=request(orderA);
  assert.equal(bind(makePair("C"),r).reason,"WRITER_REQUEST_NOT_BOUND_TO_NATIVE_PAIR");
  assert.equal(digest(),before);
 });
 test("expired request or expired writer anchor cannot write",()=>{
  const before=digest(),p=makePair("D");
  assert.equal(bind(p,request(p,{issuedAt:NOW-180})).reason,"WRITER_REQUEST_INVALID_OR_EXPIRED");
  assert.equal(bind(p,request(p),{...anchors,writer_anchors:[{...anchors.writer_anchors[0],
    not_after_s:NOW-1}]}).reason,"WRITER_ANCHOR_EXPIRED_OR_INVALID");
  assert.equal(digest(),before);
 });
 test("a writer is not an attester and another writer cannot take over an order",()=>{
  const before=digest();
  assert.equal(bind(makePair("E"),request(makePair("E")),
   {...anchors,attester_key_ids:[writerId]}).reason,"WRITER_NOT_PROVISIONED_OR_NOT_SEPARATED");
  const r=request(orderA,{key:otherWriter.privateKey,keyId:otherWriterId});
  const expanded={...anchors,writer_key_ids:[writerId,otherWriterId],
    writer_anchors:[...anchors.writer_anchors,{...anchors.writer_anchors[0],
      key_id:otherWriterId,public_key_spki_base64:pk(otherWriter.publicKey)}]};
  assert.equal(bind(orderA,r,expanded).reason,"ORDER_WRITER_IDENTITY_CHANGED");
  assert.equal(digest(),before);
 });
 test("canceled native revision never gets a new binding",()=>{
  const p=makePair("Z","2026-11-03","4"),before=digest();
  const v=bind(p);
  assert.equal(v.status,"HOLD");assert.match(v.reason,/NATIVE_REVISION_NOT_ELIGIBLE/);
  assert.equal(digest(),before);
 });
 test("ledger immutable binding and no silent repair of a daily gap",()=>{
  assert.throws(()=>db.prepare("DELETE FROM tata_seq_v2_binding").run(),/IMMUTABLE_BINDING/);
  assert.throws(()=>db.prepare("UPDATE tata_seq_v2_binding SET seq=99").run(),/IMMUTABLE_BINDING/);
  const before=digest();
  // Only the disposable test fixture is altered and then restored.
  const scope="STORE:0001/01|DATE:2026-11-03";
  const oldHead=db.prepare("SELECT highest FROM tata_seq_v2_head WHERE scope=?").get(scope).highest;
  db.prepare("UPDATE tata_seq_v2_head SET highest=5 WHERE scope=?").run(scope);
  try{
   const held=bind(makePair("F"));
   assert.equal(held.reason,"LEDGER_DAY_NOT_CONTIGUOUS_OR_UNTRUSTED");
   assert.equal(digest(),before);
  }finally{
   db.prepare("UPDATE tata_seq_v2_head SET highest=? WHERE scope=?").run(oldHead,scope);
  }
 });
 test("persisted DB survives close/reopen with the exact same binding",()=>{
  db.close();db=new DatabaseSync(file);
  assert.equal(rows().length,3);
  assert.equal(rows().find(r=>r.order_key===orderA.event.order_key).seq,1);
  const ro=new DatabaseSync(file,{readOnly:true});
  try{
   for(const day of ["2026-11-03","2026-11-04"]){
    const reviewed=reviewReceipts(ro,"STORE:0001/01|DATE:"+day,anchors);
    assert.equal(reviewed.status,"SIGNED_DAY_RECEIPTS_VERIFIED_READ_ONLY_NOT_ATTESTED",
     JSON.stringify(reviewed));
    assert.equal(reviewed.print_authorized,false);
   }
  }finally{ro.close();}
 });
 test("read-only database cannot allocate or alter a number",()=>{
  const ro=new DatabaseSync(file,{readOnly:true});
  try{
   const before=digest(),p=makePair("G");
   const held=C.bindAuthorizedNativeV2(ro,p,request(p),anchors,NOW);
   assert.equal(held.status,"HOLD");
   assert.equal(digest(),before);
  }finally{ro.close();}
 });
 test("without a signed writer and a provisioned trust set, no operation begins",()=>{
  const p=makePair("H"),before=digest();
  const missing=C.bindAuthorizedNativeV2(db,p,null,anchors,NOW);
  assert.equal(missing.status,"HOLD");
  const empty=C.bindAuthorizedNativeV2(db,p,request(p),{...anchors,writer_key_ids:[],
   writer_anchors:[]},NOW);
  assert.equal(empty.status,"HOLD");
  assert.equal(digest(),before);
 });
 process.stdout.write("COMANDAS_SIGNED_V2_LEDGER_CORE="+n+"/"+n+
  " PASS; DISPOSABLE_DB_ONLY; LIVE_ATTESTED=false PRINT=false\n");
}finally{try{db?.close()}catch{}fs.rmSync(temp,{recursive:true,force:true});}
