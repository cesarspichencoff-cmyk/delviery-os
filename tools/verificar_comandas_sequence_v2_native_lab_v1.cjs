"use strict";
/**
 * TATÁ number V2 on NATIVE revisions, lab level only. Synthetic TEST_ keys,
 * a disposable SQLite file under the OS temp dir, real child processes for
 * concurrency and crash. Proves the contract mechanics at
 * CANDIDATE_PERSISTED_IN_LAB; LIVE_ATTESTED is never produced, the V1 writer
 * commit guard stays in place and no real store state is read or written.
 */
const assert=require("node:assert/strict");
const fs=require("node:fs"),os=require("node:os"),path=require("node:path"),crypto=require("node:crypto");
const {spawn,spawnSync}=require("node:child_process");
const {DatabaseSync}=require("node:sqlite");
const {syntheticReaderPairV857}=require("./verificar_tata_comanda_reader_native_v857_offline.cjs");
const {snapshotHash,decisionHash}=require("./tata_comanda_reader_native_essentials_v857_offline.cjs");
const {createSyntheticTables}=require("./comandas_sequence_v2_sqlite_lab.cjs");
const {inspectStrongKeySequence,STATE_SCHEMA}=require("./comandas_strong_key_sequence_v2_review_only.cjs");
const LAB=path.join(__dirname,"comandas_sequence_v2_native_lab_v1.cjs");
const {SCHEMA,EFFECTS,previewNativeSequenceV2:preview,bindNativeRevisionInLabV2,exportLabStateV2}=require(LAB);
const N=require("../dist/src/production/nativeReaderChainV1.js");
const {runNativeChainV1}=require("./comandas_cadeia_nativa_v1_offline.cjs");

const ROOT=path.join(__dirname,"..");
const D1="2026-11-06",D2="2026-11-07",D3="2026-11-08"; // a Friday night into Saturday
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),"comandas-atomic-test-"));
const dbPath=path.join(tmp,"synthetic-only.sqlite");
// Writers under test use timeout 0 (no wait, no retry); the parent's own
// reader waits for OS lock release after a killed child (Windows is slower).
const open=(timeout=0)=>new DatabaseSync(dbPath,{timeout});
let db,n=0;
async function test(name,fn){await fn();console.log("PASS "+(++n)+" "+name);}

/** Canonical V8.57 fixture re-keyed to TEST_ ids, real native states 3 / 4. */
function pairFor(sale,cmd,dthr,{header="3",itemState="4",extraQty=0}={}){
 const p=syntheticReaderPairV857(),o=p.event.order;
 o.NRVENDAREST=sale.startsWith("0")?sale:"TEST_"+sale;
 o.NRCOMANDA=cmd.startsWith("0")?cmd:"TEST_"+cmd;
 o.DTHRABERMESA=dthr;o.IDSTCOMANDA=header;
 o.items.forEach(x=>x.IDSTPRCOMVEN=itemState);
 if(extraQty){ // a NEW revision of the same order: quantity changed at the source
  o.items[1].QTPRODCOMVEN=(1+extraQty)+".000";p.decision.items[1].quantity=1+extraQty;
 }
 const key=[o.CDFILIAL,o.CDLOJA,o.NRVENDAREST,o.NRCOMANDA].join("|");
 p.event.order_key=key;p.decision.order_key=key;p.decision.teknisa_sequence=o.NRCOMANDA;
 p.event.snapshot_hash=snapshotHash(o);p.decision.snapshot_hash=p.event.snapshot_hash;
 p.decision.fingerprint=decisionHash(p.decision);
 return p;
}
const at=(day,hms)=>day+"T"+hms+".0000000";
function labOnly(r){
 assert.equal(r.schema,SCHEMA);assert.deepEqual(r.effects,EFFECTS);
 assert.equal(r.live_attested,false);assert.equal(r.print_authorized,false);
 assert.equal(r.number_for_operational_ticket,null);
 assert.notEqual(r.level,"LIVE_ATTESTED");
 if(r.chain_binding)assert.equal(r.chain_binding.attested_independently,false);
 return r;
}
const bind=(pair,conn=db)=>labOnly(bindNativeRevisionInLabV2(conn,pair));
const rows=(day)=>db.prepare("SELECT order_key,seq FROM test_tata_seq_bind WHERE scope=? ORDER BY seq")
 .all("STORE:0001|01|DATE:"+day);
const head=(day)=>db.prepare("SELECT highest FROM test_tata_seq_head WHERE scope=?")
 .get("STORE:0001|01|DATE:"+day)?.highest??0;
const digest=()=>crypto.createHash("sha256").update(JSON.stringify([
 db.prepare("SELECT * FROM test_tata_seq_head ORDER BY scope").all(),
 db.prepare("SELECT * FROM test_tata_seq_bind ORDER BY scope,seq").all()])).digest("hex");
const contiguous=(day)=>rows(day).every((r,i)=>r.seq===i+1)&&head(day)===rows(day).length;

// Child process: same lab module, same disposable file, its own connection.
// Written as a file (no multi-line "-e" argument quoting on Windows).
const CHILD=`
const {DatabaseSync}=require("node:sqlite");
const [lab,file,pairFile,mode]=process.argv.slice(2);
const L=require(lab),pair=JSON.parse(require("node:fs").readFileSync(pairFile,"utf8"));
const db=new DatabaseSync(file,{timeout:0});
if(mode==="bind"){
 const r=L.bindNativeRevisionInLabV2(db,pair);
 process.stdout.write(JSON.stringify({status:r.status,reason:r.reason,lab_number:r.lab_number??null,
  reused:r.reused??null,effect:r.lab_effect_may_have_occurred??null}));
 db.close();
}else if(mode==="crash-before-commit"){
 // Same statements as the lab, then the process is KILLED inside the transaction.
 const scope="STORE:0001|01|DATE:"+pair.event.order.DTHRABERMESA.slice(0,10);
 db.exec("BEGIN IMMEDIATE");
 const h=db.prepare("SELECT highest FROM test_tata_seq_head WHERE scope=?").get(scope)?.highest??0;
 db.prepare("INSERT INTO test_tata_seq_head(scope,highest) VALUES (?,?) ON CONFLICT(scope) DO UPDATE SET highest=excluded.highest").run(scope,h+1);
 db.prepare("INSERT INTO test_tata_seq_bind(scope,order_key,seq) VALUES (?,?,?)").run(scope,pair.event.order_key,h+1);
 process.kill(process.pid,"SIGKILL");
}else if(mode==="crash-after-commit"){
 L.bindNativeRevisionInLabV2(db,pair); // committed; the caller never hears back
 process.kill(process.pid,"SIGKILL");
}`;
function pairFile(pair){
 const f=path.join(tmp,"pair-"+crypto.randomUUID()+".json");
 fs.writeFileSync(f,JSON.stringify(pair));return f;
}
const childFile=path.join(tmp,"lab-child.cjs");
fs.writeFileSync(childFile,CHILD);
function childSync(mode,pair){
 return spawnSync(process.execPath,[childFile,LAB,dbPath,pairFile(pair),mode],{encoding:"utf8",timeout:20000});
}
function childAsync(mode,pair){
 const args=[childFile,LAB,dbPath,pairFile(pair),mode];
 return new Promise((resolve,reject)=>{
  const c=spawn(process.execPath,args,{stdio:["ignore","pipe","pipe"]});
  let out="",err="";c.stdout.on("data",d=>out+=d);c.stderr.on("data",d=>err+=d);
  c.on("error",reject);
  c.on("close",code=>code===0?resolve(JSON.parse(out)):reject(Error("child "+code+" "+err)));
 });
}

async function main(){
 db=open(5000);createSyntheticTables(db);

 await test("001→002: the first two native orders of the Itaim day bind 001 then 002, lab level only",()=>{
  const a=bind(pairFor("V01","C01",at(D1,"11:05:12"))),b=bind(pairFor("V02","C02",at(D1,"11:40:00")));
  assert.equal(a.level,"CANDIDATE_PERSISTED_IN_LAB");assert.equal(a.status,"LAB_BOUND_READ_BACK");
  assert.deepEqual([a.lab_number,a.reused,b.lab_number,b.reused],["001",false,"002",false]);
  assert.equal(a.chain_binding.scope_id,"STORE:0001|01|DATE:"+D1);
  assert.deepEqual(rows(D1).map(r=>r.order_key),[a.chain_binding.order_key,b.chain_binding.order_key]);
 });
 await test("lunch → dinner share one sequence: 19:05 binds 003, no reset at the shift change",()=>{
  assert.equal(N.storeLocalTimeV1(at(D1,"19:05:00")).hm,"19:05");
  assert.equal(bind(pairFor("V03","C03",at(D1,"19:05:00"))).lab_number,"003");
 });
 await test("23:02 and 23:59:59 stay in their civil day; 00:00:00 opens the next Itaim day at 001",()=>{
  assert.equal(bind(pairFor("V04","C04",at(D1,"23:02:07"))).lab_number,"004");
  const last=bind(pairFor("V05","C05",D1+"T23:59:59.9999999"));
  assert.deepEqual([last.lab_number,last.day],["005",D1]);
  const first=bind(pairFor("V06","C06",at(D2,"00:00:00")));
  assert.deepEqual([first.lab_number,first.day,first.chain_binding.scope_id],["001",D2,"STORE:0001|01|DATE:"+D2]);
  assert.ok(contiguous(D1)&&contiguous(D2));
 });
 await test("replay of the same revision rechecks its number; nothing new is allocated",()=>{
  const before=digest(),r=bind(pairFor("V01","C01",at(D1,"11:05:12")));
  assert.deepEqual([r.lab_number,r.reused],["001",true]);assert.equal(digest(),before);
 });
 await test("new revision of the same order keeps its number; a different order never inherits it",()=>{
  const old=pairFor("V02","C02",at(D1,"11:40:00")),rev=pairFor("V02","C02",at(D1,"11:40:00"),{extraQty:2});
  assert.notEqual(rev.event.snapshot_hash,old.event.snapshot_hash);
  const r=bind(rev);assert.deepEqual([r.lab_number,r.reused],["002",true]);
  const other=bind(pairFor("V02","C99",at(D1,"11:40:00"))); // same sale, other comanda
  assert.deepEqual([other.lab_number,other.reused],["006",false]);
 });
 await test("reprint after restart: closing and reopening the lab DB reads back the same bindings",()=>{
  const before=digest();db.close();db=open(5000);
  assert.equal(digest(),before);
  const r=bind(pairFor("V03","C03",at(D1,"19:05:00")));
  assert.deepEqual([r.lab_number,r.reused],["003",true]);
 });
 await test("concurrency, lock held: a second writer HOLDs without retry, then allocates exactly once",()=>{
  const peer=open();
  try{
   db.exec("BEGIN IMMEDIATE");
   const x=bind(pairFor("V07","C07",at(D1,"20:00:00")),peer);
   assert.deepEqual([x.status,x.reason,x.level,x.lab_effect_may_have_occurred],
    ["HOLD","LAB_TRANSACTION_FAILED_OR_LOCKED",null,false]);
   db.exec("ROLLBACK");
   assert.equal(bind(pairFor("V07","C07",at(D1,"20:00:00")),peer).lab_number,"007");
  }finally{peer.close();}
 });
 let raced=0;
 await test("concurrency, 8 real processes racing: one number per order, contiguous; uncertain acks resolved by readback",async()=>{
  const pairs=Array.from({length:8},(_,k)=>pairFor("R"+k,"R"+k,at(D2,"12:0"+k+":00")));
  const first=await Promise.all(pairs.map(p=>childAsync("bind",p)));
  // The lab's only HOLDs under contention, each with its effect flag:
  // lock not taken (nothing written) or COMMIT done but the readback raced.
  const known={LAB_TRANSACTION_FAILED_OR_LOCKED:false,LAB_COMMITTED_READBACK_UNCERTAIN:true,
   LAB_COMMIT_ACK_REQUIRES_MANUAL_READBACK:true};
  for(const r of first)if(r.status!=="LAB_BOUND_READ_BACK"){
   assert.equal(r.status,"HOLD");assert.ok(Object.hasOwn(known,r.reason),r.reason);
   assert.equal(r.effect,known[r.reason],JSON.stringify(r));
  }
  raced=first.filter(r=>r.status==="HOLD").length;
  const committed=first.filter(r=>r.status==="LAB_BOUND_READ_BACK"||r.effect===true).length;
  assert.equal(rows(D2).length,1+committed);assert.ok(contiguous(D2));
  // An explicit second pass (operator re-run, not an automatic retry): a lock
  // HOLD allocates now; an uncertain ack reads back its committed number.
  for(const [k,r] of first.entries())if(r.status==="HOLD"){
   const s=await childAsync("bind",pairs[k]);
   assert.equal(s.status,"LAB_BOUND_READ_BACK");assert.equal(s.reused,r.effect===true);
  }
  const all=rows(D2),keys=new Set(all.map(r=>r.order_key));
  assert.equal(all.length,9);assert.equal(keys.size,9);assert.ok(contiguous(D2));
  assert.ok(pairs.every(p=>keys.has(p.event.order_key)));
 });
 await test("crash inside the transaction (SIGKILL before COMMIT): no partial binding, no gap",()=>{
  const pair=pairFor("V08","C08",at(D1,"21:00:00"));
  const c=childSync("crash-before-commit",pair);
  assert.ok(c.signal==="SIGKILL"||c.status!==0,"child must die before COMMIT");
  assert.equal(rows(D1).some(r=>r.order_key===pair.event.order_key),false);
  assert.ok(contiguous(D1));assert.equal(head(D1),7);
  assert.equal(bind(pair).lab_number,"008");
 });
 await test("crash after COMMIT, before the answer: readback by strong key returns the SAME number",()=>{
  const pair=pairFor("V09","C09",at(D1,"21:30:00"));
  const c=childSync("crash-after-commit",pair);
  assert.equal(c.stdout,"");assert.ok(c.signal==="SIGKILL"||c.status!==0);
  const r=bind(pair);assert.deepEqual([r.lab_number,r.reused],["009",true]);
  assert.ok(contiguous(D1));
 });
 await test("cancellation: header 4 or item 6 HOLDs, 005 stays bound and is never recycled",()=>{
  const before=digest();
  const canceled=bind(pairFor("V05","C05",D1+"T23:59:59.9999999",{header:"4"}));
  assert.equal(canceled.status,"HOLD");assert.equal(canceled.level,null);
  assert.match(canceled.reason,/^NATIVE_REVISION_NOT_ELIGIBLE:.*NATIVE_HEADER_STATUS_NOT_SAFE/);
  assert.equal(bind(pairFor("V10","C10",at(D1,"22:00:00"),{itemState:"6"})).status,"HOLD");
  assert.equal(digest(),before);
  assert.throws(()=>db.prepare("DELETE FROM test_tata_seq_bind WHERE scope=? AND seq=5")
   .run("STORE:0001|01|DATE:"+D1),/IMMUTABLE_BINDING/);
  assert.throws(()=>db.prepare("UPDATE test_tata_seq_bind SET order_key=? WHERE scope=? AND seq=5")
   .run("0001|01|TEST_X|TEST_X","STORE:0001|01|DATE:"+D1),/IMMUTABLE_BINDING/);
  const next=pairFor("V11","C11",at(D1,"22:10:00"));
  assert.equal(bind(next).lab_number,"010");
  // The SAME V2 policy re-reads the lab: 005 still counted, ledger contiguous.
  const v=inspectStrongKeySequence({pair:next,state:exportLabStateV2(db)});
  assert.equal(v.status,"STRONG_KEY_PRESENT_IN_SUPPLIED_STATE_NOT_ATTESTED");
  assert.equal(v.review_binding_number,"010");
 });
 await test("gap: a binding removed out of band HOLDs the lab and the V2 policy; nothing is renumbered",()=>{
  for(const k of [1,2,3])bind(pairFor("G"+k,"G"+k,at(D3,"12:1"+k+":00")));
  db.exec("DROP TRIGGER test_tata_seq_immutable_delete");
  db.prepare("DELETE FROM test_tata_seq_bind WHERE scope=? AND seq=2").run("STORE:0001|01|DATE:"+D3);
  const before=digest();
  const x=bind(pairFor("G4","G4",at(D3,"12:14:00")));
  assert.deepEqual([x.status,x.reason],["HOLD","LAB_COUNTER_OR_BINDINGS_INTEGRITY_FAILED"]);
  assert.equal(digest(),before);
  const p=preview(pairFor("G4","G4",at(D3,"12:14:00")),exportLabStateV2(db));
  assert.deepEqual([p.status,p.reason,p.level],["HOLD","V2_DAILY_SEQUENCE_GAP_OR_NONCONTIGUOUS",null]);
  db.exec("CREATE TRIGGER test_tata_seq_immutable_delete BEFORE DELETE ON test_tata_seq_bind "+
   "BEGIN SELECT RAISE(ABORT,'IMMUTABLE_BINDING'); END;");
 });
 await test("collision: one number for two orders, or two numbers for one order, is refused at both layers",()=>{
  const scope="STORE:0001|01|DATE:"+D1,state=exportLabStateV2(db);
  assert.throws(()=>db.prepare("INSERT INTO test_tata_seq_bind(scope,order_key,seq) VALUES (?,?,?)")
   .run(scope,"0001|01|TEST_COL|TEST_COL",3),/UNIQUE/);
  assert.throws(()=>db.prepare("INSERT INTO test_tata_seq_bind(scope,order_key,seq) VALUES (?,?,?)")
   .run(scope,pairFor("V01","C01",at(D1,"11:05:12")).event.order_key,11),/UNIQUE|PRIMARY/);
  const probe=pairFor("V12","C12",at(D1,"22:30:00")),b=state.bindings.find(x=>x.tata_sequence==="003");
  const twoOrders={...state,bindings:[...state.bindings,{...b,native_order_key:"0001|01|TEST_COL|TEST_COL"}]};
  assert.equal(preview(probe,twoOrders).reason,"V2_SEQUENCE_COLLISION");
  const twoNumbers={...state,bindings:[...state.bindings,{...b,tata_sequence:"011"}]};
  assert.equal(preview(probe,twoNumbers).reason,"V2_DUPLICATE_ORDER_BINDING");
 });
 await test("source without a trustworthy store-local day HOLDs before any write (Z, offset, invalid, absent)",()=>{
  const before=digest();
  for(const dthr of [D1+"T12:00:00Z",D1+"T12:00:00-03:00",D1+"T12:00:00.0000000+00:00",
   "2026-02-30T12:00:00.0000000",D1+" 12:00:00",D1,D1+"T24:00:00.0000000",""]){
   const pair=pairFor("V13","C13",dthr);
   const r=bind(pair);assert.equal(r.status,"HOLD",dthr);assert.equal(r.level,null);
   assert.match(r.reason,/^(SOURCE_LOCAL_DAY_NOT_TRUSTED|NATIVE_REVISION_NOT_ELIGIBLE:)/,dthr);
   assert.equal(preview(pair,exportLabStateV2(db)).status,"HOLD",dthr);
   assert.equal(N.sequenceVerdictV1(null,pair.event).reason,"SOURCE_LOCAL_DAY_NOT_TRUSTED",dthr);
  }
  assert.equal(digest(),before);
 });
 await test("PREVIEW is computed from a state and stores nothing; it reuses or proposes, never binds",()=>{
  const before=digest(),state=exportLabStateV2(db);
  const reuse=labOnly(preview(pairFor("V04","C04",at(D1,"23:02:07")),state));
  assert.deepEqual([reuse.level,reuse.preview_number,reuse.reused],["PREVIEW","004",true]);
  const fresh=labOnly(preview(pairFor("V14","C14",at(D1,"22:40:00")),state));
  assert.deepEqual([fresh.level,fresh.preview_number,fresh.reused],["PREVIEW","011",false]);
  assert.deepEqual([fresh.chain_binding.persisted,fresh.chain_binding.attested_independently],[false,false]);
  assert.equal(preview(pairFor("V14","C14",at(D1,"22:40:00")),{schema:"deliveryos.tata-sequence-state.v1",
   policy:{width:3,min_value:1,max_value:999},next_value:1,bindings:[]}).reason,
   "LEGACY_SHORT_KEY_STATE_REQUIRES_INDEPENDENT_MIGRATION");
  assert.equal(digest(),before);
 });
 await test("chain reads the levels apart: PREVIEW and lab numbers are reported, never printed",()=>{
  const pair=pairFor("V01","C01",at(D1,"11:05:12"));
  const labClaim=bind(pair).chain_binding,prevClaim=preview(pair,exportLabStateV2(db)).chain_binding;
  const lab=N.sequenceVerdictV1(labClaim,pair.event),pre=N.sequenceVerdictV1(prevClaim,pair.event);
  assert.deepEqual([lab.level,lab.number,lab.candidate_number,lab.reason],
   ["CANDIDATE_PERSISTED_IN_LAB",null,"001","TATA_SEQUENCE_LAB_ONLY_NOT_LIVE_ATTESTED"]);
  assert.deepEqual([pre.level,pre.number,pre.candidate_number,pre.reason],
   ["PREVIEW",null,"001","TATA_SEQUENCE_PREVIEW_ONLY_NOT_PERSISTED"]);
  // Relabelling a lab claim as live without the attestation flag is refused.
  assert.equal(N.sequenceVerdictV1({...labClaim,level:"LIVE_ATTESTED"},pair.event).reason,
   "TATA_SEQUENCE_BINDING_NOT_ATTESTED");
  // Through the actual chain runner: L5 reports the lab level, no number, no paper.
  const load=f=>JSON.parse(fs.readFileSync(path.join(ROOT,"data",f),"utf8"));
  const out=runNativeChainV1({event:pair.event,decision:pair.decision,
   routing:load("odhen_product_routing_compact_v1.json"),printer_map:load("runtime_printer_map_v1.json"),
   calibration:load("production_printer_calibration_registry_v1.json"),
   motor_source:fs.readFileSync(path.join(__dirname,"fixtures/canonical-packaging-v63-pinned.js")),
   sequence_binding:labClaim});
  assert.deepEqual([out.layers.L5.sequence_level,out.layers.L5.candidate_number,out.layers.L5.tata_number],
   ["CANDIDATE_PERSISTED_IN_LAB","001",null]);
  assert.ok(out.views.every(v=>v.escpos_bytes===0));assert.equal(out.physical_effect_authorized,false);
 });
 await test("real store state is out of reach: real-shaped keys and non-designated DB paths HOLD",()=>{
  const before=digest();
  const real=pairFor("0000349281","0000348850",at(D1,"12:31:00"));
  assert.equal(real.event.order_key,"0001|01|0000349281|0000348850");
  assert.equal(bind(real).reason,"SYNTHETIC_ONLY_CONTEXT_OR_STRONG_KEY_REQUIRED");
  const other=pairFor("V15","C15",at(D1,"12:31:00"));
  other.event.order.CDLOJA="02";other.event.order_key=other.event.order_key.replace("0001|01|","0001|02|");
  other.decision.order_key=other.event.order_key;other.event.snapshot_hash=snapshotHash(other.event.order);
  other.decision.snapshot_hash=other.event.snapshot_hash;other.decision.fingerprint=decisionHash(other.decision);
  assert.equal(bind(other).status,"HOLD");
  assert.equal(digest(),before);
  const wrong=new DatabaseSync(path.join(tmp,"store.sqlite"),{timeout:0});
  try{assert.equal(bind(pairFor("V16","C16",at(D1,"12:31:00")),wrong).reason,"SYNTHETIC_DB_LOCATION_REQUIRED");}
  finally{wrong.close();}
 });
 await test("V1 writer keeps its commit guard; this lab never names LIVE_ATTESTED as an outcome",()=>{
  for(const f of ["tools/tata_sequence_atomic_bind_v1.ps1","tools/verificar_tata_sequence_writer_preview_hold_v1.ps1"])
   assert.ok(fs.readFileSync(path.join(ROOT,f),"utf8").includes("COMMIT_DISABLED_NO_INDEPENDENT_AUTHORIZATION_GATE"),f);
  const code=fs.readFileSync(LAB,"utf8").replace(/\/\*[\s\S]*?\*\//g,"").replace(/\/\/.*$/gm,"");
  assert.equal(/["']LIVE_ATTESTED["']/.test(code),false);
  assert.equal(/attested_independently:true|live_attested:true|print_authorized:true/.test(code),false);
  assert.deepEqual([...code.matchAll(/require\("([^"]+)"\)/g)].map(m=>m[1]).sort(),
   ["../dist/src/production/nativeReaderChainV1.js","../dist/src/production/tataSequence.js",
    "./comandas_reader_v2_view_evidence_v1_offline.cjs","./comandas_sequence_v2_sqlite_lab.cjs",
    "./comandas_strong_key_sequence_v2_review_only.cjs"]);
 });
 console.log("COMANDAS_SEQUENCE_V2_NATIVE_LAB="+n+"/"+n+" RACE_HOLDS="+raced+
  " LAB_LEVEL_ONLY NO_LIVE_ATTESTED NO_REAL_STATE NO_PRINT");
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{
 try{db?.close()}catch{}
 fs.rmSync(tmp,{recursive:true,force:true});
});
