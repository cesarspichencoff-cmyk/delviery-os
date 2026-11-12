"use strict";
/**
 * TATÁ number attestation protocol, validated in ISOLATION. A writer binds
 * native TEST_ revisions in the disposable SQLite lab; an independent
 * attester (other process, other Ed25519 key, read-only ledger) re-checks the
 * day ledger with the V2 policy and signs a statement; the chain accepts the
 * number only with a trusted key, a clock and the ledger rechecked. Keys are
 * ephemeral; nothing here is a production key, a real binding or paper.
 */
const assert=require("node:assert/strict");
const fs=require("node:fs"),os=require("node:os"),path=require("node:path"),crypto=require("node:crypto");
const {spawnSync}=require("node:child_process");
const {DatabaseSync}=require("node:sqlite");
const {syntheticReaderPairV857}=require("./verificar_tata_comanda_reader_native_v857_offline.cjs");
const {snapshotHash,decisionHash}=require("./tata_comanda_reader_native_essentials_v857_offline.cjs");
const {createSyntheticTables}=require("./comandas_sequence_v2_sqlite_lab.cjs");
const {bindNativeRevisionInLabV2,exportLabStateV2}=require("./comandas_sequence_v2_native_lab_v1.cjs");
const ATTESTER=path.join(__dirname,"comandas_sequence_v2_attestation_lab_v1.cjs");
const {attestInIsolationV1,openLedgerReadOnlyV1}=require(ATTESTER);
const A=require("../dist/src/production/tataSequenceAttestationV1.js");
const N=require("../dist/src/production/nativeReaderChainV1.js");
const {inspectStrongKeySequence}=require("./comandas_strong_key_sequence_v2_review_only.cjs");
const ROOT=path.join(__dirname,"..");

const D1="2026-11-06",D2="2026-11-07",NOW=1793620000;
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),"comandas-atomic-test-"));
const dbPath=path.join(tmp,"synthetic-only.sqlite");
let db,n=0;
const test=(name,fn)=>{fn();console.log("PASS "+(++n)+" "+name);};
function pairFor(id,dthr,{header="3"}={}){
 const p=syntheticReaderPairV857(),o=p.event.order;
 o.NRVENDAREST="TEST_"+id;o.NRCOMANDA="TEST_"+id;o.DTHRABERMESA=dthr;o.IDSTCOMANDA=header;
 o.items.forEach(x=>x.IDSTPRCOMVEN="4");
 const key=[o.CDFILIAL,o.CDLOJA,o.NRVENDAREST,o.NRCOMANDA].join("|");
 p.event.order_key=key;p.decision.order_key=key;p.decision.teknisa_sequence=o.NRCOMANDA;
 p.event.snapshot_hash=snapshotHash(o);p.decision.snapshot_hash=p.event.snapshot_hash;
 p.decision.fingerprint=decisionHash(p.decision);
 return p;
}
const at=(day,hms)=>day+"T"+hms+".0000000";
const spki=k=>k.export({type:"spki",format:"der"}).toString("base64");
const writer=crypto.generateKeyPairSync("ed25519"),attester=crypto.generateKeyPairSync("ed25519");
const WRITER_ID=A.publicKeyIdV1(writer.publicKey),ATTESTER_ID=A.publicKeyIdV1(attester.publicKey);
const anchors=(scope,key=attester.publicKey,extra={})=>({schema:A.TATA_ATTESTERS_SCHEMA_V1,store:"0001|01",
 writer_key_ids:[WRITER_ID],attesters:[{key_id:A.publicKeyIdV1(key),role:"TATA_SEQUENCE_ATTESTER",scope,
  not_before_s:NOW-86400,not_after_s:NOW+86400,public_key_spki_base64:spki(key),...extra}]});
const keyFile=(k,name)=>{const f=path.join(tmp,name);fs.writeFileSync(f,k.export({type:"pkcs8",format:"pem"}));return f;};
const attesterKeyFile=keyFile(attester.privateKey,"attester-key.pem");
/** The attester runs as ANOTHER process with its own key and a read-only ledger. */
function attestInChild(pair,{key=attesterKeyFile,writerId=WRITER_ID,now=NOW,mode="attest"}={}){
 const pf=path.join(tmp,"pair-"+crypto.randomUUID()+".json");fs.writeFileSync(pf,JSON.stringify(pair));
 const c=spawnSync(process.execPath,[ATTESTER,mode,dbPath,pf,key,writerId,String(now),
  crypto.randomBytes(16).toString("hex")],{encoding:"utf8",timeout:20000});
 return {child:c,result:c.stdout?JSON.parse(c.stdout):null};
}
const digest=()=>crypto.createHash("sha256").update(JSON.stringify([
 db.prepare("SELECT * FROM test_tata_seq_head ORDER BY scope").all(),
 db.prepare("SELECT * FROM test_tata_seq_bind ORDER BY scope,seq").all()])).digest("hex");
function ledgerFor(pair){
 const state=exportLabStateV2(db),o=pair.event.order;
 const v2="STORE:"+o.CDFILIAL+"/"+o.CDLOJA+"|DATE:"+o.DTHRABERMESA.slice(0,10);
 return {...state,bindings:state.bindings.filter(b=>b.scope_id===v2)};
}
function verdict(pair,claim,{anchorSet=anchors("TEST_ISOLATED"),now=NOW,ledger=ledgerFor(pair)}={}){
 const inspection=ledger?inspectStrongKeySequence({pair,state:ledger}):null;
 return N.sequenceVerdictV1(claim,pair.event,{attesters:anchorSet,now_s:now,
  ledger:ledger?{inspection_status:inspection.status,review_binding_number:inspection.review_binding_number??null,
   rows:ledger.bindings}:null});
}
function resign(att,changes,key=attester.privateKey){
 const st={...att,...changes};delete st.signature_base64;
 return {...st,signature_base64:crypto.sign(null,A.attestationPayloadV1(st),key).toString("base64")};
}

try{
 db=new DatabaseSync(dbPath,{timeout:5000});createSyntheticTables(db);
 const p1=pairFor("V01",at(D1,"11:05:12")),p2=pairFor("V02",at(D1,"19:40:00"));
 bindNativeRevisionInLabV2(db,p1);bindNativeRevisionInLabV2(db,p2);
 const first=attestInChild(p2);
 const att=first.result.attestation,claim=first.result.chain_binding;

 test("protocol in isolation: writer binds, another process attests read-only, the chain verifies",()=>{
  assert.equal(first.child.status,0,first.child.stderr);
  assert.equal(first.result.status,"ATTESTATION_ISSUED_IN_ISOLATION");
  assert.deepEqual([att.tata_sequence,att.ledger_day_rows,att.order_key,att.scope_id,att.writer_key_id,att.attester_key_id],
   ["002",2,p2.event.order_key,"STORE:0001|01|DATE:"+D1,WRITER_ID,ATTESTER_ID]);
  assert.equal(A.verifyTataSequenceAttestationV1(att,anchors("TEST_ISOLATED"),NOW).scope,"TEST_ISOLATED");
  const iso=verdict(p2,claim);
  assert.deepEqual([iso.level,iso.number,iso.candidate_number,iso.reason],
   ["CANDIDATE_PERSISTED_IN_LAB",null,"002","TATA_SEQUENCE_ATTESTED_IN_ISOLATION_NOT_LIVE"]);
  // Only a key provisioned as PRODUCTION_ITAIM (simulated here, in memory) opens the number.
  const live=verdict(p2,claim,{anchorSet:anchors("PRODUCTION_ITAIM")});
  assert.deepEqual([live.level,live.number,live.reason],["LIVE_ATTESTED","002",null]);
 });
 test("the attester never allocates: no binding means HOLD, and its ledger connection is read-only",()=>{
  const before=digest(),r=attestInChild(pairFor("V99",at(D1,"20:00:00"))).result;
  assert.deepEqual([r.status,r.reason],["HOLD","BINDING_NOT_IN_LEDGER"]);
  assert.equal(digest(),before);
  const ro=openLedgerReadOnlyV1(dbPath);
  try{assert.throws(()=>ro.exec("DELETE FROM test_tata_seq_head"),/readonly/i);}finally{ro.close();}
  const elsewhere=path.join(os.tmpdir(),"store-ledger.sqlite");
  assert.equal(attestInIsolationV1({dbPath:elsewhere,pair:p2,attesterPrivateKeyPem:fs.readFileSync(attesterKeyFile,"utf8"),
   writerKeyId:WRITER_ID,nowS:NOW,nonce:"0".repeat(32)}).reason,"ATTESTER_LEDGER_NOT_DISPOSABLE");
 });
 test("separation of duties: the writer's key can never attest",()=>{
  const r=attestInChild(p2,{key:keyFile(writer.privateKey,"writer-key.pem")}).result;
  assert.deepEqual([r.status,r.reason],["HOLD","SEPARATION_OF_DUTIES"]);
  const self=resign(att,{attester_key_id:WRITER_ID},writer.privateKey);
  assert.ok(A.verifyTataSequenceAttestationV1(self,anchors("PRODUCTION_ITAIM",writer.publicKey),NOW)
   .reasons.includes("SEPARATION_OF_DUTIES"));
 });
 test("forgery and replay are refused: unknown key, any tampered field, another order or day, envelope drift",()=>{
  const prod=anchors("PRODUCTION_ITAIM"),other=crypto.generateKeyPairSync("ed25519");
  const reasons=(a,set=prod,now=NOW)=>A.verifyTataSequenceAttestationV1(a,set,now).reasons;
  assert.ok(reasons(resign(att,{attester_key_id:A.publicKeyIdV1(other.publicKey)},other.privateKey)).includes("ATTESTER_NOT_TRUSTED"));
  for(const field of [["tata_sequence","001"],["order_key",p1.event.order_key],["day",D2],["ledger_day_rows",3],["expires_at_s",NOW+99]])
   assert.ok(reasons({...att,[field[0]]:field[1]}).includes("SIGNATURE_INVALID"),field[0]);
  assert.ok(reasons({...att,extra:1}).includes("ENVELOPE_INVALID"));
  const {nonce,...missing}=att;assert.ok(reasons(missing).includes("ENVELOPE_INVALID"));
  // A valid attestation of order 002 presented for order 001 (replay) never opens 001.
  const replay=verdict(p1,{...claim,order_key:p1.event.order_key,tata_sequence:"001"},{anchorSet:prod});
  assert.deepEqual([replay.number,replay.reason],[null,"TATA_SEQUENCE_ATTESTATION_SCOPE_MISMATCH"]);
 });
 test("trust anchors are checked: role, validity, key id; time window and clock are required",()=>{
  const r=(set,now=NOW)=>A.verifyTataSequenceAttestationV1(att,set,now).reasons;
  assert.ok(r(anchors("PRODUCTION_ITAIM",attester.publicKey,{role:"TATA_SEQUENCE_WRITER"})).includes("ATTESTER_NOT_TRUSTED"));
  assert.ok(r(anchors("PRODUCTION_ITAIM",attester.publicKey,{not_after_s:NOW-7200})).includes("ATTESTER_NOT_TRUSTED"));
  assert.ok(r(anchors("PRODUCTION_ITAIM",attester.publicKey,{key_id:"f".repeat(64)})).includes("ATTESTER_NOT_TRUSTED"));
  const forged=anchors("PRODUCTION_ITAIM");forged.attesters[0].public_key_spki_base64=spki(writer.publicKey);
  assert.ok(r(forged).includes("ANCHOR_INVALID"));
  assert.ok(r(anchors("PRODUCTION_ITAIM"),att.expires_at_s+1).includes("WINDOW_INVALID"));
  assert.ok(r(anchors("PRODUCTION_ITAIM"),att.issued_at_s-1).includes("WINDOW_INVALID"));
  assert.ok(A.verifyTataSequenceAttestationV1(att,anchors("PRODUCTION_ITAIM"),undefined).reasons.includes("CLOCK_MISSING"));
  const long=resign(att,{expires_at_s:att.issued_at_s+40*3600});
  assert.deepEqual(r(anchors("PRODUCTION_ITAIM")),[]);
  assert.ok(A.verifyTataSequenceAttestationV1(long,anchors("PRODUCTION_ITAIM"),NOW).reasons.includes("WINDOW_INVALID"));
 });
 test("ledger recheck at use: growth is fine, rewritten history or a moved number is refused",()=>{
  const prod={anchorSet:anchors("PRODUCTION_ITAIM")};
  bindNativeRevisionInLabV2(db,pairFor("V03",at(D1,"21:00:00")));          // the day goes on
  assert.equal(verdict(p2,claim,prod).number,"002");
  const rewritten=ledgerFor(p2);rewritten.bindings[0]={...rewritten.bindings[0],native_order_key:"0001|01|TEST_X|TEST_X"};
  assert.equal(verdict(p2,claim,{...prod,ledger:rewritten}).reason,"TATA_SEQUENCE_LEDGER_HISTORY_CHANGED");
  const moved=ledgerFor(p2);moved.bindings=moved.bindings.map(b=>b.tata_sequence==="002"?{...b,tata_sequence:"003"}:
   b.tata_sequence==="003"?{...b,tata_sequence:"002"}:b);
  assert.equal(verdict(p2,claim,{...prod,ledger:moved}).reason,"TATA_SEQUENCE_LEDGER_DISAGREES");
  assert.equal(verdict(p2,claim,{...prod,ledger:null}).reason,"TATA_SEQUENCE_LEDGER_NOT_RECHECKED");
 });
 test("cancellation: a header-4 revision is never attested; its number stays and later orders count it",()=>{
  const canceled=pairFor("V02",at(D1,"19:40:00"),{header:"4"});
  const r=attestInChild(canceled).result;
  assert.equal(r.status,"HOLD");assert.match(r.reason,/^NATIVE_REVISION_NOT_ELIGIBLE:/);
  const p4=pairFor("V04",at(D1,"22:10:00"));bindNativeRevisionInLabV2(db,p4);
  const a4=attestInChild(p4).result.attestation;
  assert.deepEqual([a4.tata_sequence,a4.ledger_day_rows],["004",4]);
 });
 test("gap in the day ledger: the attester refuses with the V2 policy reason",()=>{
  for(const k of [1,2,3])bindNativeRevisionInLabV2(db,pairFor("G"+k,at(D2,"12:1"+k+":00")));
  db.exec("DROP TRIGGER test_tata_seq_immutable_delete");
  db.prepare("DELETE FROM test_tata_seq_bind WHERE scope=? AND seq=2").run("STORE:0001|01|DATE:"+D2);
  const r=attestInChild(pairFor("G3",at(D2,"12:13:00"))).result;
  assert.deepEqual([r.status,r.reason],["HOLD","V2_DAILY_SEQUENCE_GAP_OR_NONCONTIGUOUS"]);
  db.exec("CREATE TRIGGER test_tata_seq_immutable_delete BEFORE DELETE ON test_tata_seq_bind "+
   "BEGIN SELECT RAISE(ABORT,'IMMUTABLE_BINDING'); END;");
 });
 test("attester killed mid-run: the ledger is untouched and a rerun attests the same binding",()=>{
  const before=digest(),k=attestInChild(p2,{mode:"attest-then-crash"}).child;
  assert.ok(k.signal==="SIGKILL"||k.status!==0);assert.equal(k.stdout,"");
  assert.equal(digest(),before);
  const again=attestInChild(p2).result.attestation;
  assert.deepEqual([again.order_key,again.tata_sequence,again.scope_id],[att.order_key,att.tata_sequence,att.scope_id]);
  assert.equal(A.tataLedgerDayDigestV1(ledgerFor(p2).bindings,att.ledger_day_rows),att.ledger_day_digest);
 });
 test("signed attestation from an untrusted writer is refused by the verifier AND the chain",()=>{
  const trusted=anchors("PRODUCTION_ITAIM");
  assert.equal(A.verifyTataSequenceAttestationV1(att,trusted,NOW).ok,true);
  const anotherWriter=crypto.generateKeyPairSync("ed25519");
  for(const writerPins of [[],[A.publicKeyIdV1(anotherWriter.publicKey)]]){
   const set={...trusted,writer_key_ids:writerPins};
   const check=A.verifyTataSequenceAttestationV1(att,set,NOW);
   assert.equal(check.ok,false);
   assert.ok(check.reasons.includes("WRITER_NOT_TRUSTED"),JSON.stringify(check.reasons));
   const chain=verdict(p2,claim,{anchorSet:set});
   assert.equal(chain.number,null);
   assert.match(chain.reason,/WRITER_NOT_TRUSTED/);
  }
  assert.equal(verdict(p2,claim,{anchorSet:trusted}).number,"002");
 });
 test("expired attester trust anchor blocks a still-current signed statement",()=>{
  const short=anchors("PRODUCTION_ITAIM",attester.publicKey,
   {not_before_s:NOW-50,not_after_s:NOW+100});
  assert.equal(A.verifyTataSequenceAttestationV1(att,short,NOW+90).ok,true);
  const check=A.verifyTataSequenceAttestationV1(att,short,NOW+120);
  assert.equal(check.ok,false);
  assert.ok(check.reasons.includes("ATTESTER_NOT_TRUSTED"));
  const chain=verdict(p2,claim,{anchorSet:short,now:NOW+120});
  assert.equal(chain.number,null);
  assert.match(chain.reason,/ATTESTER_NOT_TRUSTED/);
 });
 test("production stays closed: the pinned attester set is empty and the lab never claims production",()=>{
  const pinned=JSON.parse(fs.readFileSync(path.join(ROOT,"data/tata_sequence_attesters_v1.json"),"utf8"));
  assert.deepEqual([pinned.schema,pinned.store,pinned.attesters],[A.TATA_ATTESTERS_SCHEMA_V1,"0001|01",[]]);
  const v=verdict(p2,claim,{anchorSet:pinned});
  // Production trust is intentionally unprovisioned: both the attester and
  // the writer must be trusted independently. Multiple HOLD reasons are valid.
  assert.equal(v.number,null);
  assert.match(v.reason,/ATTESTER_NOT_TRUSTED/);
  assert.match(v.reason,/WRITER_NOT_TRUSTED/);
  const code=fs.readFileSync(ATTESTER,"utf8").replace(/\/\*[\s\S]*?\*\//g,"").replace(/\/\/.*$/gm,"");
  assert.equal(/PRODUCTION_ITAIM|\b(INSERT|UPDATE|DELETE)\b/.test(code),false);
  assert.ok(/readOnly:true/.test(code));
 });
 console.log("COMANDAS_SEQUENCE_ATTESTATION_LAB_V1="+n+"/"+n+
  " ED25519_SEPARATE_ATTESTER READ_ONLY_LEDGER ISOLATION_ONLY NO_PRODUCTION_KEY NO_PRINT");
}finally{
 try{db?.close()}catch{}
 fs.rmSync(tmp,{recursive:true,force:true});
}
