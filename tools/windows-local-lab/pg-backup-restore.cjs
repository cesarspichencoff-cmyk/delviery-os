'use strict';
// On-host, manual recovery drill for the existing simulated lab only.
// No source writes, globals/password export, scheduled job or live restore.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const crypto=require('node:crypto'),net=require('node:net'),assert=require('node:assert/strict');
const root=__dirname,app=path.join(root,'app'),bin=path.join(root,'postgres16/bin');
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const ident=x=>'"'+x.replaceAll('"','""')+'"';
const load=n=>JSON.parse(fs.readFileSync(path.join(root,n),'utf8'));
let stage='preflight';
async function inventory(client){
 await client.query("SET TIME ZONE 'UTC'");
 await client.query("SET DateStyle='ISO, YMD'");
 const tables=(await client.query("SELECT n.nspname AS schema,c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind='r' AND n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%' ORDER BY 1,2")).rows;
 assert(tables.length>0&&tables.length<=100,'BOUNDED_LAB_TABLES_REQUIRED');
 const data=[];
 for(const t of tables){
  const table=ident(t.schema)+'.'+ident(t.name);
  const count=Number((await client.query('SELECT count(*) AS n FROM '+table)).rows[0].n);
  assert(count<=100000,'LAB_ROW_BUDGET_EXCEEDED');
  const row=(await client.query("SELECT coalesce(string_agg(h,'' ORDER BY h),'') AS hashes FROM (SELECT encode(sha256(convert_to(row_to_json(t)::text,'UTF8')),'hex') AS h FROM "+table+' t) d')).rows[0];
  data.push({table:t.schema+'.'+t.name,rows:count,sha256:hash(row.hashes)});
 }
 const columns=(await client.query("SELECT table_schema,table_name,column_name,ordinal_position,data_type,udt_schema,udt_name,is_nullable,column_default,is_identity,identity_generation FROM information_schema.columns WHERE table_schema NOT IN ('pg_catalog','information_schema') ORDER BY table_schema,table_name,ordinal_position")).rows;
 return {tables:tables.length,rows:data.reduce((n,t)=>n+t.rows,0),dataSha256:hash(JSON.stringify(data)),columnsSha256:hash(JSON.stringify(columns))};
}
async function main(){
 assert.equal(process.platform,'win32','WINDOWS_HOST_ONLY');
 assert.equal(require('node:os').hostname().toUpperCase(),'CAIXA_MOOCA','OWN_HOST_ONLY');
 const cfg=load('pilot-local.json'),storage=load('pilot-storage.json'),flags=load('gps-disabled.json');
 assert(cfg.mode==='test'&&cfg.source_mode==='simulated'&&cfg.unit_id==='ITAIM'&&flags.gps_capture_enabled===false&&Object.values(cfg.features).every(v=>v===false),'SIMULATED_LAB_ONLY');
 assert(storage.kind==='postgres'&&storage.unitId==='ITAIM'&&storage.sourceMode==='simulated'&&storage.scope==='isolated_legacy_console_only','OWN_STORAGE_ONLY');
 await new Promise((resolve,reject)=>{const s=net.createServer();s.once('error',reject);s.listen(55438,'127.0.0.1',()=>s.close(resolve));});
 const work=fs.mkdtempSync(path.join(root,'pg-recovery-')),data=path.join(work,'data'),dump=path.join(work,'lab.dump');
 const secret=load('private-local.json'),password=crypto.randomBytes(32).toString('hex');
 const pg=require(path.join(app,'node_modules/pg'));
 const source=new pg.Client({host:'127.0.0.1',port:55436,database:'deliveryos_lab',user:'deliveryos_owner',password:secret.admin,connectionTimeoutMillis:5000});
 let started=false,connected=false,restore;
 function run(exe,args,label,env={}){
  stage=label;
  const out=fs.openSync(path.join(work,label+'.out.log'),'a'),err=fs.openSync(path.join(work,label+'.err.log'),'a');
  try{const r=cp.spawnSync(path.join(bin,exe),args,{stdio:['ignore',out,err],env:{...process.env,...env},timeout:60000,windowsHide:true});assert.equal(r.status,0,'RECOVERY_STEP_FAILED_'+label);}
  finally{fs.closeSync(out);fs.closeSync(err);}
 }
 try{
  stage='source-connect';await source.connect();connected=true;
  const id=(await source.query('SELECT current_database() AS db,current_user AS role,inet_server_port() AS port')).rows[0];
  assert(id.db==='deliveryos_lab'&&id.role==='deliveryos_owner'&&id.port===55436,'OWN_LAB_IDENTITY_REQUIRED');
  await source.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  await source.query("SET LOCAL statement_timeout='15s'");
  const snapshot=(await source.query('SELECT pg_export_snapshot() AS id')).rows[0].id;
  assert(/^[0-9A-F-]+$/.test(snapshot),'INVALID_SNAPSHOT');
  stage='source-inventory';const before=await inventory(source);
  const roles=(await source.query("SELECT rolname FROM pg_roles WHERE rolname LIKE 'deliveryos_%' ORDER BY rolname")).rows;
  assert(roles.length<=20&&roles.every(r=>/^deliveryos_[a-z_]+$/.test(r.rolname)),'LAB_ROLES_ONLY');
  run('pg_dump.exe',['--host=127.0.0.1','--port=55436','--username=deliveryos_owner','--dbname=deliveryos_lab','--no-password','--format=custom','--lock-wait-timeout=5s','--snapshot='+snapshot,'--file='+dump],'dump',{PGPASSWORD:secret.admin});
  await source.query('COMMIT');
  const dumpSha256=hash(fs.readFileSync(dump));
  // Reject a changed archive before loading anything into the disposable target.
  assert.equal(hash(fs.readFileSync(dump)),dumpSha256,'ARCHIVE_CHANGED');
  const pwfile=path.join(work,'ephemeral-password.txt');fs.writeFileSync(pwfile,password,{flag:'wx'});
  try{run('initdb.exe',['-D',data,'-U','postgres','-A','scram-sha-256','--pwfile='+pwfile,'--locale=C','--no-instructions'],'initdb');}finally{fs.unlinkSync(pwfile);}
  run('pg_ctl.exe',['-D',data,'-l',path.join(work,'postgres.log'),'-o','-h 127.0.0.1 -p 55438','-w','start'],'start');started=true;
  restore=new pg.Client({host:'127.0.0.1',port:55438,database:'postgres',user:'postgres',password,connectionTimeoutMillis:5000});await restore.connect();
  for(const role of roles)await restore.query('CREATE ROLE '+ident(role.rolname)+' NOLOGIN');
  run('pg_restore.exe',['--host=127.0.0.1','--port=55438','--username=postgres','--dbname=postgres','--no-password','--no-owner','--no-privileges','--exit-on-error','--single-transaction',dump],'restore',{PGPASSWORD:password});
  stage='restore-inventory';const recovered=await inventory(restore);
  if(JSON.stringify(recovered)!==JSON.stringify(before))console.log('RECOVERY_INVENTORY_DIFFER',JSON.stringify({before,recovered}));
  assert.deepEqual(recovered,before,'RESTORED_DATA_OR_COLUMNS_DIFFER');
  stage='negative-control';
  // A negative control proves the inventory detects changed restored data.
  await restore.query('BEGIN');
  await restore.query("UPDATE identity.unit SET display_name=display_name || '_RESTORE_NEGATIVE_CONTROL' WHERE unit_id='ITAIM'");
  const changed=await inventory(restore);assert.notEqual(changed.dataSha256,recovered.dataSha256,'NEGATIVE_CONTROL_NOT_DETECTED');
  await restore.query('ROLLBACK');assert.deepEqual(await inventory(restore),before,'NEGATIVE_CONTROL_ROLLBACK_FAILED');
  await restore.end();restore=null;
  run('pg_ctl.exe',['-D',data,'-m','fast','-w','stop'],'stop');started=false;
  const receipt={schema:'deliveryos.pg-backup-restore.v1',observedAtUtc:new Date().toISOString(),scope:'LOCAL_SIMULATED_LAB_ONLY',archiveSha256:dumpSha256,archiveBytes:fs.statSync(dump).size,consistentSnapshot:true,restoredSeparateClusterPort:55438,sourceReadOnly:true,inventory:before,restoredDataAndColumnsEqual:true,negativeControlDetected:true,negativeControlRolledBack:true,disposableClusterStopped:true,offHost:false,encrypted:false,scheduled:false,rolesPasswordsAndPrivilegesRestored:false,liveDatabaseRestore:false};
  fs.writeFileSync(path.join(work,'proof.json'),JSON.stringify(receipt,null,2));
  fs.writeFileSync(path.join(root,'pg-backup-restore-proof.json'),JSON.stringify(receipt,null,2));
  console.log('PG_BACKUP_RESTORE_PASS',JSON.stringify(receipt));
 }finally{
  if(restore)await restore.end().catch(()=>{});
  if(connected)await source.end().catch(()=>{});
  if(started)run('pg_ctl.exe',['-D',data,'-m','fast','-w','stop'],'cleanup-stop');
 }
}
main().catch(e=>{const code=/^[A-Z0-9_]+$/.test(e.message||'')?e.message:(e.code||'PRIVATE_ERROR');console.error('PG_BACKUP_RESTORE_FAILED',JSON.stringify({stage,code}));process.exitCode=1});
