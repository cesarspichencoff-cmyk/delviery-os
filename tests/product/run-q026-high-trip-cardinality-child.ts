/**
 * Q-026 SHADOW — high distinct-trip cardinality versus one huge trip.
 * Processes are isolated; same deterministic PostgreSQL16 synthetic fixture.
 * Tests the *real* incremental presentation reader and canonical RR reader.
 *
 * No operational database. A passing test proves model/viewmodel parity for
 * this fixture, NOT memory superiority nor production readiness.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { bancoIsolado } from "../../src/platform/banco-isolado";
import { lerRealidadeDeEntregas } from "../../src/platform/leitura/realidade-de-entregas";
import { lerRealidadeDeEntregasIncremental } from "../../src/platform/leitura/realidade-de-entregas-incremental";
import { entregasVM } from "../../src/product/viewmodels/entregas-vm";
import type { UiSnapshot } from "../../src/entregas/ui/adapters/UiApplicationFacade";

const url=(process.env.DELIVERYOS_PG_URL??"").trim();
if(!url){console.error("Q026_CARDINALITY_PG_REQUIRED");process.exit(78)}
const MODE=process.env.Q026_CARDINALITY_MODE;
assert.ok(MODE==="baseline"||MODE==="incremental","explicit mode required");
const N=Number(process.env.Q026_CARDINALITY_N);
assert.ok([30000,120000].includes(N),"non-adversarial event count");
const now=new Date("2026-10-10T18:00:00Z");
const snapshot={trips:[],occurrences:[],connection:"online",pending_sync:0,last_error:null} as unknown as UiSnapshot;
const mib=(x:number)=>+(x/1048576).toFixed(2);
const peakMib=()=>+(process.resourceUsage().maxRSS/1024).toFixed(2);
void(async()=>{
 const db=await bancoIsolado(url,undefined,"q026cardinality");
 try{
  await db.cliente.query("INSERT INTO identity.unit(unit_id,display_name) VALUES ('ITAIM','Itaim Synthetic')");
  await db.cliente.query(
   "INSERT INTO identity.device(device_id,unit_id,label,registered_at,secret_bound_at,last_session_at) "+
   "VALUES ('Q026-MANY-TRIPS','ITAIM','Synthetic','2026-10-09T00:00:00Z',"+
   "'2026-10-09T00:00:00Z','2026-10-10T16:00:00Z')");
  const seed=[
   "INSERT INTO platform.event_log(event_id,unit_id,object_type,object_id,event_type,payload,",
   "occurred_at,recorded_at,origin,idempotency_key,contract_version,source_mode,sequence_local,device_id,clock_trust)",
   "SELECT 'q026-many-event-'||g,'ITAIM','trip','TRIP-'||lpad(g::text,9,'0'),",
   "'gps_batch_received','{}'::jsonb,",
   "TIMESTAMPTZ '2026-10-09T18:00:00Z'+(g*interval '0.01 second'),",
   "TIMESTAMPTZ '2026-10-09T18:00:00Z'+(g*interval '0.01 second'),",
   "'device','q026-many-key-'||g,'gps_batch_received@1.0.0','simulated',g,",
   "'Q026-MANY-TRIPS','trusted' FROM generate_series($1::int,$2::int) AS g"
  ].join(" ");
  for(let n=1;n<=N;n+=30000)await db.cliente.query(seed,[n,Math.min(N,n+29999)]);
  await db.cliente.query("ANALYZE platform.event_log");
  const beforeMib=mib(process.memoryUsage().rss);
  const peakBefore=peakMib();
  const started=performance.now();
  const reality=MODE==="baseline"
   ? await lerRealidadeDeEntregas(db.cliente,{agora:now})
   : await lerRealidadeDeEntregasIncremental(db.cliente,{agora:now});
  const readMs=+(performance.now()-started).toFixed(2);
  const rssAfter=mib(process.memoryUsage().rss);
  const trips=reality.projecoes.flatMap(p=>p.viagens);
  assert.equal(trips.length,N,"wrong number of distinct trips");
  assert.equal(trips.reduce((x,t)=>x+t.eventos.length,0),N);
  assert.equal(reality.aparelhos.length,1);
  assert.equal(reality.historico_sem_modo,0);
  const hash=createHash("sha256");
  hash.update(JSON.stringify({versao:reality.versao,fonte:reality.fonte,lida_em:reality.lida_em,
    historico_sem_modo:reality.historico_sem_modo,aparelhos:reality.aparelhos}));
  for(const p of reality.projecoes){
   hash.update(JSON.stringify({unit_id:p.unit_id,source_mode:p.source_mode}));
   for(const v of p.viagens)hash.update(JSON.stringify({
    trip_id:v.trip_id,unit_id:v.unit_id,estado:v.estado,
    device_id:v.device_id,ultimo_fato_em:v.ultimo_fato_em,
    ocorrencias_abertas:v.ocorrencias_abertas,source_mode:v.source_mode,
    eventos_length:v.eventos.length,ultima_posicao_em:v.ultima_posicao_em,
    frescor:v.frescor
   }));
  }
  for(const unit of [null,"ITAIM","LAB","NONE"]){
   const vm=entregasVM(snapshot,now.toISOString(),null,{disponivel:true,realidade:reality},{unidade:unit});
   hash.update(JSON.stringify(vm));
  }
  const digest=hash.digest("hex");
  console.log("Q026_CARDINALITY_SHADOW_CASE "+JSON.stringify({
   mode:MODE,distinct_trips:N,total_events:N,events_per_trip:1,
   presentation_digest:digest,read_wall_ms:readMs,
   rss_after_fixture_mib:beforeMib,rss_after_read_mib:rssAfter,
   peak_before_reader_mib:peakBefore,peak_process_mib:peakMib(),
   device_count:reality.aparelhos.length,scope_count:reality.projecoes.length,
   warning:"One synthetic PG16 process, memory and timing are not operational percentiles"
  }));
 }finally{await db.descartar()}
})().catch(e=>{console.error("Q026_CARDINALITY_SHADOW_CASE_FAILED",e);process.exitCode=1});
