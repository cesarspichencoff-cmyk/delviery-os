
const fs=require('fs'),path=require('path'),cp=require('child_process'),net=require('net');
const root=__dirname,app=path.join(root,'app'),secrets=JSON.parse(fs.readFileSync(path.join(root,'private-local.json')));
const pg=require(path.join(app,'node_modules','pg'));
const stamp=JSON.parse(fs.readFileSync(path.join(app,'dist/build-stamp.json')));
const envBase=Object.fromEntries(Object.entries(process.env).filter(([k])=>!k.startsWith('DELIVERYOS_')&&!k.startsWith('ENTREGAS_')));
const dbUrl=(role,pwd)=>'postgresql://'+role+':'+pwd+'@127.0.0.1:55436/deliveryos_lab';
const common={...envBase,DELIVERYOS_ENV:'local',DELIVERYOS_DATABASE_SSL:'false',DELIVERYOS_HOST:'127.0.0.1',DELIVERYOS_PORT:'8080',DELIVERYOS_COMMIT:stamp.commit,DELIVERYOS_SOURCE_MODE:'simulated',DELIVERYOS_MIGRATE_ON_BOOT:'false',DELIVERYOS_DEVICE_TOKEN_SECRET:secrets.device,DELIVERYOS_PILOT_READ_SECRETS:JSON.stringify({ITAIM:secrets.read})};
async function portFree(port){return new Promise((resolve,reject)=>{const server=net.createServer();server.once('error',reject);server.listen(port,'127.0.0.1',()=>server.close(resolve));});}
function launch(label,file,env){const out=fs.openSync(path.join(root,'logs',label+'.out.log'),'a');const err=fs.openSync(path.join(root,'logs',label+'.err.log'),'a');const child=cp.spawn(process.execPath,[file],{cwd:app,env,stdio:['ignore',out,err],detached:true,windowsHide:true});fs.closeSync(out);fs.closeSync(err);child.unref();return child.pid;}
async function main(){
 const cmd=process.argv[2];
 if(cmd==='migrate'){
  const admin=dbUrl('deliveryos_owner',secrets.admin);
  const result=cp.spawnSync(process.execPath,['dist/src/platform/bin/migrate.js'],{cwd:app,env:{...common,DELIVERYOS_DATABASE_URL:admin},encoding:'utf8'});
  fs.writeFileSync(path.join(root,'logs','migration.log'),(result.stdout||'')+(result.stderr||''));
  if(result.status!==0)throw Error('Migration recusada: consultar log privado');
  const client=new pg.Client({connectionString:admin});await client.connect();
  try{await client.query(fs.readFileSync(path.join(root,'papeis_minimos.sql'),'utf8'));
   for(const [role,key] of [['deliveryos_critical','critical'],['deliveryos_async','async'],['deliveryos_entregas_pilot','pilot']]){
    const pwd=secrets[key];if(!/^[a-f0-9]{64}$/.test(pwd))throw Error('Senha invalida');
    await client.query('ALTER ROLE '+role+" PASSWORD '"+pwd+"'");
   }
   const r=await client.query("SELECT rolname,rolsuper,rolcreatedb,rolcreaterole FROM pg_roles WHERE rolname IN ('deliveryos_critical','deliveryos_async','deliveryos_entregas_pilot')");
   if(r.rows.some(x=>x.rolsuper||x.rolcreatedb||x.rolcreaterole))throw Error('Privilegio excessivo');
   console.log('ISOLATED_MIGRATIONS_AND_ROLES_PASS',JSON.stringify(r.rows));
  }finally{await client.end();}
 }else if(cmd==='start'){
  if(fs.existsSync(path.join(root,'runtime-pids.json')))throw Error('Arquivo de processos existe; conferir antes de reiniciar');
  const pilotStorageEnv={};
  if(fs.existsSync(path.join(root,'pilot-storage.json'))){
   const storage=JSON.parse(fs.readFileSync(path.join(root,'pilot-storage.json'),'utf8'));
   const cfg=JSON.parse(fs.readFileSync(path.join(root,'pilot-local.json'),'utf8'));
   const flags=JSON.parse(fs.readFileSync(path.join(root,'gps-disabled.json'),'utf8'));
   if(storage.schema!=='deliveryos.lab-pilot-storage.v1'||storage.kind!=='postgres'||storage.unitId!=='ITAIM'||storage.sourceMode!=='simulated'||storage.scope!=='isolated_legacy_console_only'||cfg.unit_id!=='ITAIM'||cfg.mode!=='test'||cfg.source_mode!=='simulated'||flags.gps_capture_enabled!==false)throw Error('Configuracao PostgreSQL do ensaio invalida');
   Object.assign(pilotStorageEnv,{ENTREGAS_STORAGE_BACKEND:'postgres',DELIVERYOS_DATABASE_SSL:'false',DELIVERYOS_DATABASE_URL:dbUrl('deliveryos_entregas_pilot',secrets.pilot)});
  }
  await portFree(5193);await portFree(8080);
  const critical=launch('critical','dist/src/platform/bin/critical.js',{...common,DELIVERYOS_DATABASE_URL:dbUrl('deliveryos_critical',secrets.critical)});
  const asyncPid=launch('async','dist/src/platform/bin/async-runtime.js',{...common,DELIVERYOS_DATABASE_URL:dbUrl('deliveryos_async',secrets.async),DELIVERYOS_INSTANCE_ID:'mooca-lab-async'});
  const pilot=launch('pilot','dist/tools/entregas_pilot_server.js',{...envBase,...pilotStorageEnv,ENTREGAS_ENV:'local',ENTREGAS_BIND:'127.0.0.1',ENTREGAS_UI_PORT:'5193',ENTREGAS_UNIT_ID:'ITAIM',ENTREGAS_PILOT_CONFIG:path.join(root,'pilot-local.json'),ENTREGAS_DATA_DIR:path.join(root,'data','pilot'),ENTREGAS_GPS_FLAGS_CONFIG:path.join(root,'gps-disabled.json'),ENTREGAS_PLATFORM_URL:'http://127.0.0.1:8080',ENTREGAS_PLATFORM_READ_SECRET:secrets.read});
  fs.writeFileSync(path.join(root,'runtime-pids.json'),JSON.stringify({critical,async:asyncPid,pilot}));
  console.log('LOCAL_RUNTIMES_STARTED',JSON.stringify({critical,async:asyncPid,pilot}));
 }else if(cmd==='smoke'){
  const results=[];
  for(const [name,url] of [['pilot','http://127.0.0.1:5193/api/health'],['platform','http://127.0.0.1:8080/health'],['ready','http://127.0.0.1:8080/ready']]){
   const r=await fetch(url,{signal:AbortSignal.timeout(8000)});results.push({name,status:r.status});if(!r.ok)throw Error(name+' indisponivel: '+r.status);
  }
  const r=await fetch('http://127.0.0.1:5193/api/term');if(r.status!==401&&r.status!==403)throw Error('Termo deve exigir sessao');
  results.push({name:'term_requires_session',status:r.status});
  fs.writeFileSync(path.join(root,'local-smoke.json'),JSON.stringify({source:stamp.commit,scope:'LOCAL_ONLY_NOT_FIELD_READY',results},null,2));console.log('LOCAL_SMOKE_PASS',JSON.stringify(results));
 }else throw Error('Comando esperado: migrate, start ou smoke');
}
main().catch(e=>{console.error('LOCAL_PREPARATION_REFUSED:',e.message);process.exitCode=1;});
