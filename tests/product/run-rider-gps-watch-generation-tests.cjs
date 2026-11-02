"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const {pathToFileURL}=require("node:url");
const source=path.join(__dirname,"../../src/entregas/ui/rider-mobile/gps-status.js");
const dir=fs.mkdtempSync(path.join(os.tmpdir(),"tata-rider-watch-fixture-"));
let passed=0;
async function check(name,run){await run();passed++;console.log("PASS "+name)}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function harness(createGpsStatus,config={}){
 const watches=new Map(),cleared=[],emitted=[],renders=[],deferred=[];
 let next=1;
 const geo={
  watchPosition(ok,error){const id=next++;watches.set(id,{ok,error});return id},
  clearWatch(id){cleared.push(id)},
 };
 const send=body=>{
  emitted.push(body);
  if(!config.hold) return Promise.resolve();
  return new Promise((resolve,reject)=>deferred.push({resolve,reject}));
 };
 const gps=createGpsStatus({geolocation:config.geo||geo,send,onRender:x=>renders.push(x),
  now:()=>new Date("2026-11-02T14:30:00Z")});
 const sample=()=>({coords:{latitude:-23.5,longitude:-46.6,accuracy:5,speed:null,heading:null},timestamp:Date.parse("2026-11-02T14:29:55Z")});
 return {watches,cleared,emitted,renders,deferred,gps,sample};
}
(async()=>{
 const dest=path.join(dir,"gps-status.mjs");
 fs.copyFileSync(source,dest);
 const {createGpsStatus}=await import(pathToFileURL(dest).href);
 await check("starts only with a trip",()=>{
  const h=harness(createGpsStatus);assert.equal(h.gps.start("").ok,false);
  assert.equal(h.watches.size,0);assert.equal(h.gps.start("A").ok,true);
  assert.equal(h.gps.state().trip_id,"A");assert.equal(h.gps.state().running,true);
 });
 await check("old A position never gets assigned to B",async()=>{
  const h=harness(createGpsStatus);
  h.gps.start("A");const a=h.watches.get(1);
  h.gps.start("B");const b=h.watches.get(2);
  a.ok(h.sample());assert.equal(h.emitted.length,0);assert.equal(h.gps.state().freshness,"unavailable");
  b.ok(h.sample());assert.equal(h.emitted.length,1);assert.equal(h.emitted[0].trip_id,"B");
 });
 await check("old error never contaminates next trip",()=>{
  const h=harness(createGpsStatus);h.gps.start("A");const a=h.watches.get(1);
  h.gps.start("B");a.error({code:1});
  assert.equal(h.gps.state().trip_id,"B");assert.notEqual(h.gps.state().freshness,"permission_denied");
 });
 await check("callbacks after STOP cannot publish",()=>{
  const h=harness(createGpsStatus);h.gps.start("A");const a=h.watches.get(1);h.gps.stop();
  a.ok(h.sample());a.error({code:1});
  assert.equal(h.emitted.length,0);assert.equal(h.gps.state().trip_id,null);
  assert.equal(h.gps.state().pending_sync,0);assert.deepEqual(h.cleared,[1]);
 });
 await check("same reused trip number has a different generation",()=>{
  const h=harness(createGpsStatus);h.gps.start("A");const a=h.watches.get(1);
  h.gps.stop();h.gps.start("A");const newer=h.watches.get(2);
  a.ok(h.sample());assert.equal(h.emitted.length,0);
  newer.ok(h.sample());assert.equal(h.emitted.length,1);
 });
 await check("late successful send from A does not decrement B pending",async()=>{
  const h=harness(createGpsStatus,{hold:true});h.gps.start("A");h.watches.get(1).ok(h.sample());
  assert.equal(h.gps.state().pending_sync,1);
  h.gps.start("B");h.watches.get(2).ok(h.sample());
  assert.equal(h.gps.state().pending_sync,1);
  h.deferred[0].resolve();await flush();
  assert.equal(h.gps.state().pending_sync,1);
  h.deferred[1].resolve();await flush();
  assert.equal(h.gps.state().pending_sync,0);
 });
 await check("late rejection from A does not redraw B or alter freshness",async()=>{
  const h=harness(createGpsStatus,{hold:true});h.gps.start("A");h.watches.get(1).ok(h.sample());
  h.gps.start("B");const renders=h.renders.length;
  h.deferred[0].reject(new Error("old network failure"));await flush();
  assert.equal(h.renders.length,renders);assert.equal(h.gps.state().trip_id,"B");
 });
 await check("late success after stop does not redraw stopped screen",async()=>{
  const h=harness(createGpsStatus,{hold:true});h.gps.start("A");h.watches.get(1).ok(h.sample());
  h.gps.stop();const renders=h.renders.length;
  h.deferred[0].resolve();await flush();
  assert.equal(h.renders.length,renders);
  assert.equal(h.gps.state().pending_sync,0);
 });
 await check("repeated start same trip does not duplicate watcher",()=>{
  const h=harness(createGpsStatus);h.gps.start("A");h.gps.start("A");
  assert.equal(h.watches.size,1);assert.deepEqual(h.cleared,[]);
 });
 await check("startup exception never leaves false active trip",()=>{
  const h=harness(createGpsStatus,{geo:{watchPosition(){throw Error("denied")},clearWatch(){}}});
  const r=h.gps.start("A");assert.equal(r.ok,false);assert.equal(r.error,"watch_start_failed");
  assert.equal(h.gps.state().running,false);assert.equal(h.gps.state().trip_id,null);
 });
 await check("stop then start cancels old error and accuracy",()=>{
  const h=harness(createGpsStatus);h.gps.start("A");const a=h.watches.get(1);
  a.ok(h.sample());assert.equal(h.gps.state().accuracy_m,5);
  h.gps.stop();h.gps.start("B");assert.equal(h.gps.state().accuracy_m,null);
  a.error({code:1});assert.equal(h.gps.state().error,null);
 });
 console.log("RIDER_GPS_WATCH_GENERATION_PASS "+passed+"/"+passed);
})().catch(e=>{console.error("RIDER_GPS_WATCH_GENERATION_FAIL",e?.stack||e);process.exitCode=1})
 .finally(()=>fs.rmSync(dir,{recursive:true,force:true}));
