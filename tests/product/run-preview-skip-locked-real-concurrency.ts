/**
 * Stronger than SQL grammar or a single-client FOR UPDATE: prove SKIP LOCKED
 * really skips an independently locked table row without waiting.
 * This file is TEST-ONLY. Guard disallows any host except the runner's own
 * localhost PG16; owns CREATE/DROP of its unique disposable database.
 */
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { bancoVazio } from "../../src/platform/banco-isolado";
import { createPgClient, type PgSqlClient } from "../../src/platform/persistence/sql-client";

const url=(process.env.DELIVERYOS_PG_URL??"").trim();
if(!url){console.error("SKIP_LOCKED_REAL_CONCURRENCY_PG_REQUIRED");process.exit(78);}
const parsed=new URL(url);
if(
 process.env.Q026_ALLOW_ISOLATED_DB_PROBE!=="runner-owned-postgres16" ||
 !["127.0.0.1","localhost","::1"].includes(parsed.hostname) ||
 parsed.pathname!=="/postgres"
){
 console.error("SKIP_LOCKED_REAL_CONCURRENCY_RUNNER_ONLY");
 process.exit(79);
}
const deadline=1200;

async function oneCase(
 locker:PgSqlClient,skipper:PgSqlClient,lockedId:number
):Promise<{locked:number;skipped:number;unblocked:number;elapsed_ms:number;nowait_sqlstate:string}>{
 let release!:()=>void;
 let indicate!:()=>void;
 const gate=new Promise<void>(r=>{release=r});
 const acquired=new Promise<void>(r=>{indicate=r});
 const held=locker.transaction(async tx=>{
  const row=await tx.query<{id:number}>(
   "SELECT id FROM public.q026_skip_probe WHERE id=$1 FOR UPDATE",[lockedId]);
  assert.equal(row[0]?.id,lockedId);
  indicate();
  await gate;
 });
 try{
  await Promise.race([
   acquired,
   new Promise<never>((_,reject)=>setTimeout(()=>reject(
    new Error("SKIP_LOCKED_ACQUIRE_TIMEOUT")),5000))
  ]);
  // Positive proof of real row lock from a different connection.
  let nowaitError:unknown=null;
  try{
   await skipper.transaction(async tx=>tx.query(
    "SELECT id FROM public.q026_skip_probe WHERE id=$1 FOR UPDATE NOWAIT",[lockedId]));
  }catch(e){nowaitError=e}
  assert.equal((nowaitError as {code?:string}|null)?.code,"55P03",
   "blocking transaction did not actually own the row lock");

  const started=performance.now();
  const skipped=await skipper.transaction(async tx=>tx.query<{id:number}>(
   "SELECT id FROM public.q026_skip_probe ORDER BY id FOR UPDATE SKIP LOCKED"));
  const elapsed=performance.now()-started;
  const other=lockedId===1?2:1;
  assert.deepEqual(skipped.map(x=>Number(x.id)),[other],
   "SKIP LOCKED did not skip exactly the separately locked row");
  assert.ok(elapsed<deadline,"SKIP LOCKED waited on the held lock");
  return {locked:lockedId,skipped:other,unblocked:0,elapsed_ms:Math.round(elapsed),
   nowait_sqlstate:"55P03"};
 }finally{
  release();await held;
 }
}

void(async()=>{
 const isolated=await bancoVazio(url,"q026skipsessions");
 const db=isolated.cliente;
 const locker=await createPgClient({url:isolated.url,max:1,statementTimeoutMs:3000});
 const skipper=await createPgClient({url:isolated.url,max:1,statementTimeoutMs:3000});
 try{
  await db.query(
   "CREATE TABLE public.q026_skip_probe (id integer PRIMARY KEY, label text NOT NULL)");
  await db.query(
   "INSERT INTO public.q026_skip_probe(id,label) VALUES (1,'synthetic one'),(2,'synthetic two')");
  const details=[];
  for(const locked of [1,2]){
   const result=await oneCase(locker,skipper,locked);
   const again=await skipper.transaction(async tx=>tx.query<{id:number}>(
    "SELECT id FROM public.q026_skip_probe ORDER BY id FOR UPDATE SKIP LOCKED"));
   assert.deepEqual(again.map(x=>Number(x.id)),[1,2],
    "released locks did not return to the next transaction");
   details.push({...result,unblocked:2});
  }
  const x=await db.query<{count:string}>(
   "SELECT count(*)::text AS count FROM public.q026_skip_probe");
  assert.equal(Number(x[0]?.count),2);
  console.log("SKIP_LOCKED_REAL_CONCURRENT_SESSIONS_PASS "+JSON.stringify({
   cases:details.length,independent_sessions:true,nowait_positive_control:"55P03",
   scenarios:details,restored_rows:2,rows_synthetic:true,db_isolation:"owned_disposable",
   boundary:"localhost runner PG16 only; no hosted/operational DB"
  }));
 }finally{
  await skipper.close();
  await locker.close();
  await isolated.descartar();
 }
})().catch(e=>{console.error("SKIP_LOCKED_REAL_CONCURRENT_SESSIONS_FAIL",e);process.exitCode=1});
