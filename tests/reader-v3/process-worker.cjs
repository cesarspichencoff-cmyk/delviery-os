'use strict';
// Disposable fixture processes only; never invokes SQL or a service.
const {Watcher,Consumer}=require('../../runtime/reader-v3/engine.cjs');
const {fixture}=require('./fixture.cjs');const {project}=require('../../runtime/reader-v3/projection.cjs');
const path=require('node:path');const [root,mode,point]=process.argv.slice(2),f=fixture();
const kill=p=>{if(p===point)process.kill(process.pid,'SIGKILL');};
(async()=>{
 if(mode==='watcher'){const w=new Watcher({root,from:'2026-11-15T00:00:00',clock:()=>new Date('2026-11-15T15:01:00Z'),service:()=>({turno:'ALMOCO',versao:'LAB'}),fault:kill,source:{async discover(){return [f.headerRows[0]];},async capture(){return f;}}});await w.tick();w.close();}
 else if(mode==='consumer'){const c=new Consumer({root:path.join(root,'projection'),sourceRoot:root,clock:()=>new Date('2026-11-15T15:01:00Z'),project,fault:kill});c.tick();c.close();}
 else if(mode==='lock'){const S=require('../../runtime/reader-v3/store.cjs');S.lock(root,'watcher');process.send('locked');setInterval(()=>{},1000);}
})().catch(()=>{process.exitCode=2;});
