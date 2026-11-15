'use strict';
const {test}=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');const {runRuntime}=require('../../runtime/reader-v3/run.cjs'),{fixture}=require('./fixture.cjs'),S=require('../../runtime/reader-v3/store.cjs');
function setup(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'v3-runtime-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const f=fixture();let closed=0,queries=0;const source={dead:false,discover:async()=>{queries++;return [f.headerRows[0]];},capture:async()=>f,close:()=>closed++};return {root,source,closed:()=>closed,queries:()=>queries,opts:{cfg:{root,from:'2026-11-15T00:00:00'},service:()=>({turno:'ALMOCO',versao:'LAB'}),clock:()=>new Date('2026-11-15T15:01:00Z')}};}
test('runtime publishes health and projection then releases all owned resources',async t=>{const x=setup(t);let ticks=0;await runRuntime({...x.opts,sourceFactory:()=>x.source,wait:async()=>{ticks++;},shouldStop:()=>ticks===1});a.equal(S.read(path.join(x.root,'health.json')).state,'HEALTHY');a.equal(S.read(path.join(x.root,'projection/consumer.json')).seq,1);a.equal(x.closed(),1);a.equal(fs.existsSync(path.join(x.root,'watcher.lock')),false);a.equal(fs.existsSync(path.join(x.root,'projection/consumer.lock')),false);});
test('runtime constructor failure closes SQL process and releases watcher ownership',async t=>{const x=setup(t);fs.mkdirSync(path.join(x.root,'projection'));fs.writeFileSync(path.join(x.root,'projection/consumer.json'),'{');await a.rejects(runRuntime({...x.opts,sourceFactory:()=>x.source}));a.equal(x.closed(),1);a.equal(fs.existsSync(path.join(x.root,'watcher.lock')),false);});
test('dead SQL process is replaced once; failure remains visible and previous data stays held',async t=>{const x=setup(t);let made=0,ticks=0;const dead={dead:true,discover:async()=>{throw Error('SQL_PROCESS_EXITED');},close:()=>{}};await runRuntime({...x.opts,sourceFactory:()=>++made===1?dead:x.source,wait:async()=>{ticks++;},shouldStop:()=>ticks===1});a.equal(made,2);a.equal(S.read(path.join(x.root,'health.json')).state,'SQL_PROCESS_EXITED');a.equal(S.read(path.join(x.root,'projection/source-status.json')).failures,1);a.equal(x.closed(),1);});

test('embedded runtime preserves the legacy process signal handlers during operation',async t=>{
 const x=setup(t);const signals=['SIGTERM','SIGINT'];const before=signals.map(name=>process.listeners(name));let finished=false;
 await runRuntime({...x.opts,sourceFactory:()=>x.source,shouldStop:()=>finished,wait:async()=>{
  a.deepEqual(signals.map(name=>process.listeners(name)),before);
  finished=true;
 }});
});
