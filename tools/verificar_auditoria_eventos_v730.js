"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),os=require("node:os"),
 path=require("node:path"),crypto=require("node:crypto");
const {audit,checkEvent,fourPartIdentity,exactSnapshotHash,RULES,NO_EFFECTS}=
 require("./auditar_eventos_watcher_v730_readonly.js");
const root=fs.mkdtempSync(path.join(os.tmpdir(),"tata-v730-audit-test-"));
const events=path.join(root,"state","reader-events-v1");
const shadow=path.join(root,"shadow");
fs.mkdirSync(events,{recursive:true});fs.mkdirSync(shadow,{recursive:true});
for(const name of RULES)fs.writeFileSync(path.join(shadow,name),"{}\n");
fs.copyFileSync(path.join(__dirname,"fixtures","canonical-packaging-v63-pinned.js"),
 path.join(shadow,"packaging-current.js"));
const order={
 CDFILIAL:"0001",CDLOJA:"01",NRVENDAREST:"0000111111",NRCOMANDA:"0000222222",
 NRCOMANDAEXT:"TEST-1",IDORGCMDVENDA:"DLV_TEST",IDSTCOMANDA:"A",
 DTHRABERMESA:"2026-10-13T12:00:00.0000000",
 items:[{NRPRODCOMVEN:"000001",CDPRODUTO:"FICT001",
  CDARVPROD:"9100507200",QTPRODCOMVEN:"2.000",IDSTPRCOMVEN:"A"}],
 observation_scan_complete:true,
 observation_rows:[{source_field:"TXPRODCOMVEN",value:"OBS FICTICIA",
  scope_hint:"item",item_index:0,CDPRODUTO:"FICT001",join_proven:true}]
};
const event={schema:"deliveryos.tata-reader-stable-order-event.v1",
 order_key:"0001|01|0000111111|0000222222",
 snapshot_hash:exactSnapshotHash(order),order,
 ready_for_downstream_shadow:false,
 blockers:["SERVICE_STATE_EXPIRED_FOR_ORDER"],
 service_resolution:{service:null,evidence:"UNKNOWN",blockers:["SERVICE_STATE_EXPIRED_FOR_ORDER"]}};
const eventPath=path.join(events,"0000000001_"+event.snapshot_hash.toUpperCase()+".json");
const save=x=>fs.writeFileSync(eventPath,JSON.stringify(x));
let checks=0;const test=(label,cb)=>{cb();checks++;console.log("PASS "+checks+" "+label)};
try{
 save(event);
 test("real four-component watcher identity preserves sales and comanda separately",()=>{
  assert.equal(fourPartIdentity(event),true);
  assert.ok(exactSnapshotHash(event.order)===event.snapshot_hash);
  assert.deepEqual(checkEvent(event),[]);
 });
 test("complete passive result reports blockers and never operational authority",()=>{
  const got=audit(root,15);
  assert.equal(got.status,"OBSERVED_CONSISTENT_NO_OPERATIONAL_AUTHORITY");
  assert.equal(got.events_checked,1);assert.equal(got.identity_4_of_4,1);
  assert.equal(got.snapshot_hash_verified,1);assert.equal(got.observations_scanned,1);
  assert.equal(got.ready_reported,0);assert.equal(got.blocked_reported,1);
  assert.equal(got.rule_sources_present,8);assert.equal(got.pinned_academy_motor,true);
  assert.equal(got.v2_candidate_present,false);
  assert.equal(got.blockers.SERVICE_STATE_EXPIRED_FOR_ORDER,1);
  assert.equal(got.print_authorized,false);
  assert.ok(Object.values(got.effects).every(x=>x===false));
  const exposed=JSON.stringify(got);
  for(const privatePart of ["0000222222","0000111111","OBS FICTICIA","FICT001",root])
   assert.ok(!exposed.includes(privatePart));
 });
 test("missing V2 is informational, never false operational success",()=>{
  assert.equal(audit(root,15).operational_permission,false);
 });
 test("malformed key stays rejected even if hash remains consistent",()=>{
  const corrupted=structuredClone(event);corrupted.order_key="0001|01|0000222222";
  save(corrupted);const got=audit(root,15);
  assert.equal(got.status,"BLOCKED");assert.equal(got.invalid_events,1);
  assert.equal(got.blockers.ORDER_KEY_IDENTITY_MISMATCH,1);
  save(event);
 });
 test("changed quantity without new snapshot hash is rejected",()=>{
  const corrupted=structuredClone(event);
  corrupted.order.items[0].QTPRODCOMVEN="9.000";
  save(corrupted);const got=audit(root,15);
  assert.equal(got.status,"BLOCKED");
  assert.equal(got.blockers.WATCHER_SNAPSHOT_HASH_MISMATCH,1);
  save(event);
 });
 test("changed item observation is rejected without an updated snapshot hash",()=>{
  const corrupted=structuredClone(event);
  corrupted.order.observation_rows[0].value="NOTE-DRIFT";
  save(corrupted);assert.equal(audit(root,15).status,"BLOCKED");
  save(event);
 });
 test("missing observation scan cannot be accepted",()=>{
  const corrupted=structuredClone(event);corrupted.order.observation_scan_complete=false;
  save(corrupted);assert.equal(audit(root,15).blockers.OBSERVATION_SCAN_UNPROVEN,1);
  save(event);
 });
 test("absent canonical motor fails closed even with valid event",()=>{
  fs.renameSync(path.join(shadow,"packaging-current.js"),
   path.join(shadow,"packaging-current.js.bak"));
  assert.equal(audit(root,15).status,"BLOCKED");
  fs.renameSync(path.join(shadow,"packaging-current.js.bak"),path.join(shadow,"packaging-current.js"));
 });
 test("empty event directory is not observationally proven",()=>{
  fs.renameSync(eventPath,eventPath+".bak");
  assert.equal(audit(root,15).status,"BLOCKED");
  fs.renameSync(eventPath+".bak",eventPath);
 });
 test("never treats event ready as ticket approval",()=>{
  const syntheticReady=structuredClone(event);
  syntheticReady.ready_for_downstream_shadow=true;syntheticReady.blockers=[];
  save(syntheticReady);
  const got=audit(root,15);
  assert.equal(got.ready_reported,1);
  assert.equal(got.operational_permission,false);assert.equal(got.print_authorized,false);
  save(event);
 });
 test("invalid arguments reject excessive scanning and path substitution",()=>{
  for(const count of [0,-1,51,1.1,NaN])
   assert.throws(()=>audit(root,count),/EXPLICIT_ROOT_AND_LIMIT/);
  assert.throws(()=>audit("relative",1),/EXPLICIT_ROOT_AND_LIMIT/);
 });
 test("source tool has no writes, service commands, printer or child processes",()=>{
  const body=fs.readFileSync(path.join(__dirname,"auditar_eventos_watcher_v730_readonly.js"),"utf8");
  assert.doesNotMatch(body,/\b(?:writeFileSync|renameSync|spawnSync|execSync|Start-Service|Set-Service|print\()\b/);
  assert.ok(Object.values(NO_EFFECTS).every(x=>x===false));
 });
}finally{fs.rmSync(root,{recursive:true,force:true});}
console.log("COMANDAS_WINDOWS_PASSIVE_EVENT_AUDIT_V730="+checks+"/"+checks+" NO_REMOTE_WRITE NO_PRINT NO_ORDER_CONTENT");
