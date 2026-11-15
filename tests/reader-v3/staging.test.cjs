'use strict';
const {test}=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const {prepare,sha}=require('../../runtime/reader-v3/prepare-shadow.cjs');
function setup(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'v3-stage-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const readerRoot=path.join(root,'reader'),legacyFile=path.join(root,'legacy.cjs');fs.mkdirSync(readerRoot);fs.mkdirSync(path.join(readerRoot,'shadow'));const bytes=Buffer.from("'use strict';\nlet stopped = false;\nprocess.stdout.write('LEGACY_OK\\n');\n");fs.writeFileSync(legacyFile,bytes);return {repo:path.resolve(__dirname,'../..'),legacyFile,output:path.join(root,'stage'),readerRoot,productRoot:root,from:'2026-11-15T00:00:00',expectedLegacySha:sha(bytes)};}
test('offline staging pins all bytes, retains legacy exactly and leaves approval false',t=>{const x=setup(t),before=fs.readFileSync(x.legacyFile),m=prepare(x);a.equal(m.approval,'NOT_GRANTED');for(const f of m.files)a.equal(sha(fs.readFileSync(path.join(x.output,f.path))),f.sha256);const candidate=fs.readFileSync(path.join(x.output,'live_shadow_consumer_loop_v1.cjs'));a.ok(candidate.subarray(0,before.length).equals(before));a.equal(JSON.parse(fs.readFileSync(path.join(x.output,'candidate/shadow-config.json'))).productionApproved,false);a.deepEqual(fs.readdirSync(path.join(x.readerRoot,'shadow')),[]);a.equal(sha(fs.readFileSync(x.legacyFile)),x.expectedLegacySha);});
test('staging rejects changed legacy, repeated output and production directory',t=>{const x=setup(t);a.throws(()=>prepare({...x,expectedLegacySha:'0'.repeat(64)}),/SHA/);a.throws(()=>prepare({...x,output:path.join(x.readerRoot,'shadow','anything')}),/FORBIDDEN/);prepare(x);a.throws(()=>prepare(x),/NEW_STAGING/);});
test('embedded sidecar approval failure leaves legacy process successful',t=>{const x=setup(t);prepare(x);const target=path.join(x.readerRoot,'shadow','reader-v3-candidate');fs.cpSync(path.join(x.output,'candidate'),target,{recursive:true});const r=cp.spawnSync(process.execPath,[path.join(x.output,'live_shadow_consumer_loop_v1.cjs')],{windowsHide:true,encoding:'utf8',timeout:5000});a.equal(r.status,0);a.match(r.stdout,/LEGACY_OK/);a.match(r.stderr,/READER_V3_SHADOW_HELD/);a.equal(fs.existsSync(path.join(x.readerRoot,'state')),false);});

test('the appended sidecar exits with the legacy loop and the original file can be restored',t=>{
 const x=setup(t);
 const original=Buffer.from("'use strict';\nlet stopped = false;\nsetTimeout(()=>{stopped=true;},100);\n");
 fs.writeFileSync(x.legacyFile,original);x.expectedLegacySha=sha(original);
 const manifest=prepare(x),active=path.join(x.readerRoot,'shadow','live_shadow_consumer_loop_v1.cjs');
 const target=manifest.target,env={...process.env};
 fs.cpSync(path.join(x.output,'candidate'),target,{recursive:true});
 const runner=path.join(target,'runtime','reader-v3','run.cjs');
 // Substitute only the SQL-dependent runtime in this offline lifecycle fixture.
 fs.writeFileSync(runner,`exports.main=async(_, {shouldStop})=>{
  if(shouldStop())throw Error('LEGACY_STOPPED_EARLY');
  while(!shouldStop())await new Promise(r=>setTimeout(r,10));
  process.stdout.write('SHADOW_STOPPED\\n');
 };`);
 const backup=path.join(x.output,'legacy-original.cjs');
 fs.copyFileSync(x.legacyFile,active);a.equal(sha(fs.readFileSync(active)),manifest.legacySha256);
 const staged=path.join(x.output,'live_shadow_consumer_loop_v1.cjs');
 const swap=source=>{const sibling=active+'.next';fs.copyFileSync(source,sibling);fs.renameSync(sibling,active);};
 swap(staged);
 const child=cp.spawnSync(process.execPath,[active],{windowsHide:true,env,encoding:'utf8',timeout:5000});
 a.equal(child.status,0,child.stderr);a.match(child.stdout,/SHADOW_STOPPED/);
 swap(backup);
 a.equal(sha(fs.readFileSync(active)),manifest.legacySha256);
 a.deepEqual(fs.readFileSync(active),original);
});
