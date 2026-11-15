'use strict';
// Candidate entry point only. Never registers a task/service or changes V2 configuration.
const fs=require('node:fs'),path=require('node:path');
const {Watcher,Consumer}=require('./engine.cjs');const {SqlSource}=require('./sql-client.cjs');const {project}=require('./projection.cjs');const S=require('./store.cjs');
async function main(){
 const configPath=process.argv[2];if(!configPath||!path.isAbsolute(configPath))throw Error('CONFIG_REQUIRED');
 const cfg=JSON.parse(fs.readFileSync(configPath,'utf8'));
 if(cfg.schema!=='deliveryos.reader-v3.shadow-config.v1'||cfg.mode!=='SHADOW_ONLY'||cfg.productionApproved!==true)throw Error('SUPERVISED_SHADOW_APPROVAL_REQUIRED');
 if(!path.isAbsolute(cfg.root)||!path.isAbsolute(cfg.readerRoot)||!path.isAbsolute(cfg.productRoot)||
  path.relative(cfg.readerRoot,cfg.root).split(path.sep).includes('..')||path.relative(cfg.readerRoot,cfg.root)!==path.join('state','reader-v3-shadow'))throw Error('ISOLATED_V3_ROOT_REQUIRED');
 const {lerPolitica,turnoDe}=require(path.join(cfg.productRoot,'dist/src/platform/leitura/pedidos-reais-do-reader.js'));
 const service=opened=>{const p=lerPolitica(cfg.readerRoot);return {turno:turnoDe(p,opened),versao:p?.versao??null};};
 let source=new SqlSource();
 const proxy={discover:(...a)=>source.discover(...a),capture:(...a)=>source.capture(...a)};
 const watcher=new Watcher({root:cfg.root,source:proxy,from:cfg.from,service});
 const consumer=new Consumer({root:path.join(cfg.root,'projection'),sourceRoot:cfg.root,project});
 let stop=false;for(const sig of ['SIGTERM','SIGINT'])process.on(sig,()=>{stop=true;});
 try{while(!stop){let result,state='HEALTHY';try{result=await watcher.tick();}catch(e){state=/^[A-Z0-9_]+$/.test(e.message)?e.message:'CAPTURE_FAILED';if(source.dead){source.close();source=new SqlSource();}}
  consumer.tick(32);
  S.atomic(path.join(cfg.root,'health.json'),{schema:1,at:new Date().toISOString(),state,metrics:result??null,seq:watcher.state.seq,consumerSeq:consumer.state.seq,mode:'SHADOW_ONLY',effects:{print:false,database_write:false}});
  await new Promise(r=>setTimeout(r,5000));}
 }finally{source.close();consumer.close();watcher.close();}
}
if(require.main===module)main().catch(e=>{console.error(/^[A-Z0-9_]+$/.test(e.message)?e.message:'READER_V3_FAILED');process.exitCode=1;});
module.exports={main};
