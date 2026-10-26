"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const {exactSnapshotHash,RULES}=require("./auditar_eventos_watcher_v730_readonly.js");
const {preflight,shiftReasons}=require("./comandas_windows_sidecar_preflight_v731_readonly.js");
const {onetime,EFFECTS,DEADLINE}=require("./comandas_windows_observer_oneshot_v732_readonly.js");
const temp=fs.mkdtempSync(path.join(os.tmpdir(),"tata-comandas-v731-"));
const state=path.join(temp,"state"),events=path.join(state,"reader-events-v1"),shadow=path.join(temp,"shadow");
fs.mkdirSync(events,{recursive:true});fs.mkdirSync(shadow,{recursive:true});
const eventName="0000000001_"+"a".repeat(64)+".json";
const eventPath=path.join(events,eventName),shiftPath=path.join(state,"production-service-state.json");
const order={CDFILIAL:"0001",CDLOJA:"01",NRVENDAREST:"0000000011",
 NRCOMANDA:"0000000022",NRCOMANDAEXT:"1001",IDORGCMDVENDA:"DLV_TEST",
 IDSTCOMANDA:"A",DTHRABERMESA:"2026-10-13T12:00:00.0000000",
 items:[{NRPRODCOMVEN:"000001",CDPRODUTO:"FAKE01",CDARVPROD:"9100507200",
 QTPRODCOMVEN:"1.000",IDSTPRCOMVEN:"A"}],
 observation_scan_complete:true,observation_rows:[]};
const shift={schema:"deliveryos.production-service-shift-state.v2",
 store_id:"0001",operational_date:"2026-10-13",service:"LUNCH",
 evidence:"HUMAN_CONFIRMED_RULE",source_ref:"human-confirmed:test:fixture:2026-10-13",
 clock_inference_used:false,valid_until_local:"2026-10-13T23:59:59",
 updated_at:"2026-10-13T10:00:00.0000000-03:00"};
const original={schema:"deliveryos.tata-reader-stable-order-event.v1",
 order_key:"0001|01|0000000011|0000000022",order,
 snapshot_hash:exactSnapshotHash(order),ready_for_downstream_shadow:true,blockers:[],
 service_resolution:{service:"LUNCH",evidence:"HUMAN_CONFIRMED_RULE",
 source_ref:shift.source_ref,blockers:[]}};
for(const f of RULES)fs.writeFileSync(path.join(shadow,f),"{}\n");
fs.copyFileSync(path.join(__dirname,"fixtures","canonical-packaging-v63-pinned.js"),
 path.join(shadow,"packaging-current.js"));
const v2path=path.join(shadow,"live_shadow_consumer_v2_candidate_v714.cjs");
fs.copyFileSync(path.join(__dirname,"..","runtime","shadow","live_shadow_consumer_v2_candidate_v714.cjs"),v2path);
const write=(p,x)=>fs.writeFileSync(p,JSON.stringify(x)+"\n");
const reset=()=>{write(eventPath,original);write(shiftPath,shift);};
let count=0;
const check=(name,cb)=>{cb();count++;console.log("PASS V731 "+count+" "+name);};
const HOLD=(reason)=>{const result=preflight(temp,eventName);
 assert.equal(result.status,"HOLD");assert.equal(result.operational_permission,false);
 assert.equal(result.consumer_executed,false);assert.equal(result.v68_executed,false);
 assert.equal(result.tickets_generated,false);assert.equal(result.print_authorized,false);
 assert.equal(result.printer_access,false);
 assert.equal(result.effects.print,false);assert.equal(result.effects.sequence_write,false);
 assert.ok(result.blockers.includes(reason),JSON.stringify(result.blockers));return result;};
try{
 reset();
 check("even entirely consistent synthetic inputs are NOT authorized to print",()=>{
  const good=preflight(temp,eventName);
  assert.equal(good.status,"ELIGIBLE_FOR_SEPARATE_ISOLATED_REPLAY",JSON.stringify(good.blockers));
  assert.equal(good.canonical_motor_pinned,true);
  assert.equal(good.v2_candidate_pinned,true);
  assert.equal(good.rules_present,8);
  assert.equal(good.operational_permission,false);
  assert.equal(good.consumer_executed,false);assert.equal(good.v68_executed,false);
  assert.equal(good.tickets_generated,false);
 });
 check("expired shift date never satisfies real order",()=>{
  const bad={...shift,operational_date:"2026-10-07",
   valid_until_local:"2026-10-07T23:59:59",updated_at:"2026-10-07T10:00:00"};
  write(shiftPath,bad);HOLD("SHIFT_ORDER_DATE_MISMATCH");reset();
 });
 check("reader own shift blockers are not silently ignored",()=>{
  const bad=structuredClone(original);
  bad.ready_for_downstream_shadow=false;
  bad.blockers=["SERVICE_STATE_EXPIRED_FOR_ORDER"];
  bad.service_resolution.blockers=["SERVICE_STATE_EXPIRED_FOR_ORDER"];
  write(eventPath,bad);HOLD("WATCHER_EVENT_HOLD");reset();
 });
 check("independent sale ID cannot be replaced",()=>{
  const bad=structuredClone(original);bad.order.NRVENDAREST="0000000099";
  write(eventPath,bad);HOLD("ORDER_KEY_IDENTITY_MISMATCH");reset();
 });
 check("changed quantity without new watcher hash fails",()=>{
  const bad=structuredClone(original);bad.order.items[0].QTPRODCOMVEN="2.000";
  write(eventPath,bad);HOLD("WATCHER_SNAPSHOT_HASH_MISMATCH");reset();
 });
 check("changed order observation without new hash fails",()=>{
  const bad=structuredClone(original);
  bad.order.observation_rows=[{source_field:"DSOBSCOMANDA",value:"NEW NOTE",
   scope_hint:"order",join_proven:true}];
  write(eventPath,bad);HOLD("WATCHER_SNAPSHOT_HASH_MISMATCH");reset();
 });
 check("shift is not a human approval merely because fields look valid",()=>{
  const bad={...shift,evidence:"CLOCK_INFERRED"};
  write(shiftPath,bad);HOLD("SHIFT_HUMAN_APPROVAL_UNVERIFIED");reset();
 });
 check("event shift and installed shift must reconcile exactly",()=>{
  const bad=structuredClone(original);bad.service_resolution.source_ref="human-confirmed:other";
  write(eventPath,bad);HOLD("EVENT_SHIFT_NOT_RECONCILED");reset();
 });
 check("clock based shift inference is never accepted",()=>{
  write(shiftPath,{...shift,clock_inference_used:true});HOLD("SHIFT_HUMAN_APPROVAL_UNVERIFIED");reset();
 });
 check("future or mismatched valid-until time is rejected",()=>{
  write(shiftPath,{...shift,valid_until_local:"2026-10-13T11:00:00"});
  HOLD("SHIFT_EXPIRED_BEFORE_ORDER");reset();
 });
 check("unverified source engine must HOLD",()=>{
  const p=path.join(shadow,"packaging-current.js");
  fs.renameSync(p,p+".original");fs.writeFileSync(p,"module.exports = {}");
  HOLD("CANONICAL_RULE_SOURCE_UNPROVEN");
  fs.rmSync(p);fs.renameSync(p+".original",p);
 });
 check("untrusted V2 candidate binary cannot be used",()=>{
  fs.appendFileSync(v2path,"\n// mutation to invalidate exact Git blob");
  HOLD("PINNED_V2_NOT_INSTALLED");
  fs.copyFileSync(path.join(__dirname,"..","runtime","shadow","live_shadow_consumer_v2_candidate_v714.cjs"),v2path);
 });
 check("missing V2 candidate is HOLD, without starting V1",()=>{
  fs.renameSync(v2path,v2path+".hold");HOLD("PINNED_V2_NOT_INSTALLED");
  fs.renameSync(v2path+".hold",v2path);
 });
 check("event contains personal info but output cannot leak it",()=>{
  const got=JSON.stringify(preflight(temp,eventName));
  for(const secret of ["0000000011","0000000022","FAKE01",shift.source_ref,temp])
   assert.ok(!got.includes(secret),"preflight output leaked private data");
 });
 check("scanner refuses path traversal, unsupported names, relative root",()=>{
  for(const n of ["../state/production-service-state.json","bad.json",
   "0000000001_"+ "z".repeat(64)+".json"])
    assert.throws(()=>preflight(temp,n),/EVENT_BASENAME_INVALID/);
  assert.throws(()=>preflight("relative",eventName),/ROOT_ABSOLUTE_REQUIRED/);
 });
 check("source has no shell, installer, printer or local file write primitives",()=>{
  const src=fs.readFileSync(path.join(__dirname,"comandas_windows_sidecar_preflight_v731_readonly.js"),"utf8");
  assert.doesNotMatch(src,/\b(?:spawnSync|execSync|writeFileSync|createWriteStream|rmSync|Set-Service|Start-Service|Set-Printer)\b/);
 });

 check("oneshot guards the actual pre-delivery freeze at 11:14 BRT",()=>{
  reset();
  const allowed=onetime(temp,new Date("2026-10-13T10:00:00-03:00"));
  assert.equal(DEADLINE,"2026-10-13T11:14:00-03:00");
  assert.equal(allowed.status,"HOLD");
  assert.equal(allowed.checked,1);
  assert.equal(allowed.consistent,1);
  assert.equal(allowed.eligible,1);
  assert.ok(allowed.reason_codes.includes("OS_ISOLATION_AND_VALIDATED_ROLLBACK_REQUIRED"));
  assert.equal(allowed.effects.service_change,false);
  assert.equal(allowed.effects.consumer_v2,false);
  const freeze=onetime(temp,new Date("2026-10-13T11:14:00-03:00"));
  assert.equal(freeze.checked,0);
  assert.deepEqual(freeze.reason_codes,["OPERATIONS_FREEZE_DEADLINE_REACHED"]);
  assert.equal(freeze.status,"HOLD");
 });
 check("oneshot cannot be induced to install, print or execute V2",()=>{
  const got=onetime(temp,new Date("2026-10-13T11:13:59-03:00"));
  assert.equal(got.external_operational_authority,false);
  assert.ok(Object.values(EFFECTS).every(v=>v===false));
  const body=fs.readFileSync(path.join(__dirname,
   "comandas_windows_observer_oneshot_v732_readonly.js"),"utf8");
  assert.doesNotMatch(body,/\b(?:spawnSync|execSync|writeFileSync|mkdirSync|unlinkSync|Start-Service|Set-Service|Set-Printer)\b/);
 });
}finally{fs.rmSync(temp,{recursive:true,force:true});}
console.log("COMANDAS_WINDOWS_SIDECAR_PREFLIGHT_V731="+count+"/"+count+" HOLD_WHEN_UNPROVEN NO_SERVICE_CHANGE NO_PRINT");
