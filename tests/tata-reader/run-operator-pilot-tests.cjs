'use strict';
// Runs the actual Entregas server. The child preload replaces fetch with a closed synthetic provider;
// no real OTP, DNS, provider account, database, order, print or GPS is used.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawn}=require('node:child_process'),net=require('node:net'),http=require('node:http');
const {createOperatorPilotRuntime}=require('../../dist/src/platform/auth/operator-pilot-runtime.js');
const repo=path.resolve(__dirname,'../..'),root=fs.mkdtempSync(path.join(os.tmpdir(),'operator-pilot-'));
const configFile=path.join(root,'operator.json'),rosterFile=path.join(root,'roster.json'),sourceRoot=path.join(root,'reader');
const origin='https://operator.example.invalid',authBase='https://provider.invalid/auth';
const now=Date.now(),expiry=new Date(now+3600000).toISOString();
const scope={unitId:'ITAIM',sourceUnitId:'LAB',sourceStoreId:'01',mappingEvidenceRef:'SYNTHETIC',sourceMode:'simulated',sourceTimePolicy:{schema:'deliveryos.source-time-policy.v1',unitId:'ITAIM',sourceUnitId:'LAB',sourceStoreId:'01',field:'DTHRABERMESA',basis:'NATIVE_LOCAL_WALL_TIME',timeZone:'America/Sao_Paulo',evidenceRef:'SYNTHETIC'}};
const valid={schema:'deliveryos.operator-pilot.v1',unitId:'ITAIM',enabled:true,publishEnabled:true,authBase,appOrigin:origin,rosterFile,sourceRoot,scope,maxAgeMs:120000,expiresAt:expiry,approvalRef:'SYNTHETIC',sourceModeEvidenceRef:'SYNTHETIC'};
const env={ENTREGAS_OPERATOR_CONFIG:configFile,ENTREGAS_PUBLIC_URL:origin};
const save=cfg=>fs.writeFileSync(configFile,JSON.stringify(cfg));
let passed=0,child,logs='';
function pass(s){passed++;console.log('PASS',s);}
async function freePort(){return new Promise((resolve,reject)=>{const s=net.createServer();s.on('error',reject);s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});}
function req(port,url,method='GET',body,headers={}){return new Promise((resolve,reject)=>{const r=http.request({host:'127.0.0.1',port,path:url,method,headers:{Host:new URL(origin).host,...(method==='POST'?{Origin:origin,'Content-Type':'application/json'}:{}),...headers}},res=>{let text='';res.setEncoding('utf8');res.on('data',s=>text+=s);res.on('end',()=>{let data;try{data=JSON.parse(text);}catch{}resolve({status:res.statusCode,headers:res.headers,text,data});});});r.on('error',reject);r.setTimeout(5000,()=>r.destroy(Error('REQUEST_TIMEOUT')));r.end(body===undefined?undefined:JSON.stringify(body));});}
async function stop(){if(!child)return;const c=child;child=null;if(c.exitCode!==null)return;await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{c.kill('SIGKILL');reject(Error('OWN_CHILD_STOP_TIMEOUT'));},5000);c.once('exit',()=>{clearTimeout(timer);resolve();});c.kill('SIGTERM');});}
async function start(enabled){
 const port=await freePort();logs='';
 const childEnv={PATH:process.env.PATH,HOME:process.env.HOME,TMPDIR:process.env.TMPDIR,SystemRoot:process.env.SystemRoot,TEMP:process.env.TEMP,TMP:process.env.TMP,
  ENTREGAS_ENV:'local',ENTREGAS_BIND:'127.0.0.1',ENTREGAS_STORAGE_BACKEND:'file',ENTREGAS_UI_PORT:String(port),ENTREGAS_PILOT_CONFIG:path.join(root,'pilot.json'),ENTREGAS_DATA_DIR:path.join(root,'data'),ENTREGAS_PUBLIC_URL:origin,
  ...(enabled?{ENTREGAS_OPERATOR_CONFIG:configFile}:{})};
 child=spawn(process.execPath,['--require',path.join(root,'provider.cjs'),path.join(repo,'dist/tools/entregas_pilot_server.js')],{cwd:repo,env:childEnv,stdio:['ignore','pipe','pipe']});
 child.stdout.on('data',s=>logs+=s);child.stderr.on('data',s=>logs+=s);
 for(let i=0;i<120;i++){if(child.exitCode!==null)throw Error('BOOT_FAILED '+logs);try{if((await req(port,'/api/health')).status===200)return port;}catch{}await new Promise(r=>setTimeout(r,50));}
 throw Error('BOOT_TIMEOUT '+logs);
}
(async()=>{
 assert.equal(createOperatorPilotRuntime({},repo).enabled,false);
 save({schema:valid.schema,unitId:'ITAIM',enabled:false,publishEnabled:false});assert.equal(createOperatorPilotRuntime(env,repo).enabled,false);
 pass('opt-in absent and explicitly disabled preserve old boot');
 const mutations=[c=>c.unitId='MOOCA',c=>c.publishEnabled=false,c=>c.scope.sourceMode=null,c=>c.scope.sourceTimePolicy=null,c=>c.scope.sourceTimePolicy.sourceUnitId='OTHER',c=>c.sourceModeEvidenceRef='',c=>c.expiresAt='2020-01-01T00:00:00.000Z',c=>c.maxAgeMs=999999,c=>c.appOrigin='https://other.invalid',c=>c.rosterFile='relative',c=>c.rosterFile=path.join(repo,'src/entregas/ui/private.json')];
 for(const mutate of mutations){const cfg=structuredClone(valid);mutate(cfg);save(cfg);assert.throws(()=>createOperatorPilotRuntime(env,repo));}
 fs.writeFileSync(configFile,' '.repeat(16385));assert.throws(()=>createOperatorPilotRuntime(env,repo));
 assert.throws(()=>createOperatorPilotRuntime({...env,ENTREGAS_OPERATOR_CONFIG:'relative'},repo));
 pass('13 invalid scope, provenance, time, origin and private-file configurations denied');
 const pilot=JSON.parse(fs.readFileSync(path.join(repo,'config/entregas-pilot.example.json')));pilot.mode='test';pilot.backup.auto_interval_minutes=0;pilot.users=[{actor_id:'lab-manager',role:'gerente',label:'SYNTHETIC',token:'lab-token-'.repeat(8)}];fs.writeFileSync(path.join(root,'pilot.json'),JSON.stringify(pilot));
 fs.writeFileSync(rosterFile,JSON.stringify({schema:'deliveryos.operator-roster.v1',entries:[{email:'operator@example.invalid',subject:'SUBJECT',unitId:'ITAIM',role:'lider',active:true,approvalRef:'SYNTHETIC',expiresAt:expiry}]}));
 fs.writeFileSync(path.join(root,'provider.cjs'),`global.fetch=async(url,init)=>{if(!String(url).startsWith('${authBase}/'))throw Error('NETWORK_FORBIDDEN');if(String(url).includes('/sign-in/'))return Response.json({ok:true},{headers:{'Set-Cookie':'__Secure-better-auth.session_token=PRIVATE_PROVIDER_SENTINEL; HttpOnly; Secure; Path=/'}});if(String(url).includes('/get-session'))return Response.json({user:{id:'SUBJECT',email:'operator@example.invalid'},session:{userId:'SUBJECT',createdAt:new Date(Date.now()-60000).toISOString(),expiresAt:'${expiry}'}});return Response.json({ok:true});};`);
 const events=path.join(sourceRoot,'state/reader-events-v1');fs.mkdirSync(events,{recursive:true});const hash='a'.repeat(64),orderKey='LAB|01|V1|C1';
 const event={schema:'deliveryos.tata-reader-stable-order-event.v1',snapshot_hash:hash,order_key:orderKey,observed_at:new Date(now-1000).toISOString(),ready_for_downstream_shadow:true,blockers:[],service_resolution:{service:'LUNCH',evidence:'HUMAN_CONFIRMED_RULE',source_ref:'SYNTHETIC',blockers:[]},effects:{database_read:true,database_write:false,network_call:false,odhen_write:false,print:false,spooler_write:false,fiscal_action:false,sefaz_call:false,cutover:false},order:{CDFILIAL:'LAB',CDLOJA:'01',NRVENDAREST:'V1',NRCOMANDA:'C1',IDORGCMDVENDA:'DELIVERY',DTHRABERMESA:new Date(now-30000).toISOString(),customer:'PRIVATE_CUSTOMER_SENTINEL',items:[{CDPRODUTO:'P1',QTPRODCOMVEN:'2'}]}};
 const eventFile=path.join(events,'C1_'+hash+'.json');fs.writeFileSync(eventFile,JSON.stringify(event));
 fs.writeFileSync(path.join(sourceRoot,'state/reader-watch-checkpoint-v1.json'),JSON.stringify({schema:'deliveryos.tata-reader-continuous-checkpoint.v1',bootstrap_complete:true,entries:[{order_key:orderKey,snapshot_hash:hash,emitted_hash:hash,stable_count:2}]}));
 save(valid);let port=await start(false);
 for(const route of ['/copiloto/pedidos/','/copiloto/pedidos/index.html','/api/copiloto/orders','/api/operator/login/begin','/copiloto/%70edidos/'])assert.equal((await req(port,route)).status,503);
 assert.equal((await req(port,'/api/health')).data.copiloto_orders_configured,false);await stop();
 pass('actual pilot reserves operator namespaces while disabled, including static aliases');
 port=await start(true);
 const page=await req(port,'/copiloto/pedidos/');assert.equal(page.status,200);assert(!page.text.includes('pilot-session-boot'));assert(!page.text.includes('localStorage'));assert.match(page.headers['content-security-policy'],/default-src 'none'/);
 assert.equal((await req(port,'/console/')).status,200);assert.equal((await req(port,'/api/health')).data.copiloto_orders_configured,true);
 assert.equal((await req(port,'/copiloto/pedidos/index.html')).status,404);
 const css=await req(port,'/copiloto/pedidos/app.css');assert.equal(css.status,200);
 assert(css.text.includes('--org-fundo: #08130d'));assert(css.text.includes('--motion-quick:120ms'));
 assert(css.text.includes('prefers-reduced-motion:reduce'));assert(css.text.includes('.workbench'));
 assert(!css.text.includes('@import'));
 assert.equal((await req(port,'/api/copiloto/orders','GET',undefined,{Authorization:'Bearer '+pilot.users[0].token})).status,401);
 assert.equal((await req(port,'/api/operator/login/begin','OPTIONS',undefined,{Origin:origin})).status,405);
 pass('actual pilot composes independent read UI without legacy bearer authority or script injection');
 const begin=await req(port,'/api/operator/login/begin','POST',{email:'operator@example.invalid'});assert.equal(begin.status,200);
 const done=await req(port,'/api/operator/login/complete','POST',{otp:'123456'},{Cookie:begin.headers['set-cookie'][0].split(';')[0]});assert.equal(done.status,200);
 const cookie=done.headers['set-cookie'][1].split(';')[0];assert.match(done.headers['set-cookie'][1],/HttpOnly; Secure; SameSite=Strict/);
 let r=await req(port,'/api/copiloto/orders','GET',undefined,{Cookie:cookie});assert.equal(r.status,200);assert.equal(r.data.data.view.orders[0].items[0].quantity,2);assert.equal(r.data.data.view.orders[0].source_mode,'simulated');assert.equal(r.data.data.operational_order_total,null);assert(!r.text.includes('PRIVATE'));
 assert.equal((await req(port,'/api/command','POST',{type:'anything'},{Cookie:cookie})).status,401);
 assert.equal((await req(port,'/api/copiloto/orders?unit=MOOCA','GET',undefined,{Cookie:cookie})).status,404);
 pass('OTP fixture -> actual Entregas server -> native file -> TATA motor; no command privilege');
 event.blockers=['PRIVATE_BLOCKER'];fs.writeFileSync(eventFile,JSON.stringify(event));r=await req(port,'/api/copiloto/orders','GET',undefined,{Cookie:cookie});assert.equal(r.data.data.state,'unavailable');assert.equal(r.data.data.view,null);assert(!r.text.includes('PRIVATE'));
 pass('source denial never falls back to the previous readable order');
 const roster=JSON.parse(fs.readFileSync(rosterFile));roster.entries[0].active=false;fs.writeFileSync(rosterFile,JSON.stringify(roster));r=await req(port,'/api/copiloto/orders','GET',undefined,{Cookie:cookie});assert.equal(r.status,401);
 pass('live file revocation removes operator session access in mounted server');
 save({...valid,enabled:false,publishEnabled:false});r=await req(port,'/api/copiloto/orders','GET',undefined,{Cookie:cookie});assert.equal(r.status,503);assert.equal((await req(port,'/api/health')).status,200);assert(!r.text.includes(root));
 pass('configuration change closes operator reads without stopping Entregas');
 await stop();save(valid);let clock=now;const runtime=createOperatorPilotRuntime(env,repo,()=>clock);clock=Date.parse(expiry);
 let status;const response={writeHead:s=>status=s,end:()=>{}};assert.equal(await runtime.handle({url:'/api/copiloto/orders'},response),true);assert.equal(status,503);
 pass('publication expiry denies access without process restart');
 console.log('OPERATOR_PILOT_PASS '+passed);
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{try{await stop();}finally{fs.rmSync(root,{recursive:true,force:true});}});
