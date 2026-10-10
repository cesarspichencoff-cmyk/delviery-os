/**
 * Q-026 SHADOW: PostgreSQL 16 real MVCC/pool lifetime under a bounded cursor,
 * a TOTAL transaction budget and external pg_cancel_backend.
 *
 * WARNING: This file demonstrates a proposed guard, not a deployed deadline.
 * It does NOT replace the full-model reader or Q-016 forensic replay.
 * Disposable database only, no runtime changes, no production schema changes.
 */
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { bancoIsolado } from "../../src/platform/banco-isolado";
import { createPgClient } from "../../src/platform/persistence/sql-client";
import { lerRealidadeDeEntregas } from "../../src/platform/leitura/realidade-de-entregas";
import { lerFatosParaReplay } from "../../src/platform/projections/replay-do-event-log";
import { TIPOS_DA_OPERACAO_VIVA } from "../../src/platform/runtime/handler-operacao-viva";

const URL=(process.env.DELIVERYOS_PG_URL??"").trim();
if(!URL){console.error("Q026_MVCC_BUDGET_PG_REQUIRED");process.exit(78)}
const N=Number(process.env.Q026_MVCC_EVENTS??120000);
assert.ok([120000,300000,1030000].includes(N),"supported isolated sizes");
const budgetMs=650;
const statementTimeoutMs=15000;
const contentionMs=200;
const NOW=new Date("2026-10-10T18:00:00Z");
const pause=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms));
const sqlCode=(err:unknown):string|null=>
  err!==null && typeof err==="object" && "code" in err?String((err as {code:unknown}).code):null;
const factSql=[
  "INSERT INTO platform.event_log(event_id,unit_id,object_type,object_id,event_type,payload,",
  "occurred_at,recorded_at,origin,idempotency_key,contract_version,source_mode,sequence_local,device_id,clock_trust)",
  "VALUES ($1,'ITAIM','trip','MVCC-TRIP','gps_batch_received','{}'::jsonb,$2,$2,",
  "'device',$1,'gps_batch_received@1.0.0','simulated',$3,'DEV-MVCC','trusted') RETURNING event_id"
].join(" ");

void(async()=>{
  const b=await bancoIsolado(URL,undefined,"q026budgetmvcc");
  const reader=await createPgClient({url:b.url,max:1,connectionTimeoutMillis:contentionMs,statementTimeoutMs});
  const writer=await createPgClient({url:b.url,max:1,statementTimeoutMs});
  const observer=await createPgClient({url:b.url,max:1,statementTimeoutMs});
  try{
    await b.cliente.query("INSERT INTO identity.unit(unit_id,display_name) VALUES ('ITAIM','Itaim synthetic')");
    await b.cliente.query(
      "INSERT INTO identity.device(device_id,unit_id,label,registered_at) "+
      "VALUES ('DEV-MVCC','ITAIM','Test only','2026-10-09T00:00:00Z')");
    const bulk=[
      "INSERT INTO platform.event_log(event_id,unit_id,object_type,object_id,event_type,payload,",
      "occurred_at,recorded_at,origin,idempotency_key,contract_version,source_mode,sequence_local,device_id,clock_trust)",
      "SELECT 'q026-mvcc-base-'||g,'ITAIM','trip','MVCC-TRIP','gps_batch_received','{}'::jsonb,",
      "TIMESTAMPTZ '2026-10-09T18:00:00Z'+((g%500)::double precision*interval '0.2 second'),",
      "TIMESTAMPTZ '2026-10-09T18:00:00Z'+((g%500)::double precision*interval '0.2 second'),",
      "'device','q026-mvcc-base-'||g,'gps_batch_received@1.0.0','simulated',g,'DEV-MVCC','trusted'",
      "FROM generate_series($1::integer,$2::integer) g"
    ].join(" ");
    for(let i=1;i<=N;i+=30000)await b.cliente.query(bulk,[i,Math.min(i+29999,N)]);
    // Disposable MVCC fixture deliberately UPDATED to expose dead tuples under VACUUM.
    // No UPDATE to append-only platform.event_log and no production migration.
    await b.cliente.query("CREATE TABLE public.q026_mvcc_probe(id integer PRIMARY KEY, version integer NOT NULL)");
    await b.cliente.query("INSERT INTO public.q026_mvcc_probe SELECT g,0 FROM generate_series(1,500) g");
    await b.cliente.query("ANALYZE platform.event_log");
    await b.cliente.query("ANALYZE public.q026_mvcc_probe");

    const report:{[key:string]:unknown}={events:N,budget_ms:budgetMs,
      statement_timeout_per_statement_ms:statementTimeoutMs,pool_max:1};

    // TEST A: An explicit total elapsed-time guard BETWEEN FETCHes. Per-statement
    // timeout cannot enforce this budget when each FETCH completes normally.
    let pid=0,pinnedXmin:string|null=null,batches=0,buffer=0,writerCommits=0;
    let budgetFailure:unknown;
    let beforeVacuumDead:unknown=null,afterVacuumDead:unknown=null;
    const transactionStart=performance.now();
    try{
      await reader.transaction(async tx=>{
        await tx.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY");
        const p=await tx.query("SELECT pg_backend_pid()::int AS pid");pid=Number(p[0].pid);
        assert.ok(pid>0);
        await tx.query([
          "DECLARE q026_mvcc_cursor NO SCROLL CURSOR FOR",
          "SELECT event_id,unit_id,source_mode,object_type,object_id,event_type",
          "FROM platform.event_log WHERE event_type='gps_batch_received'",
          "ORDER BY unit_id,source_mode NULLS LAST,object_type,object_id"
        ].join(" "));
        const first=await tx.query("FETCH FORWARD 257 FROM q026_mvcc_cursor");
        assert.equal(first.length,257);
        buffer=Math.max(buffer,first.length);batches++;
        const initialSum=await tx.query("SELECT sum(version)::int AS total FROM public.q026_mvcc_probe");
        assert.equal(Number(initialSum[0].total),0);
        const observed=await observer.query(
          "SELECT backend_xmin::text AS xmin,state FROM pg_stat_activity WHERE pid=$1",[pid]);
        assert.equal(observed.length,1);
        pinnedXmin=observed[0].xmin===null?null:String(observed[0].xmin);
        assert.ok(pinnedXmin,"RR snapshot was not pinned during cursor");
        // All external writes commit while a snapshot that predates them is pinned.
        await writer.query("UPDATE public.q026_mvcc_probe SET version=1");
        for(let i=1;i<=40;i++){
          const timestamp=new Date(Date.parse("2026-10-10T17:00:00Z")+i*1000).toISOString();
          const rows=await writer.query(factSql,["q026-mvcc-append-"+i,timestamp,N+i]);
          assert.equal(rows.length,1);writerCommits++;
        }
        const current=await observer.query(
          "SELECT backend_xmin::text AS xmin FROM pg_stat_activity WHERE pid=$1",[pid]);
        assert.equal(String(current[0].xmin),pinnedXmin,"RR horizon moved with concurrent writes");
        // A real VACUUM must run (and complete) while RR still holds old versions.
        await observer.query("VACUUM (ANALYZE) public.q026_mvcc_probe");
        const stat=await observer.query(
          "SELECT n_dead_tup::int AS dead FROM pg_stat_user_tables "+
          "WHERE relid='public.q026_mvcc_probe'::regclass");
        beforeVacuumDead=stat[0]?.dead??null;
        const rrSum=await tx.query("SELECT sum(version)::int AS total FROM public.q026_mvcc_probe");
        assert.equal(Number(rrSum[0].total),0,"VACUUM invalidated visible old rows");
        const rrCount=await tx.query(
          "SELECT count(*)::int AS n FROM platform.event_log WHERE event_type='gps_batch_received'");
        assert.equal(Number(rrCount[0].n),N,"committed writer fact leaked into RR snapshot");
        // Pool MAX ONE: parallel read MUST NOT hang indefinitely; bounded
        // acquisition times out until original transaction rolls back.
        const heldQuery=reader.query("SELECT 1 AS should_not_observe").then(
          ()=>({ok:true,error:null as unknown}),error=>({ok:false,error})
        );
        const unavailable=await heldQuery;
        assert.equal(unavailable.ok,false,"pool leaked a second connection");
        assert.match(String(unavailable.error),/timeout|connection/i);
        report.pool_wait_failure=String(unavailable.error).slice(0,145);
        report.pool_wait_is_bounded=true;
        // Demonstrate elapsed-clock budget as actual application-side guard,
        // not an installed feature. Each FETCH is individually << 15s.
        const started=performance.now();
        for(let i=0;i<35;i++){
          const rows=await tx.query("FETCH FORWARD 257 FROM q026_mvcc_cursor");
          if(rows.length===0)break;
          batches++;buffer=Math.max(buffer,rows.length);
          await pause(85);
          if(performance.now()-started>=budgetMs){
            const e=new Error("Q026_TOTAL_RR_BUDGET_EXCEEDED");
            (e as Error&{code:string}).code="Q026_TOTAL_BUDGET";
            throw e;
          }
        }
        throw Error("TOTAL_BUDGET_GUARD_FAILED");
      });
    }catch(e){budgetFailure=e}
    assert.equal(sqlCode(budgetFailure),"Q026_TOTAL_BUDGET");
    assert.equal(writerCommits,40);
    assert.ok(batches>=2&&buffer<=257);
    const afterBudget=await observer.query(
      "SELECT backend_xmin::text AS xmin,state FROM pg_stat_activity WHERE pid=$1",[pid]);
    assert.equal(afterBudget[0]?.xmin,null,"ROLLBACK did not release xmin after total budget");
    assert.equal(afterBudget[0]?.state,"idle","connection not idle after budget rollback");
    const poolReuse=await reader.query("SELECT pg_backend_pid()::int AS pid");
    assert.equal(Number(poolReuse[0].pid),pid,"pool did not reuse reader after release");
    const refreshed=await reader.query(
      "SELECT count(*)::int AS n FROM platform.event_log WHERE event_type='gps_batch_received'");
    assert.equal(Number(refreshed[0].n),N+40,"reader could not see committed facts after rollback");
    const refreshedSum=await reader.query("SELECT sum(version)::int AS n FROM public.q026_mvcc_probe");
    assert.equal(Number(refreshedSum[0].n),500);
    await observer.query("VACUUM (ANALYZE) public.q026_mvcc_probe");
    const afterVacuum=await observer.query(
      "SELECT n_dead_tup::int AS dead FROM pg_stat_user_tables "+
      "WHERE relid='public.q026_mvcc_probe'::regclass");
    afterVacuumDead=afterVacuum[0]?.dead??null;
    report.budget_case={sqlstate:sqlCode(budgetFailure),writer_commits:writerCommits,
      cursor_fetch_batches:batches,max_batch:buffer,
      total_wall_ms:+(performance.now()-transactionStart).toFixed(2),
      reader_snapshot_held_during_vacuum:true,
      backend_xmin_cleared_after_rollback:true,
      same_backend_reused:true,
      after_vacuum_dead_observed:afterVacuumDead,
      during_snapshot_dead_observed:beforeVacuumDead};
    console.log("Q026_BUDGET_POOL_MVCC_PASS "+JSON.stringify(report.budget_case));

    // TEST B: PostgreSQL pg_cancel_backend of an active statement inside a
    // pinned RR cursor transaction. This is not statement_timeout (PR #50).
    let cancelPid=0,cancelXmin:string|null=null,cancelFailure:unknown;
    const cancelStart=performance.now();
    try{
      await reader.transaction(async tx=>{
        await tx.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY");
        cancelPid=Number((await tx.query("SELECT pg_backend_pid()::int AS pid"))[0].pid);
        await tx.query("SELECT count(*)::int AS n FROM platform.event_log");
        const state=await observer.query(
          "SELECT backend_xmin::text AS xmin FROM pg_stat_activity WHERE pid=$1",[cancelPid]);
        cancelXmin=state[0]?.xmin===null?null:String(state[0].xmin);
        assert.ok(cancelXmin,"second RR did not pin snapshot");
        const pending=tx.query("SELECT pg_sleep(4)");
        // Attach rejection handling immediately, so no unhandled promise.
        const settled=pending.then(()=>({ok:true,error:null as unknown}),
          error=>({ok:false,error}));
        await pause(170);
        const active=await observer.query(
          "SELECT state,backend_xmin::text AS xmin FROM pg_stat_activity WHERE pid=$1",[cancelPid]);
        assert.equal(active[0]?.state,"active","sleep query was not active at cancel");
        assert.equal(String(active[0]?.xmin),cancelXmin);
        const sent=await observer.query("SELECT pg_cancel_backend($1::int) AS cancelled",[cancelPid]);
        assert.equal(sent[0]?.cancelled,true,"external PG cancel did not reach reader");
        const outcome=await settled;
        if(outcome.ok)throw Error("PG_CANCEL_DID_NOT_INTERRUPT");
        throw outcome.error;
      });
    }catch(e){cancelFailure=e}
    assert.equal(sqlCode(cancelFailure),"57014","external cancel did not emit server SQLSTATE 57014");
    const afterCancel=await observer.query(
      "SELECT backend_xmin::text AS xmin,state FROM pg_stat_activity WHERE pid=$1",[cancelPid]);
    assert.equal(afterCancel[0]?.xmin,null);
    assert.equal(afterCancel[0]?.state,"idle");
    assert.equal(Number((await reader.query("SELECT pg_backend_pid()::int AS pid"))[0].pid),cancelPid);
    const freshView=await lerRealidadeDeEntregas(reader,{agora:NOW});
    assert.equal(freshView.projecoes.flatMap(p=>p.viagens)[0]?.eventos.length,N+40);
    assert.equal(freshView.aparelhos[0]?.fatos_por_modo.simulated,N+40);
    const forensic=await lerFatosParaReplay(reader,TIPOS_DA_OPERACAO_VIVA);
    assert.equal(forensic.aptos.length,N+40);
    report.cancel_case={sqlstate:sqlCode(cancelFailure),cancel_pid:cancelPid,
      cancellation_ms:+(performance.now()-cancelStart).toFixed(2),
      same_backend_reused:true,backend_xmin_cleared_after_rollback:true,
      post_abort_canonical_and_q016_intact:true};
    console.log("Q026_EXTERNAL_CANCEL_PASS "+JSON.stringify(report.cancel_case));
    console.log("Q026_TOTAL_BUDGET_MVCC_SHADOW_PASS "+JSON.stringify({
      ...report,source:"disposable PostgreSQL 16; bounded cursor and SQL runner",
      boundary:"wall guard is a SHADOW loop, not a production runtime feature; no p95/p99, HTTP disconnect, full-model deadline or physical devices"
    }));
  }finally{await reader.close();await writer.close();await observer.close();await b.descartar()}
})().catch(e=>{console.error(e);process.exitCode=1});
