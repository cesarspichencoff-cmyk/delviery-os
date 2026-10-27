'use strict';
// Synthetic provider/registry. Proves sequencing and denials, never real identity.
const assert=require('node:assert/strict');
const {createOperatorReadAuthority:create}=require('../../dist/src/platform/auth/operator-read-authority.js');
let passed=0;
function setup(){let time=1000,reads=0,lookups=0,verifications=0;
 const identity={issuer:'https://idp.invalid',audience:'deliveryos-test',subject:'SYNTHETIC_OPERATOR',authenticatedAtMs:900,expiresAtMs:2000};
 const grant={issuer:identity.issuer,subject:identity.subject,unitId:'ITAIM',role:'gerente',active:true,approvalRef:'SYNTHETIC_APPROVAL',expiresAtMs:2000};
 const d={issuer:identity.issuer,audience:identity.audience,unitId:'ITAIM',now:()=>time,
 verifyIdentity:async()=>{verifications++;return identity;},lookupGrant:async()=>{lookups++;return grant;},read:async unit=>{reads++;return {unit};}};
 return {identity,grant,d,run:()=>create(d),setTime:t=>time=t,counts:()=>({reads,lookups,verifications})};}
async function test(name,fn){await fn();passed++;console.log('PASS',name);}
(async()=>{
 await test('authorized scoped read follows provider and registry',async()=>{const x=setup();assert.equal((await x.run()('SYNTHETIC','ITAIM')).status,200);assert.deepEqual(x.counts(),{reads:1,lookups:1,verifications:1});});
 await test('missing credential or wrong unit never opens source',async()=>{const x=setup();assert.equal((await x.run()(null,'ITAIM')).status,401);assert.equal((await x.run()('x','OTHER')).status,403);assert.equal((await x.run()('x',['ITAIM','OTHER'])).status,403);assert.deepEqual(x.counts(),{reads:0,lookups:0,verifications:0});});
 await test('wrong issuer/audience and invalid timestamps denied before registry',async()=>{for(const patch of [{issuer:'OTHER'},{audience:'OTHER'},{subject:''},{authenticatedAtMs:1001},{expiresAtMs:1000},{expiresAtMs:NaN}]){const x=setup();Object.assign(x.identity,patch);assert.equal((await x.run()('x','ITAIM')).status,401);assert.equal(x.counts().lookups,0);assert.equal(x.counts().reads,0);}});
 await test('active scoped grant with permitted role and approval is mandatory',async()=>{for(const patch of [{active:false},{unitId:'OTHER'},{issuer:'OTHER'},{subject:'OTHER'},{role:'motoboy'},{approvalRef:''},{expiresAtMs:1000}]){const x=setup();Object.assign(x.grant,patch);assert.equal((await x.run()('x','ITAIM')).status,403);assert.equal(x.counts().reads,0);}});
 await test('revocation is checked again on next read, no cached grant',async()=>{const x=setup(),run=x.run();assert.equal((await run('x','ITAIM')).status,200);x.grant.active=false;assert.equal((await run('x','ITAIM')).status,403);assert.equal(x.counts().reads,1);assert.equal(x.counts().lookups,2);});
 await test('identity expires during registry lookup',async()=>{const x=setup();x.d.lookupGrant=async()=>{x.setTime(2000);return x.grant;};assert.equal((await x.run()('x','ITAIM')).status,401);assert.equal(x.counts().reads,0);});
 await test('provider and registry outages fail closed without private errors',async()=>{for(const name of ['verifyIdentity','lookupGrant']){const x=setup();x.d[name]=async()=>{throw Error('PRIVATE_SENTINEL');};const r=await x.run()('x','ITAIM');assert.equal(r.status,503);assert(!JSON.stringify(r).includes('PRIVATE_SENTINEL'));assert.equal(x.counts().reads,0);}});
 await test('source failure never returns stale data',async()=>{const x=setup();x.d.read=async()=>{throw Error('PRIVATE_ORDER');};const r=await x.run()('x','ITAIM');assert.equal(r.status,503);assert.equal(r.data,null);assert(!JSON.stringify(r).includes('PRIVATE_ORDER'));});
 await test('mutating provider result while registry awaits cannot change verified subject',async()=>{const x=setup();x.d.lookupGrant=async()=>{x.identity.subject='OTHER';return {...x.grant,subject:'OTHER'};};assert.equal((await x.run()('x','ITAIM')).status,403);assert.equal(x.counts().reads,0);});
 console.log('OPERATOR_READ_AUTHORITY_PASS '+passed);
})().catch(e=>{console.error(e);process.exitCode=1;});
