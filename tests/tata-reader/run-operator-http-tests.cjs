'use strict';
// HTTPS loopback + synthetic provider + real file reader/motor. Never sends email.
const assert=require('node:assert/strict'),https=require('node:https'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const {createNeonOperatorSessions}=require('../../dist/src/platform/auth/neon-operator-session.js');
const {createOperatorHttp}=require('../../dist/src/platform/copiloto/operator-http.js');
const {readTataFileFeed}=require('../../runtime/reporting/copiloto_tata_file_feed_v1.cjs');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'operator-http-')),dir=path.join(root,'state','reader-events-v1');
fs.mkdirSync(dir,{recursive:true});
const authBase='https://provider.invalid/auth',email='operator@example.invalid',hash='a'.repeat(64);
let now=Date.parse('2026-10-27T15:02:00Z'),approved=true,granted=true,reads=0,providerCalls=0,origin,server,browser;
const file=path.join(dir,'C1_'+hash+'.json');
const event={schema:'deliveryos.tata-reader-stable-order-event.v1',snapshot_hash:hash,order_key:'LAB|01|V1|C1',observed_at:'2026-10-27T12:01:00-03:00',ready_for_downstream_shadow:true,blockers:[],service_resolution:{service:'LUNCH',evidence:'HUMAN_CONFIRMED_RULE',source_ref:'SYNTHETIC',blockers:[]},effects:{database_read:true,database_write:false,network_call:false,odhen_write:false,print:false,spooler_write:false,fiscal_action:false,sefaz_call:false,cutover:false},order:{CDFILIAL:'LAB',CDLOJA:'01',NRVENDAREST:'V1',NRCOMANDA:'C1',IDORGCMDVENDA:'DELIVERY',DTHRABERMESA:'2026-10-27T12:00:00-03:00',customer:'PRIVATE_CUSTOMER_SENTINEL',items:[{CDPRODUTO:'P1',QTPRODCOMVEN:'2',observation:'PRIVATE_CUSTOMER_SENTINEL'}]}};
const write=()=>fs.writeFileSync(file,JSON.stringify(event));write();
fs.writeFileSync(path.join(root,'state','reader-watch-checkpoint-v1.json'),JSON.stringify({schema:'deliveryos.tata-reader-continuous-checkpoint.v1',bootstrap_complete:true,entries:[{order_key:event.order_key,snapshot_hash:hash,emitted_hash:hash,stable_count:2}]}));
const scope={unitId:'ITAIM',sourceUnitId:'LAB',sourceStoreId:'01',mappingEvidenceRef:'SYNTHETIC',sourceMode:'simulated'};
const assetsDir=path.resolve(__dirname,'../../src/entregas/ui/copiloto/pedidos');
const assets={html:fs.readFileSync(path.join(assetsDir,'index.html'),'utf8'),js:fs.readFileSync(path.join(assetsDir,'app.js'),'utf8'),css:fs.readFileSync(path.join(assetsDir,'app.css'),'utf8')};
let passed=0;
async function test(label,fn){await fn();passed++;console.log('PASS',label);}
function request(route,options={}){return new Promise((resolve,reject)=>{
 const headers={...(options.method==='POST'?{Origin:origin,'Content-Type':'application/json'}:{}),...options.headers};
 const req=https.request(origin+route,{method:options.method||'GET',headers,rejectUnauthorized:false},res=>{let text='';res.setEncoding('utf8');res.on('data',chunk=>text+=chunk);res.on('end',()=>{let body;try{body=JSON.parse(text);}catch{}resolve({status:res.statusCode,headers:res.headers,text,body});});});
 req.on('error',reject);req.setTimeout(10000,()=>req.destroy(Error('TEST_TIMEOUT')));req.end(options.body===undefined?undefined:JSON.stringify(options.body));
});}
const post=(route,body,headers={})=>request(route,{method:'POST',body,headers});
async function login(){const begin=await post('/api/operator/login/begin',{email});assert.equal(begin.status,200);const flow=begin.headers['set-cookie'][0].split(';')[0];const done=await post('/api/operator/login/complete',{otp:'123456'},{Cookie:flow});assert.equal(done.status,200);return {flow,done,cookie:done.headers['set-cookie'][1].split(';')[0]};}
(async()=>{
 execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',path.join(root,'key.pem'),'-out',path.join(root,'cert.pem'),'-days','1','-subj','/CN=localhost'],{stdio:'ignore'});
 let handler;server=https.createServer({key:fs.readFileSync(path.join(root,'key.pem')),cert:fs.readFileSync(path.join(root,'cert.pem'))},(req,res)=>handler(req,res));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='https://127.0.0.1:'+server.address().port;
 const sessions=createNeonOperatorSessions({authBase,appOrigin:origin,now:()=>now,approvedSubject:async e=>approved&&e===email?'SUBJECT':null,fetchTransport:async(url,init)=>{
  providerCalls++;assert(url.startsWith(authBase+'/'));
  if(url.includes('/sign-in/')){if(JSON.parse(init.body).otp!=='123456')return Response.json({error:'PRIVATE'}, {status:401});return Response.json({ok:true},{headers:{'Set-Cookie':'__Secure-better-auth.session_token=PRIVATE_PROVIDER_TOKEN; HttpOnly; Secure; Path=/'}});}
  if(url.includes('/get-session'))return Response.json({user:{id:'SUBJECT',email},session:{userId:'SUBJECT',createdAt:'2026-10-27T14:00:00Z',expiresAt:'2026-10-28T15:00:00Z'}});
  return Response.json({ok:true});
 }});
 handler=createOperatorHttp({sessions,now:()=>now,assets,lookupGrant:async()=>({issuer:sessions.issuer,subject:'SUBJECT',unitId:'ITAIM',role:'gerente',active:granted,approvalRef:'SYNTHETIC',expiresAtMs:now+60000}),readFeed:async()=>{reads++;return readTataFileFeed({root,scope,now:new Date(now).toISOString(),maxAgeMs:120000});}});
 await test('HTTPS assets and authentication boundary',async()=>{
  const page=await request('/copiloto/pedidos/');assert.equal(page.status,200);assert(page.text.includes('Acesso individual'));assert.equal(page.headers['cache-control'],'no-store');assert(page.headers['content-security-policy'].includes("frame-ancestors 'none'"));
  assert.equal((await request('/api/copiloto/orders',{headers:{'X-Operator-Role':'gerente','X-Unit':'ITAIM',Authorization:'Bearer shared-key'}})).status,401);assert.equal(reads,0);
 });
 await test('foreign/missing origins, oversized body, methods and unit query denied before provider',async()=>{
  const before=providerCalls;
  assert.equal((await post('/api/operator/login/begin',{email},{Origin:'https://other.invalid'})).status,403);
  assert.equal((await post('/api/operator/login/begin',{email},{Origin:''})).status,403);
  assert.equal((await post('/api/operator/login/begin',{email:'x'.repeat(3000)})).status,400);
  assert.equal((await post('/api/operator/login/begin',[],{})).status,400);
  assert.equal((await post('/api/operator/login/begin',{email},{'Content-Type':'text/plain'})).status,415);
  assert.equal((await request('/api/operator/logout')).status,405);
  assert.equal((await request('/api/copiloto/orders?unit=OTHER')).status,404);
  assert.equal((await request('/copiloto/pedidos/../private.json')).status,404);
  assert.equal((await request('/api/copiloto/orders',{headers:{Host:'evil.invalid'}})).status,403);
  assert.equal(providerCalls,before);
 });
 let session;
 await test('OTP -> HttpOnly cookie -> checkpoint file -> TATA motor -> HTTPS orders',async()=>{
  session=await login();assert(!session.done.text.includes('setCookies'));assert(!session.done.text.includes('PRIVATE'));assert(session.done.headers['set-cookie'][1].includes('HttpOnly; Secure; SameSite=Strict'));
  const r=await request('/api/copiloto/orders',{headers:{Cookie:session.cookie}});assert.equal(r.status,200);assert.equal(r.body.data.view.orders[0].items[0].quantity,2);assert.equal(r.body.data.view.orders[0].source_mode,'simulated');assert.equal(r.body.data.operational_order_total,null);assert(!r.text.includes('PRIVATE_'));assert.equal(reads,1);
 });
 await test('revoked grant and duplicate cookie prevent source reads',async()=>{
  const before=reads;granted=false;assert.equal((await request('/api/copiloto/orders',{headers:{Cookie:session.cookie}})).status,403);granted=true;
  assert.equal((await request('/api/copiloto/orders',{headers:{Cookie:session.cookie+'; '+session.cookie}})).status,401);assert.equal(reads,before);
 });
 await test('blocked and old source do not become active orders',async()=>{
  event.blockers=['PRIVATE_SOURCE_SENTINEL'];write();let r=await request('/api/copiloto/orders',{headers:{Cookie:session.cookie}});assert.equal(r.body.data.state,'unavailable');assert.equal(r.body.data.view,null);assert(!r.text.includes('PRIVATE'));
  event.blockers=[];write();now+=180000;r=await request('/api/copiloto/orders',{headers:{Cookie:session.cookie}});assert.equal(r.body.data.state,'no_evidence');assert.equal(r.body.data.operational_order_total,null);
 });
 await test('logout destroys session and clears both cookies without disclosing tokens',async()=>{
  const r=await post('/api/operator/logout',{}, {Cookie:session.cookie});assert.equal(r.status,200);assert.equal(r.headers['set-cookie'].length,2);assert(r.headers['set-cookie'].every(c=>c.includes('Max-Age=0')));assert(!r.text.includes('setCookies'));
  assert.equal((await request('/api/copiloto/orders',{headers:{Cookie:session.cookie}})).status,401);
 });
 if(process.argv.includes('--browser')){
  browser=await require('playwright').chromium.launch({headless:true});
  for(const width of [390,1440])await test('browser '+width+' login, source loss, revoke, logout and no persistent credentials',async()=>{
   // Advancing the fixture clock clears per-address limits without changing the real machine clock.
   now+=600000;event.observed_at=new Date(now-1000).toISOString();write();approved=true;granted=true;
   const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width,height:900}}),page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
   try{
    await page.goto(origin+'/copiloto/pedidos/');await page.locator('#email').waitFor({state:'visible'});
    await page.locator('#email').fill(email);await page.getByRole('button',{name:'Receber código'}).click();await page.locator('#otp').fill('123456');await page.getByRole('button',{name:'Entrar',exact:true}).click();
    await page.getByRole('heading',{name:'Comanda C1'}).waitFor();assert(await page.getByText('SIMULADO',{exact:true}).isVisible());assert(await page.getByText('2 × produto P1',{exact:true}).isVisible());
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    assert.equal(await page.evaluate(()=>document.cookie), '');assert.equal(await page.evaluate(()=>localStorage.length+sessionStorage.length),0);
    const cookies=await context.cookies();assert(cookies.some(c=>c.name==='__Host-deliveryos_operator'&&c.httpOnly&&c.secure&&c.sameSite==='Strict'));assert(!cookies.some(c=>c.value.includes('PRIVATE')));
    event.blockers=['BLOCKED'];write();await page.getByRole('button',{name:'Atualizar leitura'}).click();await page.getByText('Fonte indisponível.',{exact:false}).waitFor();assert.equal(await page.locator('article').count(),0);
    event.blockers=[];write();await page.getByRole('button',{name:'Atualizar leitura'}).click();await page.getByRole('heading',{name:'Comanda C1'}).waitFor();
    granted=false;await page.getByRole('button',{name:'Atualizar leitura'}).click();await page.getByText('Acesso não autorizado para esta unidade.',{exact:true}).waitFor();assert.equal(await page.locator('article').count(),0);
    granted=true;await page.getByRole('button',{name:'Atualizar leitura'}).click();await page.getByRole('heading',{name:'Comanda C1'}).waitFor();
    // Hold a successful old read until after logout; it must never repopulate the screen.
    let entered,release,finished;
    const started=new Promise(r=>entered=r),gate=new Promise(r=>release=r),settled=new Promise(r=>finished=r);
    await page.route('**/api/copiloto/orders',async route=>{try{const response=await route.fetch();entered();await gate;await route.fulfill({response});}catch{}finally{finished();}},{times:1});
    await page.getByRole('button',{name:'Atualizar leitura'}).click();await started;
    await page.getByRole('button',{name:'Sair',exact:true}).click();await page.getByText('Acesso encerrado neste dispositivo.',{exact:true}).waitFor();
    release();await settled;assert.equal(await page.locator('article').count(),0);
    await page.reload();await page.locator('#email').waitFor({state:'visible'});assert.equal(await page.locator('article').count(),0);assert.deepEqual(errors,[]);
   }finally{await context.close();}
  });
 }
 console.log('OPERATOR_HTTPS_PASS '+passed+(browser?' WITH_BROWSER':' HTTP_ONLY'));
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}fs.rmSync(root,{recursive:true,force:true});});
