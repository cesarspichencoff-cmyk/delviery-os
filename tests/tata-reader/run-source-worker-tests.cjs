'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http');
const {createIsolatedTataReader:create}=require('../../dist/src/platform/auth/operator-source-worker.js');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'source-worker-'));
const workerDir=path.join(root,'runtime/reporting');fs.mkdirSync(workerDir,{recursive:true});
const worker=path.join(workerDir,'copiloto_tata_worker_v1.cjs');
const prefix="const {parentPort}=require('node:worker_threads');";
const cfg={appRoot:root,root,scope:{unitId:'ITAIM'},maxAgeMs:120000,timeoutMs:2500};
const write=body=>fs.writeFileSync(worker,prefix+body);
let server,passed=0;
async function test(name,fn){await fn();passed++;console.log('PASS',name);}
(async()=>{
 await test('busy reader does not queue requests and main HTTP responds during CPU work',async()=>{
  write("const until=Date.now()+700;while(Date.now()<until){};parentPort.postMessage({ok:true,data:{synthetic:true}});");
  const reader=create(cfg);let done=false;const pending=reader.read('2026-10-28T15:00:00Z').then(r=>{done=true;return r;});
  await assert.rejects(reader.read('2026-10-28T15:00:00Z'),/SOURCE_READER_BUSY/);
  server=http.createServer((req,res)=>res.end('health-ok'));await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const body=await new Promise((resolve,reject)=>{http.get('http://127.0.0.1:'+server.address().port,res=>{let s='';res.on('data',x=>s+=x);res.on('end',()=>resolve(s));}).on('error',reject);});
  assert.equal(body,'health-ok');assert.equal(done,false,'health must complete before source CPU work');assert.deepEqual(await pending,{synthetic:true});
  await new Promise(r=>server.close(r));server=null;
 });
 await test('timeout terminates worker and releases slot for a fresh successful read',async()=>{
  write('while(true){}');const reader=create({...cfg,timeoutMs:300});await assert.rejects(reader.read('now'),/SOURCE_READ_TIMEOUT/);
  write('parentPort.postMessage({ok:true,data:{fresh:true}});');assert.deepEqual(await reader.read('now'),{fresh:true});
 });
 await test('worker crash, premature exit and malformed reply fail without private details',async()=>{
  for(const body of ["throw Error('PRIVATE_SENTINEL');",'process.exit(0);',"parentPort.postMessage({ok:false,private:'PRIVATE_SENTINEL'});"]){write(body);await assert.rejects(create(cfg).read('now'),e=>/^SOURCE_WORKER_/.test(e.message)&&!e.message.includes('PRIVATE'));}
 });
 await test('source worker uses existing native reader and preserves unavailable source',async()=>{
  const reader=create({...cfg,appRoot:path.resolve(__dirname,'../..')});const result=await reader.read('2026-10-28T15:00:00Z');assert.equal(result.state,'unavailable');assert.equal(result.view,null);
 });
 console.log('SOURCE_WORKER_PASS '+passed);
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{server?.close();fs.rmSync(root,{recursive:true,force:true});});
