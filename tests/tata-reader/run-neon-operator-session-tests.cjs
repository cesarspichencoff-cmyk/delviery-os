'use strict';
const assert=require('node:assert/strict');
const {createNeonOperatorSessions:create,operatorCredential}=require('../../dist/src/platform/auth/neon-operator-session.js');
const {createOperatorReadAuthority:authority}=require('../../dist/src/platform/auth/operator-read-authority.js');
const origin='https://deliveryos.invalid',authBase='https://provider.invalid/auth',email='operator@example.invalid';
function fixture(){let time=Date.parse('2026-10-27T15:00:00Z'),approved=true,revoked=false,reads=0;const calls=[];
 const transport=async(url,init)=>{calls.push({url,init});assert(url.startsWith(authBase+'/'));assert.equal(init.redirect,'error');
  if(url.includes('/sign-in/'))return Response.json({ok:true},{headers:{'Set-Cookie':'__Secure-better-auth.session_token=PRIVATE_PROVIDER_TOKEN; HttpOnly; Secure; Path=/'}});
  if(url.includes('/get-session')){assert.equal(init.headers.Cookie,'__Secure-better-auth.session_token=PRIVATE_PROVIDER_TOKEN');assert(url.endsWith('disableCookieCache=true'));return Response.json(revoked?null:{user:{id:'SUBJECT',email},session:{userId:'SUBJECT',createdAt:'2026-10-27T14:00:00Z',expiresAt:'2026-10-28T15:00:00Z'}});}
  return Response.json({ok:true});};
 const cfg={authBase,appOrigin:origin,now:()=>time,approvedSubject:async()=>approved?'SUBJECT':null,fetchTransport:transport};
 const session=create(cfg);const read=authority({issuer:session.issuer,audience:session.audience,unitId:'ITAIM',now:cfg.now,verifyIdentity:session.verifyIdentity,lookupGrant:async()=>({issuer:session.issuer,subject:'SUBJECT',unitId:'ITAIM',role:'gerente',active:approved,approvalRef:'SYNTHETIC',expiresAtMs:time+60000}),read:async()=>{reads++;return {orders:['SYNTHETIC']};}});
 return {session,read,cfg,calls,setApproved:v=>approved=v,setRevoked:v=>revoked=v,advance:n=>time+=n,reads:()=>reads};}
async function login(x){const start=await x.session.begin(origin,email);assert.equal(start.status,200);const flow=start.setCookies[0].split(';')[0];const done=await x.session.complete(origin,flow,'123456');assert.equal(done.status,200);const cookie=done.setCookies[1].split(';')[0];return {flow,cookie,credential:operatorCredential(cookie),done};}
let n=0;async function test(name,fn){await fn();n++;console.log('PASS',name);}
(async()=>{
 await test('OTP -> provider session -> own cookie -> authorized order read',async()=>{const x=fixture(),l=await login(x);assert.equal((await x.read(l.credential,'ITAIM')).status,200);assert.equal(x.reads(),1);assert(l.done.setCookies[1].includes('HttpOnly; Secure; SameSite=Strict'));assert(!JSON.stringify(l.done).includes('PRIVATE_PROVIDER_TOKEN'));assert(!JSON.stringify(l.done).includes(email));});
 await test('wrong origin and unapproved account never send OTP',async()=>{const x=fixture();assert.equal((await x.session.begin('https://other.invalid',email)).status,403);x.setApproved(false);assert.equal((await x.session.begin(origin,email)).status,403);assert.equal(x.calls.length,0);});
 await test('no flow and duplicate cookie denied',async()=>{const x=fixture();assert.equal((await x.session.complete(origin,'','123456')).status,401);const l=await login(x);assert.equal(operatorCredential(l.cookie+'; '+l.cookie),null);assert.equal(await x.session.verifyIdentity('x'.repeat(64)),null);});
 await test('provider revocation stops next source read',async()=>{const x=fixture(),l=await login(x);x.setRevoked(true);assert.equal((await x.read(l.credential,'ITAIM')).status,401);assert.equal(x.reads(),0);});
 await test('operator approval removal stops next source read',async()=>{const x=fixture(),l=await login(x);x.setApproved(false);assert.equal((await x.read(l.credential,'ITAIM')).status,401);assert.equal(x.reads(),0);});
 await test('local expiry and restart reject old cookies',async()=>{const x=fixture(),l=await login(x);assert.equal(await create(x.cfg).verifyIdentity(l.credential),null);x.advance(600000);assert.equal(await x.session.verifyIdentity(l.credential),null);});
 await test('logout removes local session and refuses foreign origin',async()=>{const x=fixture(),l=await login(x);assert.equal(x.session.logout('https://other.invalid',l.cookie).status,403);assert.equal(x.session.logout(origin,l.cookie).status,200);assert.equal(await x.session.verifyIdentity(l.credential),null);});
 await test('consumed login flow cannot be reused',async()=>{const x=fixture(),l=await login(x);assert.equal((await x.session.complete(origin,l.flow,'123456')).status,401);});
 await test('OTP requests limited per approved address',async()=>{const x=fixture();for(let i=0;i<3;i++)assert.equal((await x.session.begin(origin,email)).status,200);assert.equal((await x.session.begin(origin,email)).status,429);assert.equal(x.calls.length,3);});
 await test('provider errors do not expose internal detail or session',async()=>{const x=fixture();x.cfg.fetchTransport=async()=>{throw Error('PRIVATE_SENTINEL');};const r=await create(x.cfg).begin(origin,email);assert.equal(r.status,503);assert(!JSON.stringify(r).includes('PRIVATE_SENTINEL'));});
 await test('HTTP endpoint and credentials embedded in URL refused',async()=>{const x=fixture();assert.throws(()=>create({...x.cfg,authBase:'http://provider.invalid/auth'}));assert.throws(()=>create({...x.cfg,authBase:'https://user:password@provider.invalid/auth'}));});
 await test('concurrent completion cannot duplicate session and logout cancels pending issuance',async()=>{
  const x=fixture(),original=x.cfg.fetchTransport;let release;let entered;
  const started=new Promise(r=>entered=r),gate=new Promise(r=>release=r);
  x.cfg.fetchTransport=async(url,init)=>{if(url.includes('/sign-in/')){entered();await gate;}return original(url,init);};
  const bridge=create(x.cfg),begin=await bridge.begin(origin,email),flow=begin.setCookies[0].split(';')[0];
  const pending=bridge.complete(origin,flow,'123456');await started;
  assert.equal((await bridge.complete(origin,flow,'123456')).status,401);
  bridge.logout(origin,flow);release();assert.equal((await pending).status,401);
 });
 await test('five failed code attempts exhaust the flow',async()=>{const x=fixture(),original=x.cfg.fetchTransport;
  x.cfg.fetchTransport=async(url,init)=>url.includes('/sign-in/')?Response.json({error:'PRIVATE'}, {status:401}):original(url,init);
  const bridge=create(x.cfg),begin=await bridge.begin(origin,email),flow=begin.setCookies[0].split(';')[0];
  for(let i=0;i<6;i++)assert.equal((await bridge.complete(origin,flow,'123456')).status,401);
 });
 await test('oversized provider body cannot issue a flow',async()=>{const x=fixture();x.cfg.fetchTransport=async()=>new Response('x'.repeat(65537));assert.equal((await create(x.cfg).begin(origin,email)).status,503);});
 await test('wrong provider subject cannot acquire local session',async()=>{const x=fixture(),original=x.cfg.fetchTransport;
  x.cfg.fetchTransport=async(url,init)=>{const r=await original(url,init);if(url.includes('/get-session')){const v=await r.json();v.user.id='OTHER';v.session.userId='OTHER';return Response.json(v);}return r;};
  const bridge=create(x.cfg),begin=await bridge.begin(origin,email);assert.equal((await bridge.complete(origin,begin.setCookies[0].split(';')[0],'123456')).status,403);
 });
 console.log('NEON_OPERATOR_SESSION_PASS '+n);
})().catch(e=>{console.error(e);process.exitCode=1;});
