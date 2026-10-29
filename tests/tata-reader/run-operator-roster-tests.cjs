'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createOperatorFileRoster:create}=require('../../dist/src/platform/auth/operator-file-roster.js');
const {createOperatorReadAuthority:authority}=require('../../dist/src/platform/auth/operator-read-authority.js');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'operator-roster-')),file=path.join(root,'roster.json');
const issuer='https://provider.invalid/auth',now=Date.parse('2026-10-27T15:00:00Z');
const entry=()=>({email:'operator@example.invalid',subject:'TEST_SUBJECT',unitId:'ITAIM',role:'gerente',active:true,approvalRef:'SYNTHETIC_APPROVAL_ONLY',expiresAt:'2026-10-28T15:00:00.000Z'});
const write=entries=>fs.writeFileSync(file,JSON.stringify({schema:'deliveryos.operator-roster.v1',entries}));
const roster=create({file,issuer,now:()=>now});let count=0;
async function test(name,fn){write([entry()]);await fn();count++;console.log('PASS',name);}
(async()=>{
 await test('approved existing subject and unit grant from server file',async()=>{assert.equal(await roster.approvedSubject(entry().email),'TEST_SUBJECT');const g=await roster.lookupGrant(issuer,'TEST_SUBJECT','ITAIM');assert.equal(g.role,'gerente');assert.equal(g.approvalRef,'SYNTHETIC_APPROVAL_ONLY');assert.equal(await roster.approvedSubject('other@example.invalid'),null);});
 await test('removal, revocation and expiry observed without restart',async()=>{write([]);assert.equal(await roster.approvedSubject(entry().email),null);for(const change of [{active:false},{expiresAt:new Date(now).toISOString()}]){write([{...entry(),...change}]);assert.equal(await roster.approvedSubject(entry().email),null);assert.equal(await roster.lookupGrant(issuer,'TEST_SUBJECT','ITAIM'),null);}});
 await test('wrong issuer or unit cannot inherit a grant',async()=>{assert.equal(await roster.lookupGrant('other','TEST_SUBJECT','ITAIM'),null);assert.equal(await roster.lookupGrant(issuer,'TEST_SUBJECT','MOOCA'),null);});
 await test('duplicate subject or email invalidates whole registry',async()=>{for(const e of [entry(),{...entry(),email:'other@example.invalid'},{...entry(),subject:'OTHER'}]){write([entry(),e]);await assert.rejects(roster.approvedSubject(entry().email));}});
 await test('invalid role, unit, approval and dates never create fallback access',async()=>{for(const c of [{role:'admin'},{unitId:'MOOCA'},{approvalRef:''},{active:'true'},{email:'OPERATOR@example.invalid'},{expiresAt:'2026-02-30T15:00:00.000Z'}]){write([{...entry(),...c}]);await assert.rejects(roster.approvedSubject(entry().email));}});
 await test('missing, oversized and malformed file fail closed',async()=>{fs.unlinkSync(file);await assert.rejects(roster.approvedSubject(entry().email));fs.writeFileSync(file,'x'.repeat(65537));await assert.rejects(roster.approvedSubject(entry().email));fs.writeFileSync(file,'{');await assert.rejects(roster.approvedSubject(entry().email));});
 await test('symbolic link is not an approval source',async()=>{const link=path.join(root,'link.json');fs.symlinkSync(file,link);await assert.rejects(create({file:link,issuer,now:()=>now}).approvedSubject(entry().email));});
 await test('source read stops on live revocation and registry corruption',async()=>{let reads=0;const read=authority({issuer,audience:'test',unitId:'ITAIM',now:()=>now,verifyIdentity:async()=>({issuer,audience:'test',subject:'TEST_SUBJECT',authenticatedAtMs:now-1000,expiresAtMs:now+60000}),lookupGrant:roster.lookupGrant,read:async()=>++reads});assert.equal((await read('credential','ITAIM')).status,200);write([{...entry(),active:false}]);assert.equal((await read('credential','ITAIM')).status,403);fs.writeFileSync(file,'INVALID');assert.equal((await read('credential','ITAIM')).status,503);assert.equal(reads,1);});
 console.log('OPERATOR_FILE_ROSTER_PASS '+count);
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>fs.rmSync(root,{recursive:true,force:true}));
