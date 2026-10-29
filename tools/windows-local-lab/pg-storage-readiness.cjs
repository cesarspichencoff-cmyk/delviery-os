'use strict';
// Private lab inventory only. Never outputs credentials or operational payloads.
const fs=require('node:fs'),path=require('node:path');
const root=__dirname,app=path.join(root,'app');
async function main(){
 const secrets=JSON.parse(fs.readFileSync(path.join(root,'private-local.json'),'utf8'));
 const cfg=JSON.parse(fs.readFileSync(path.join(root,'pilot-local.json'),'utf8'));
 if(cfg.unit_id!=='ITAIM'||cfg.mode!=='test'||cfg.source_mode!=='simulated')throw Error('ISOLATED_LAB_REQUIRED');
 const {createPgClient}=require(path.join(app,'dist/src/platform/persistence/sql-client.js'));
 const cutover=require(path.join(app,'dist/src/entregas/pilot/storage-cutover.js'));
 const client=await createPgClient({url:'postgresql://deliveryos_entregas_pilot:'+secrets.pilot+'@127.0.0.1:55436/deliveryos_lab',ssl:false,max:1});
 try {
  const [identity]=await client.query(`SELECT current_database() AS database, current_user AS role, r.rolsuper, r.rolcreatedb, r.rolcreaterole, r.rolbypassrls FROM pg_roles r WHERE r.rolname=current_user`);
  if(identity.database!=='deliveryos_lab'||identity.role!=='deliveryos_entregas_pilot'||identity.rolsuper||identity.rolcreatedb||identity.rolcreaterole||identity.rolbypassrls)throw Error('LIMITED_LAB_ROLE_REQUIRED');
  const migrations=await client.query('SELECT version FROM platform.schema_migration ORDER BY version');
  const [unit]=await client.query('SELECT count(*)::int AS active FROM identity.unit WHERE unit_id=$1 AND active=true',['ITAIM']);
  const [receipt]=await client.query("SELECT to_regclass('entregas.inbound_receipt') IS NOT NULL AS table_exists");
  const source=await cutover.readFilePilotStorageSnapshot({unit_id:'ITAIM',data_file:path.join(root,'data/pilot/store.json'),ready_file:path.join(root,'data/pilot/ready_orders.json')});
  const target=await cutover.targetCounts(client,'ITAIM');
  const result={schema:'deliveryos.pg-storage-readiness.v1',observedAtUtc:new Date().toISOString(),scope:'ISOLATED_SIMULATED_LAB_ONLY',assessment:'inventory_only_not_cutover_authorization',identity,migrations:migrations.map(x=>x.version),unitActive:unit.active===1,receiptTableExists:receipt.table_exists,sourceCounts:cutover.snapshotCounts(source),sourceFingerprint:cutover.snapshotFingerprint(source),targetCounts:target,noMutationExecuted:true};
  fs.writeFileSync(path.join(root,'pg-storage-readiness-proof.json'),JSON.stringify(result,null,2));console.log('PG_STORAGE_READINESS',JSON.stringify(result));
 } finally {await client.close();}
}
main().catch(()=>{console.error('PG_STORAGE_READINESS_FAILED: inspect privately');process.exitCode=1});
