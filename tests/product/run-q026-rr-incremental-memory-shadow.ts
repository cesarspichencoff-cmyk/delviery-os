/**
 * Q026 SHADOW — single trip arbitrarily large; constant-sized accumulator
 * under unique idempotency_key in platform.event_log.
 *
 * Separate Node processes each seed an equivalent synthetic
 * PostgreSQL 16 DB. Compact variant does not allocate a vector of IDs, does
 * not retain whole trip. Baseline runs real lerFatosParaReplay() -> projetar().
 *
 * LIMITS: this is a targeted single-trip RSS comparison, not the complete
 * contract/snapshot concurrency test (see main combined shadow). No
 * production data and NEVER replace canonical Q016 forensic replay.
 */
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { bancoIsolado } from "../../src/platform/banco-isolado";
import { instanteConfiavel } from "../../src/platform/contracts/relogio";
import type { EventEnvelope } from "../../src/platform/contracts/event-catalog";
import { envelopeDaMensagem } from "../../src/platform/projections/consumidor";
import { classificarFrescor, type ViagemProjetada } from "../../src/platform/projections/operacao-viva";
import { lerRealidadeDeEntregas } from "../../src/platform/leitura/realidade-de-entregas";
import type { SqlRow } from "../../src/platform/persistence/sql-client";

const URL_PG=(process.env.DELIVERYOS_PG_URL??"").trim();
const MODE=process.env.Q026_LONG_MODE;
const N=Number(process.env.Q026_LONG_N??120000);
const OUT=(process.env.Q026_LONG_RESULT??"").trim();
if(!URL_PG||!(MODE==="compact"||MODE==="baseline")||!OUT)throw Error("Q026_LONG_TEST_ENV_REQUIRED");
assert.ok(Number.isSafeInteger(N)&&N>=10000&&N<=480000&&N%10000===0);
assert.equal(typeof global.gc,"function","gc explicit required");
const ago=new Date("2026-10-09T22:00:00.000Z");
const KiB=1024,M=KiB*KiB;
const rss=()=>({rss_mib:+(process.memoryUsage().rss/M).toFixed(1),
  heap_used_mib:+(process.memoryUsage().heapUsed/M).toFixed(1),
  peak_rss_mib:+(process.resourceUsage().maxRSS/KiB).toFixed(1)});
async function cleanup(){for(let j=0;j<3;j++){global.gc?.();await new Promise<void>(r=>setImmediate(r))}}
function compact(v:ViagemProjetada){
 return {
  trip_id:v.trip_id,unit_id:v.unit_id,estado:v.estado,device_id:v.device_id,
  ultimo_fato_em:v.ultimo_fato_em,ocorrencias_abertas:v.ocorrencias_abertas,
  source_mode:v.source_mode,ultima_posicao_em:v.ultima_posicao_em,
  frescor:v.frescor,fatos:v.eventos.length
 };
}
type Flat=ReturnType<typeof compact>;
const RANK:Record<string,number>={desconhecido:0,criada:1,em_rota:2,chegou:3,entregue:4,retornando:5,retornou:6,encerrada:7};
const NEXT:Record<string,string>={trip_created:"criada",trip_started:"em_rota",arrival_detected:"chegou",
 delivery_confirmed:"entregue",trip_return_started:"retornando",trip_returned:"retornou",trip_closed:"encerrada"};
const cmp=(a:EventEnvelope,b:EventEnvelope)=>{
 const dt=Date.parse(a.occurred_at)-Date.parse(b.occurred_at);
 if(dt!==0)return dt;
 const ds=(a.sequence??0)-(b.sequence??0);
 return ds!==0?ds:a.event_id.localeCompare(b.event_id);
};
/**
 * Mathematical reduction of trip projection, not chronological replay.
 * All fields are order-invariant reductions except device_id winner; store
 * maximum ordered event with device_id according to canonical comparator.
 * No Set<string> for idempotency: PostgreSQL UNIQUE(idempotency_key) required.
 */
class SmallTrip {
 readonly trip_id="ONE-LONG";
 readonly unit_id="ITAIM";
 readonly source_mode="simulated";
 estado="desconhecido";
 device_id:string|undefined;
 private deviceWinner:EventEnvelope|undefined;
 ultimo_fato_em:string|undefined;
 private ultimoMs=Number.NEGATIVE_INFINITY;
 ocorrencias_abertas=0;
 ultima_posicao_em:string|undefined;
 private posMs=Number.NEGATIVE_INFINITY;
 fatos=0;
 accept(e:EventEnvelope){
   assert.equal(e.trip_id,this.trip_id);
   assert.equal(e.unit_id,this.unit_id);
   assert.equal(e.source_mode,this.source_mode);
   const rank=NEXT[e.event_type];
   if(rank && RANK[rank]>RANK[this.estado])this.estado=rank;
   const t=Date.parse(e.occurred_at);
   assert.ok(Number.isFinite(t),"bad occurred timestamp is NOT supported");
   if(t>this.ultimoMs){this.ultimoMs=t;this.ultimo_fato_em=e.occurred_at}
   if(e.event_type==="gps_batch_received"){
     const trusted=instanteConfiavel(e);
     if(trusted){
       const p=Date.parse(trusted);
       if(p>this.posMs){this.posMs=p;this.ultima_posicao_em=trusted}
     }
   }
   if(e.device_id && (!this.deviceWinner||cmp(e,this.deviceWinner)>0)){
     // Only one winning event retained, not all its siblings.
     this.deviceWinner=e;this.device_id=e.device_id;
   }
   if(e.event_type==="occurrence_created")this.ocorrencias_abertas++;
   this.fatos++;
 }
 result():Flat{
   assert.ok(this.fatos>0&&this.ultimo_fato_em);
   return {trip_id:this.trip_id,unit_id:this.unit_id,estado:this.estado as ViagemProjetada["estado"],
    device_id:this.device_id,ultimo_fato_em:this.ultimo_fato_em,
    ocorrencias_abertas:this.ocorrencias_abertas,source_mode:this.source_mode,
    ultima_posicao_em:this.ultima_posicao_em,
    frescor:classificarFrescor(this.ultima_posicao_em,ago),fatos:this.fatos};
 }
}
function iso(x:unknown):string {
 const d=x instanceof Date?x:new Date(String(x));
 if(!Number.isFinite(d.getTime()))throw Error("bad timestamp");
 return d.toISOString();
}
function dec(r:SqlRow):EventEnvelope{
 let seq:number|undefined;
 if(r.sequence_local!==null&&r.sequence_local!==undefined){
  const n=Number(r.sequence_local);
  assert.ok(Number.isSafeInteger(n)&&n>=0);
  seq=n;
 }
 const e=envelopeDaMensagem({
  outbox_id:"shadow:"+String(r.event_id),
  kind:String(r.event_type),idempotency_key:String(r.idempotency_key),
  payload:{
   event_id:String(r.event_id),event_type:String(r.event_type),
   event_version:String(r.contract_version),unit_id:String(r.unit_id),
   trip_id:r.object_type==="trip"?String(r.object_id):undefined,
   occurred_at:iso(r.occurred_at),
   received_at:r.recorded_at?iso(r.recorded_at):undefined,
   clock_trust:r.clock_trust??undefined,
   device_id:r.device_id??undefined,
   origin:r.origin,source_mode:r.source_mode,sequence:seq
  }
 });
 assert.ok(e,"event decoder cannot accept row");
 return e;
}
void(async()=>{
 const b=await bancoIsolado(URL_PG,undefined,"q026longconst");
 try{
  await b.cliente.query("INSERT INTO identity.unit (unit_id,display_name) VALUES ('ITAIM','Itaim Bench')");
  // Many exact timestamp ties; mixed transitions, multiple devices, suspect GPS
  // clocks and out-of-order series. Within each (time,seq) tie, canonical
  // JS localeCompare on event_id decides the last device. Intentionally NOT
  // ordering cursor by timestamp: incremental reducer must be order invariant.
  const sql=[
   "INSERT INTO platform.event_log (event_id,unit_id,object_type,object_id,event_type,payload,",
   "occurred_at,recorded_at,origin,idempotency_key,contract_version,source_mode,sequence_local,device_id,clock_trust)",
   "SELECT 'l'||lpad(g::text,7,'0'),'ITAIM','trip','ONE-LONG',",
   "CASE WHEN g=1 THEN 'trip_started'",
   "WHEN g%201=0 THEN 'trip_closed'",
   "WHEN g%37=0 THEN 'occurrence_created'",
   "WHEN g%17=0 THEN 'trip_return_started'",
   "ELSE 'gps_batch_received' END,",
   "'{}'::jsonb,",
   "TIMESTAMPTZ '2026-10-09T18:00:00Z'+((g%500)::double precision * interval '0.2 second'),",
   "TIMESTAMPTZ '2026-10-09T18:00:00Z'+((g%500)::double precision * interval '0.2 second')+",
   "(CASE WHEN g%23=0 THEN interval '300 second' ELSE interval '0 second' END),",
   "'device','long-k-'||g,",
   "(CASE WHEN g=1 THEN 'trip_started' WHEN g%201=0 THEN 'trip_closed'",
   "WHEN g%37=0 THEN 'occurrence_created' WHEN g%17=0 THEN 'trip_return_started'",
   "ELSE 'gps_batch_received' END)||'@1.0.0',",
   "'simulated',CASE WHEN g%13=0 THEN NULL ELSE (g%5)::bigint END,",
   "CASE WHEN g%11=0 THEN NULL ELSE 'DEV-'||(g%7) END,",
   "CASE WHEN g%23=0 THEN 'suspect' ELSE 'trusted' END",
   "FROM generate_series($1::integer,$2::integer) g"
  ].join(" ");
  for(let start=1;start<=N;start+=30000)
   await b.cliente.query(sql,[start,Math.min(N,start+29999)]);
  await cleanup();
  const start=performance.now();
  let data:Flat;let batches=0;let maxBatch=0;
  if(MODE==="compact"){
    const a=new SmallTrip();
    await b.cliente.transaction(async tx=>{
      await tx.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY");
      await tx.query([
        "DECLARE q026_long_const NO SCROLL CURSOR FOR",
        "SELECT event_id,unit_id,object_type,object_id,event_type,occurred_at,origin,",
        "device_id,sequence_local,idempotency_key,contract_version,source_mode,recorded_at,clock_trust",
        "FROM platform.event_log WHERE object_type='trip' AND object_id='ONE-LONG'",
        "ORDER BY object_type,object_id"
      ].join(" "));
      for(;;){
        const rows=await tx.query("FETCH FORWARD 4096 FROM q026_long_const");
        if(!rows.length)break;
        batches++;maxBatch=Math.max(maxBatch,rows.length);
        for(const r of rows)a.accept(dec(r));
      }
      await tx.query("CLOSE q026_long_const");
    });
    data=a.result();
  }else{
    // Actual PR #45 reader, not a synthetic replay mock. It obtains all
    // facts, devices, latest events, counts in one RR snapshot, projects after COMMIT.
    const reality=await lerRealidadeDeEntregas(b.cliente,{agora:ago});
    assert.equal(reality.projecoes.length,1);
    assert.equal(reality.projecoes[0].viagens.length,1);
    data=compact(reality.projecoes[0].viagens[0]);
  }
  assert.equal(data.fatos,N);
  assert.equal(data.trip_id,"ONE-LONG");
  assert.equal(data.source_mode,"simulated");
  assert.equal(data.estado,"encerrada");
  assert.ok(data.ocorrencias_abertas>0);
  assert.ok(data.device_id);
  assert.ok(data.ultima_posicao_em);
  const hash=createHash("sha256").update(JSON.stringify(data)).digest("hex");
  await cleanup();
  const result={mode:MODE,n:N,events:data.fatos,hash,ms:Math.round(performance.now()-start),
    batches,max_batch:maxBatch,...rss(),
    contract:"UI fields only; Q016 replay forensics remain unchanged"};
  writeFileSync(OUT,JSON.stringify(result));
  console.log("Q026_RR_MEMORY_RESULT "+JSON.stringify({...result,experiment:"single trip, independent process, disposable PG16",limitations:"rss peak includes seed and process overhead; different code paths; not production SLA"}));
 }finally{await b.descartar()}
})().catch(e=>{console.error(e);process.exitCode=1});
