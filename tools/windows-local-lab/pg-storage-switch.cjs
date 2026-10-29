'use strict';
// Deliberately supports only this EMPTY, simulated, single-unit lab transition.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=__dirname,app=path.join(root,'app'),unit='ITAIM',base='http://100.107.78.202:5193';
const load=n=>JSON.parse(fs.readFileSync(path.join(root,n),'utf8'));
const save=(n,v)=>fs.writeFileSync(path.join(root,n),JSON.stringify(v,null,2));
const s=load('private-local.json'),cfg=load('pilot-local.json'),flags=load('gps-disabled.json');
assert(cfg.mode==='test'&&cfg.source_mode==='simulated'&&cfg.unit_id===unit&&flags.gps_capture_enabled===false&&Object.values(cfg.features).every(v=>v===false),'ISOLATED_LAB_ONLY');
const {createPgClient}=require(path.join(app,'dist/src/platform/persistence/sql-client.js'));
const cut=require(path.join(app,'dist/src/entregas/pilot/storage-cutover.js'));
const {PgPilotReadyOrderStore}=require(path.join(app,'dist/src/entregas/pilot/ready-orders.js'));
const files={data_file:path.join(root,'data/pilot/store.json'),ready_file:path.join(root,'data/pilot/ready_orders.json')};
const source=()=>cut.readFilePilotStorageSnapshot({unit_id:unit,...files});
const empty=x=>Object.values(x).every(v=>v===0);
async function client(admin=false){
 const c=await createPgClient({url:'postgresql://'+(admin?'deliveryos_owner':'deliveryos_entregas_pilot')+':'+(admin?s.admin:s.pilot)+'@127.0.0.1:55436/deliveryos_lab',ssl:false,max:2});
 const [i]=await c.query('SELECT current_database() AS db,current_user AS role,inet_server_port() AS port');
 assert(i.db==='deliveryos_lab'&&i.port===55436&&i.role===(admin?'deliveryos_owner':'deliveryos_entregas_pilot'),'OWN_LAB_DATABASE_REQUIRED');return c;
}
async function api(route,options={}){
 const manager=s.users.find(u=>u.role==='gerente');assert(manager,'SYNTHETIC_MANAGER_REQUIRED');
 const r=await fetch(base+route,{...options,headers:{'Content-Type':'application/json',Authorization:'Bearer '+manager.token},signal:AbortSignal.timeout(10000)});
 assert.equal(r.status,200,'HTTP_PROOF_FAILED');return r.json();
}
async function main(){
 const mode=process.argv[2];
 if(mode==='prepare'){
  const proof=load('pg-ephemeral-proof.json');assert.equal(proof.scope,'SEPARATE_CLUSTER_55437_SYNTHETIC_ONLY');assert.equal(proof.results.length,2);
  const snap=await source();assert(empty(cut.snapshotCounts(snap)),'NONEMPTY_SOURCE_REQUIRES_SEPARATE_MIGRATION');
  const c=await client(true);try{
   assert(empty(await cut.targetCounts(c,unit)),'TARGET_NOT_EMPTY');
   await c.query("INSERT INTO identity.unit(unit_id,display_name,timezone,active) VALUES ($1,'ENSAIO LOCAL ITAIM','America/Sao_Paulo',true) ON CONFLICT(unit_id) DO NOTHING",[unit]);
  }finally{await c.close();}
  const pilot=await client();try{
   const plan=await cut.planFileToPostgresCutover({sql:pilot,snapshot:snap});assert(plan.can_apply&&empty(plan.target_counts),'CUTOVER_PLAN_DENIED');
   save('pg-storage-plan.json',{...plan,scope:'EMPTY_SIMULATED_LEGACY_CONSOLE_ONLY',observedAtUtc:new Date().toISOString()});
   console.log('PG_STORAGE_PLAN_PASS',JSON.stringify({sourceCounts:plan.source_counts,targetCounts:plan.target_counts,fingerprint:plan.source_fingerprint}));
  }finally{await pilot.close();}
 }else if(mode==='apply'){
  assert(!fs.existsSync(path.join(root,'pilot-storage.json')),'ALREADY_CONFIGURED');
  const pids=load('runtime-pids.json');try{process.kill(pids.pilot,0);throw Error('FILE_PILOT_MUST_BE_STOPPED');}catch(e){if(e.code!=='ESRCH')throw e;}
  const plan=load('pg-storage-plan.json'),snap=await source();assert.equal(cut.snapshotFingerprint(snap),plan.source_fingerprint);assert(empty(cut.snapshotCounts(snap)));
  const c=await client();try{
   const result=await cut.applyFileToPostgresCutover({sql:c,snapshot:snap});assert.equal(result.target_fingerprint,plan.source_fingerprint);
   fs.writeFileSync(path.join(root,'pilot-storage.json'),JSON.stringify({schema:'deliveryos.lab-pilot-storage.v1',unitId:unit,kind:'postgres',sourceMode:'simulated',scope:'isolated_legacy_console_only'}),{flag:'wx'});
   save('pg-storage-cutover-proof.json',{observedAtUtc:new Date().toISOString(),scope:plan.scope,result,sourcePreserved:true,nativeReceiptsAvailable:false,gps:false});console.log('PG_STORAGE_EMPTY_CUTOVER_PASS');
  }finally{await c.close();}
 }else if(mode==='probe-begin'){
  const h=await api('/api/health');assert.equal(h.storage_backend,'postgres');assert.equal(h.native_inbound_receipts.available,false);assert.equal(h.gps_production,false);assert.equal(h.term_publishable,false);
  const probe={ref:'LAB_PG_PERSISTENCE_'+crypto.randomUUID(),label:'ENSAIO SINTETICO DE PERSISTENCIA'};save('pg-storage-probe.json',probe);
  const response=await api('/api/ready-order',{method:'POST',body:JSON.stringify({order_ref:probe.ref,label:probe.label,channel:'proprio'})});assert.equal(response.ok,true);
  const c=await client();try{const rows=await new PgPilotReadyOrderStore(c,unit).list();assert(rows.some(r=>r.order_ref===probe.ref&&r.label===probe.label));}finally{await c.close();}
  const lab=await api('/api/copiloto/lab-storage');assert.equal(lab.storage_backend,'postgres');assert.equal(lab.ready_queue_records,1);assert.equal(lab.operational_order_total,null);
  console.log('PG_STORAGE_HTTP_WRITE_AND_SQL_READ_PASS');
 }else if(mode==='probe-finish'){
  const probe=load('pg-storage-probe.json');assert(/^LAB_PG_PERSISTENCE_[a-f0-9-]{36}$/.test(probe.ref));
  const snap=await api('/api/snapshot');assert(snap.ready_orders.some(o=>o.order_ref===probe.ref&&o.label===probe.label));
  const lab=await api('/api/copiloto/lab-storage');assert.equal(lab.ready_queue_records,1);assert.equal(lab.source_mode,'simulated');
  const c=await client();try{
   assert.equal(await new PgPilotReadyOrderStore(c,unit).removeByOrderRefs([probe.ref]),1);
   const current=await cut.readPostgresPilotStorageSnapshot(c,unit);assert.equal(cut.snapshotFingerprint(current),load('pg-storage-plan.json').source_fingerprint);
   save('pg-storage-persistence-proof.json',{observedAtUtc:new Date().toISOString(),scope:'SYNTHETIC_EMPTY_LAB_ONLY',httpWrite:true,limitedRoleSqlRead:true,pilotRestartSurvived:true,httpReadAfterRestart:true,copilotoSharesSameQueue:true,ownedProbeRemoved:true,finalSnapshotEqualsOriginal:true,gps:false,nativeReceiptSync:false});
  }finally{await c.close();}console.log('PG_STORAGE_PERSISTENCE_PASS');
 }else if(mode==='rollback-check'){
  const c=await client();try{assert.equal(cut.snapshotFingerprint(await cut.readPostgresPilotStorageSnapshot(c,unit)),load('pg-storage-plan.json').source_fingerprint);}finally{await c.close();}
  assert.equal(cut.snapshotFingerprint(await source()),load('pg-storage-plan.json').source_fingerprint);
  if(fs.existsSync(path.join(root,'pilot-storage.json')))fs.unlinkSync(path.join(root,'pilot-storage.json'));
  console.log('PG_STORAGE_ROLLBACK_POINTER_SAFE');
 }else throw Error('UNKNOWN_CONTROL_COMMAND');
}
main().catch(()=>{console.error('PG_STORAGE_SWITCH_DENIED: inspect privately; never force a fallback over changed PostgreSQL data');process.exitCode=1});
