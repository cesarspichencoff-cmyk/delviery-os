'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),net=require('node:net'),assert=require('node:assert/strict');
const root=__dirname,app=path.join(root,'pg-proof-app'),bin=path.join(root,'postgres16/bin');
async function main(){
 await new Promise((resolve,reject)=>{const s=net.createServer();s.once('error',reject);s.listen(55437,'127.0.0.1',()=>s.close(resolve));});
 const work=fs.mkdtempSync(path.join(root,'pg-proof-node-')),data=path.join(work,'data');let started=false;
 function ctl(exe,args,label){
   const out=fs.openSync(path.join(work,label+'.out.log'),'a'),err=fs.openSync(path.join(work,label+'.err.log'),'a');
   try {const r=cp.spawnSync(path.join(bin,exe),args,{stdio:['ignore',out,err],timeout:60000,windowsHide:true});assert.equal(r.status,0,'OWN_EPHEMERAL_PROCESS_FAILED');}
   finally {fs.closeSync(out);fs.closeSync(err);}
 }
 try {
  ctl('initdb.exe',['-D',data,'-U','postgres','-A','trust','--locale=C','--no-instructions'],'initdb');
  ctl('pg_ctl.exe',['-D',data,'-l',path.join(work,'postgres.log'),'-o','-h 127.0.0.1 -p 55437','-w','start'],'start');started=true;
  const results=[];
  for(const file of ['run-storage-cutover-tests.js','run-postgres-server-cluster-tests.js']){
   const r=cp.spawnSync(process.execPath,[path.join(app,'dist/src/entregas/pilot',file)],{cwd:app,env:{...process.env,DELIVERYOS_PG_URL:'postgresql://postgres@127.0.0.1:55437/postgres'},encoding:'utf8',timeout:180000,maxBuffer:10485760,windowsHide:true});
   const log=(r.stdout||'')+(r.stderr||'');fs.writeFileSync(path.join(work,file+'.log'),log);
   assert.equal(r.status,0,'EPHEMERAL_SUITE_FAILED_INSPECT_PRIVATE_LOG');
   const result=log.split(/\r?\n/).find(x=>/^PILOT_(STORAGE_CUTOVER|POSTGRES_SERVER_CLUSTER): \d+\/\d+ PASS$/.test(x));
   assert(result,'SUITE_COMPLETION_MARKER_MISSING');results.push({suite:file,result});
  }
  const receipt={schema:'deliveryos.pg-ephemeral-proof.v1',observedAtUtc:new Date().toISOString(),scope:'SEPARATE_CLUSTER_55437_SYNTHETIC_ONLY',results,labDatabase55436Touched:false};
  fs.writeFileSync(path.join(root,'pg-ephemeral-proof.json'),JSON.stringify(receipt,null,2));console.log('PG_EPHEMERAL_PROOF_PASS',JSON.stringify(receipt));
 }finally{if(started)ctl('pg_ctl.exe',['-D',data,'-m','fast','-w','stop'],'stop');}
}
main().catch(()=>{console.error('PG_EPHEMERAL_PROOF_FAILED: inspect private logs; production untouched');process.exitCode=1});
