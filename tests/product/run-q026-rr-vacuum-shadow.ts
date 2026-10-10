/**
 * Q026 RR/VACUUM SHADOW — PostgreSQL 16 descartavel.
 *
 * The ACTUAL lerRealidadeDeEntregas is paused after its first SELECT, while
 * a separate writer updates 20k rows on an owned, synthetic, mutable table.
 * A third connection VACUUMs that table while RR snapshot is still pinned.
 *
 * Measures pg_stat_activity.backend_xmin & old/new visible tuple versions;
 * pgstattuple is an optional PHYSICAL observation if the extension exists.
 * It is not production vacuum/bloat forecasting and is not Q016 compaction.
 */
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { bancoIsolado } from "../../src/platform/banco-isolado";
import { createPgClient, type SqlClient,type SqlRow,type TransactionalSqlClient } from "../../src/platform/persistence/sql-client";
import { lerRealidadeDeEntregas } from "../../src/platform/leitura/realidade-de-entregas";

const URL=(process.env.DELIVERYOS_PG_URL??"").trim();
if(!URL)throw Error("Q026_VACUUM_DISPOSABLE_PG_REQUIRED");
const N=20000;
const NOW=new Date("2026-10-10T15:00:00Z");
function milli(t:number){return +t.toFixed(1)}
void(async()=>{
 const b=await bancoIsolado(URL,undefined,"q026rrvac");
 const writer=await createPgClient({url:b.url,max:1});
 const observer=await createPgClient({url:b.url,max:1});
 try {
  await b.cliente.query([
   "CREATE TABLE public.q026_vacuum_probe (",
   "id bigint PRIMARY KEY, flag integer NOT NULL, payload text NOT NULL)",
   "WITH (fillfactor=100)"
  ].join(" "));
  await b.cliente.query(
   "INSERT INTO public.q026_vacuum_probe(id,flag,payload) "+
   "SELECT g,0,repeat('x',400) FROM generate_series(1,$1::int) AS g",
   [N]);
  await b.cliente.query("ANALYZE public.q026_vacuum_probe");
  let extension=false;
  try {
   await observer.query("CREATE EXTENSION IF NOT EXISTS pgstattuple");
   extension=true;
  } catch(e){
   console.log("Q026_PGSTATTUPLE_UNAVAILABLE "+String(e).slice(0,300));
  }
  async function physical(){
   if(!extension)return null;
   const r=await observer.query("SELECT * FROM pgstattuple('public.q026_vacuum_probe'::regclass)");
   const p=r[0];
   return {
     table_len:Number(p.table_len),
     tuple_count:Number(p.tuple_count),
     dead_tuple_count:Number(p.dead_tuple_count),
     free_percent:Number(p.free_percent)
   };
  }
  const initial=await physical();
  let pid=0,hookCount=0,xminDuring:string|null=null;
  let timeInVacuum=0,rrOldCount=0,writerNewCount=0;
  let during:Awaited<ReturnType<typeof physical>>=null;
  const outOfBandXmin=async()=>{
   const r=await observer.query(
    "SELECT backend_xmin::text AS xmin,state FROM pg_stat_activity WHERE pid=$1",[pid]);
   assert.equal(r.length,1);
   return {xmin:r[0].xmin===null?null:String(r[0].xmin),state:String(r[0].state)};
  };
  const intercepted:TransactionalSqlClient={
   query:<R extends SqlRow=SqlRow>(sql:string,p?:readonly unknown[])=>b.cliente.query<R>(sql,p),
   close:async()=>undefined,
   transaction<T>(fn:(tx:SqlClient)=>Promise<T>):Promise<T>{
    return b.cliente.transaction(async tx=>{
     const wrapped:SqlClient={
      query:async<R extends SqlRow=SqlRow>(sql:string,p?:readonly unknown[])=>{
       if(sql.includes("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ")) {
        await tx.query(sql,p);
        const a=await tx.query("SELECT pg_backend_pid() AS pid");
        pid=Number(a[0].pid);
        return [] as R[];
       }
       const result=await tx.query<R>(sql,p);
       if(!hookCount && /FROM platform\.event_log/i.test(sql) && /event_type\s*=\s*ANY/i.test(sql)){
        hookCount++;
        const observed=await outOfBandXmin();
        xminDuring=observed.xmin;
        assert.ok(xminDuring,"RR snapshot did not pin backend_xmin after first SELECT");
        // Physical versions are updated by a separate session and COMMITTED
        // while the real reader remains in the same snapshot.
        await writer.query("UPDATE public.q026_vacuum_probe SET flag=1 WHERE flag=0");
        writerNewCount=Number((await observer.query(
          "SELECT count(*)::int AS n FROM public.q026_vacuum_probe WHERE flag=1"
        ))[0].n);
        assert.equal(writerNewCount,N);
        const startVac=performance.now();
        await observer.query("VACUUM (ANALYZE) public.q026_vacuum_probe");
        timeInVacuum=milli(performance.now()-startVac);
        during=await physical();
        rrOldCount=Number((await tx.query(
          "SELECT count(*)::int AS n FROM public.q026_vacuum_probe WHERE flag=0"
        ))[0].n);
        assert.equal(rrOldCount,N,"VACUUM destroyed versions visible to pinned RR");
        const again=await outOfBandXmin();
        assert.equal(again.xmin,xminDuring,"RR xmin changed during one read");
       }
       return result;
      }
     };
     return fn(wrapped);
    });
   }
  };
  const start=performance.now();
  const reality=await lerRealidadeDeEntregas(intercepted,{agora:NOW});
  const elapsed=milli(performance.now()-start);
  assert.equal(hookCount,1,"actual reader did not enter expected event-log query");
  assert.equal(reality.fonte,"postgresql");
  assert.equal(reality.aparelhos.length,0);
  const afterClosed=await outOfBandXmin();
  assert.equal(afterClosed.xmin,null,"RR xmin remained pinned after COMMIT");
  const fresh=Number((await observer.query(
   "SELECT count(*)::int AS n FROM public.q026_vacuum_probe WHERE flag=1"
  ))[0].n);
  assert.equal(fresh,N);
  await observer.query("VACUUM (ANALYZE) public.q026_vacuum_probe");
  const afterVac=await physical();
  if(initial && during && afterVac) {
   // pgstattuple is a physical measure; different PostgreSQL versions can
   // count RECENTLY_DEAD differently. Avoid inventing a specific dead count.
   assert.ok(initial.table_len>0&&during.table_len>0&&afterVac.table_len>0);
   assert.ok(afterVac.free_percent>=initial.free_percent,
    "VACUUM post-RR unexpectedly has less free space");
  }
  const result={
   checks:7,postgres_writers:2,observer_session:1,probe_rows:N,
   one_real_reader:true,source:"lerRealidadeDeEntregas",
   backend_xmin_during_rr:xminDuring,
   backend_xmin_after_commit:afterClosed.xmin,
   old_versions_visible_during_vacuum:rrOldCount,
   new_versions_visible_elsewhere:writerNewCount,
   vacuum_while_rr_ms:timeInVacuum,
   reader_with_injected_update_ms:elapsed,
   pgstattuple_available:extension,
   physical_before:initial,physical_during_rr:during,physical_after_close_and_vacuum:afterVac,
   caveat:"pinned backend_xmin + version visibility proven; artificial 20k UPDATE; NOT operational VACUUM throughput/p95"
  };
  console.log("Q026_RR_VACUUM_SHADOW_PASS "+JSON.stringify(result));
 }finally{await writer.close();await observer.close();await b.descartar()}
})().catch(e=>{console.error(e);process.exitCode=1});
