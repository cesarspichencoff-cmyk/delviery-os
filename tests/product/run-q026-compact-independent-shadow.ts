/**
 * Q-026 SHADOW — leitura paginada com representacao compacta EXCLUSIVA para a UI.
 *
 * Testa uma HIPOTESE de leitura, NAO implementa um leitor operacional.
 * Usa projetar() para CADA viagem; transforma a saida para SOMENTE campos
 * consumidos pela apresentacao (incluindo fatos=eventos.length), descartando
 * o array forense de IDs APENAS na copia compacta. Compara todos os campos
 * da copia compacta com a mesma transformacao do replay canônico, byte a byte.
 * DB criado/migrado pelo runner real e descartado no fim.
 *
 * Limites conhecidos:
 * - Nao e replay canonico Q-016: cursor global, quarentena e dimensoes
 *   completas nao sao equivalentes a leitura somente de viagens;
 * - Event-log unique(idempotency_key) garante nao duplicidade na fixture;
 * - Pico por viagem continua potencialmente N para uma viagem gigantesca;
 * - Sem ALTER TABLE, sem write em banco real, sem HTTP ou deploy.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { bancoIsolado } from "../../src/platform/banco-isolado";
import type { EventEnvelope } from "../../src/platform/contracts/event-catalog";
import type { SqlRow } from "../../src/platform/persistence/sql-client";
import { envelopeDaMensagem } from "../../src/platform/projections/consumidor";
import { lerFatosParaReplay } from "../../src/platform/projections/replay-do-event-log";
import { projetar, type ViagemProjetada } from "../../src/platform/projections/operacao-viva";
import { TIPOS_DA_OPERACAO_VIVA } from "../../src/platform/runtime/handler-operacao-viva";

const URL_PG=(process.env.DELIVERYOS_PG_URL??"").trim();
const N=Number(process.env.Q026_EVENTS??100000);
const MODE=process.env.Q026_INDEPENDENT_MODE;
assert.ok(MODE==="compact"||MODE==="baseline","Q026_INDEPENDENT_MODE obrigatorio compact|baseline");
const RESULT_FILE=(process.env.Q026_RESULT_FILE??"").trim();
assert.ok(RESULT_FILE,"Q026_RESULT_FILE obrigatorio para comparação entre processos");
if(!URL_PG){console.error("PULADO: nao foi dado PostgreSQL de teste");process.exit(78)}
assert.ok(Number.isSafeInteger(N)&&N>=1000&&N<=1030000&&N%1000===0);
assert.ok(typeof global.gc==="function","NODE_OPTIONS=--expose-gc e necessario");
const now=new Date("2026-10-09T22:00:00.000Z");
const K=1024*1024;
function memory(){
  const m=process.memoryUsage();
  return {
    rss_mib:+(m.rss/K).toFixed(1),
    heap_used_mib:+(m.heapUsed/K).toFixed(1),
    peak_rss_mib:+(process.resourceUsage().maxRSS/1024).toFixed(1),
  };
}
function out(phase:string,extras:Record<string,unknown>={}){
  console.log("Q026_COMPACT_VIEW_SHADOW "+JSON.stringify({phase,n:N,...memory(),...extras}));
}
async function gc(){
  for(let i=0;i<3;i++){global.gc?.();await new Promise<void>(r=>setImmediate(r))}
}
/** Sombra do que Entregas desenha; NAO substitui ViagemProjetada ou Q-016. */
function compacto(v:ViagemProjetada){
  return {
    trip_id:v.trip_id,unit_id:v.unit_id,estado:v.estado,
    device_id:v.device_id,ultimo_fato_em:v.ultimo_fato_em,
    ocorrencias_abertas:v.ocorrencias_abertas,source_mode:v.source_mode,
    ultima_posicao_em:v.ultima_posicao_em,frescor:v.frescor,
    fatos:v.eventos.length,
  };
}
type CompactTrip=ReturnType<typeof compacto>;
function ordenar(xs:CompactTrip[]){return xs.sort((a,b)=>a.trip_id.localeCompare(b.trip_id));}
function envelope(l:SqlRow):EventEnvelope{
  assert.equal(l.source_mode,"simulated");
  const sequence=l.sequence_local===null||l.sequence_local===undefined?undefined:Number(l.sequence_local);
  assert.ok(sequence===undefined||Number.isSafeInteger(sequence));
  const time=(v:unknown)=>v instanceof Date?v.toISOString():new Date(String(v)).toISOString();
  const e=envelopeDaMensagem({
    outbox_id:"cursor:"+String(l.event_id),
    kind:String(l.event_type),
    idempotency_key:String(l.idempotency_key),
    payload:{
      event_id:String(l.event_id),
      event_type:String(l.event_type),
      event_version:String(l.contract_version),
      unit_id:String(l.unit_id),
      trip_id:l.object_type==="trip"?String(l.object_id):undefined,
      device_id:l.device_id??undefined,
      occurred_at:time(l.occurred_at),
      received_at:time(l.recorded_at),
      clock_trust:l.clock_trust??undefined,
      origin:l.origin,
      source_mode:l.source_mode,
      sequence,
    }
  });
  assert.ok(e,"event_log nao produziu envelope valido");
  return e;
}
void(async()=>{
  const b=await bancoIsolado(URL_PG,undefined,"q026pgd");
  try{
    await b.cliente.query("INSERT INTO identity.unit(unit_id,display_name) VALUES ('ITAIM','Itaim Shadow')");
    const seed=[
      "INSERT INTO platform.event_log",
      "(event_id,unit_id,object_type,object_id,event_type,payload,",
      "occurred_at,recorded_at,origin,idempotency_key,contract_version,source_mode)",
      "SELECT 'q026paged-'||g,'ITAIM','trip','Q026-T-'||((g-1)/1000)::integer,",
      "CASE WHEN (g-1)%1000=0 THEN 'trip_started' ELSE 'gps_batch_received' END,",
      "'{}'::jsonb, TIMESTAMPTZ '2026-10-09T22:00:00Z'-(($1::bigint-g)::double precision*interval '0.1 seconds'),",
      "TIMESTAMPTZ '2026-10-09T22:00:00Z','device','q026paged-key-'||g,",
      "CASE WHEN (g-1)%1000=0 THEN 'trip_started@1.0.0'",
      "ELSE 'gps_batch_received@1.0.0' END,",
      "'simulated' FROM generate_series($2::integer,$3::integer) AS g"
    ].join(" ");
    for(let a=1;a<=N;a+=50000)await b.cliente.query(seed,[N,a,Math.min(N,a+49999)]);
    await gc();
    out("seeded");

    if(MODE==="baseline") {
      const t=performance.now();
      const read=await lerFatosParaReplay(b.cliente,TIPOS_DA_OPERACAO_VIVA);
      assert.equal(read.aptos.length,N);
      assert.equal(read.sem_modo,0);
      const projection=projetar(read.aptos,{agora:now,unit_id:"ITAIM",source_mode:"simulated"});
      const compact=ordenar(projection.viagens.map(compacto));
      assert.equal(compact.length,N/1000);
      assert.equal(compact.reduce((n,v)=>n+v.fatos,0),N);
      const hash=createHash("sha256").update(JSON.stringify(compact)).digest("hex");
      await gc();
      const result={variant:"baseline",n:N,groups:compact.length,facts:N,sha256:hash,
        ms:Math.round(performance.now()-t),...memory()};
      writeFileSync(RESULT_FILE,JSON.stringify(result));
      console.log("Q026_INDEPENDENT_RESULT "+JSON.stringify(result));
      return;
    }

    const streamedCompact:CompactTrip[]=[];
    let seen=0,groups=0,maxGroup=0;
    const sample=()=>{
      const m=memory();
      return {rss:m.rss_mib,heap:m.heap_used_mib};
    };
    let sampledPeak={rss:0,heap:0};
    const periodic=setInterval(()=>{
      const m=sample();
      sampledPeak.rss=Math.max(sampledPeak.rss,m.rss);
      sampledPeak.heap=Math.max(sampledPeak.heap,m.heap);
    },75);
    const started=performance.now();
    try{
      await b.cliente.transaction(async(tx)=>{
        await tx.query("SET TRANSACTION READ ONLY");
        await tx.query([
          "DECLARE q026_shadow_cursor NO SCROLL CURSOR FOR",
          "SELECT event_id,unit_id,object_type,object_id,event_type,occurred_at,",
          "origin,device_id,sequence_local,idempotency_key,contract_version,",
          "source_mode,recorded_at,clock_trust FROM platform.event_log",
          "WHERE event_type IN ('trip_started','gps_batch_received')",
          "ORDER BY unit_id,source_mode,object_type,object_id"
        ].join(" "));
        let active="";
        let buffer:EventEnvelope[]=[];
        const flush=()=>{
          if(buffer.length===0)return;
          maxGroup=Math.max(maxGroup,buffer.length);
          const e=buffer[0];
          const p=projetar(buffer,{agora:now,unit_id:e.unit_id,source_mode:e.source_mode});
          assert.equal(p.viagens.length,1,"esperada uma viagem por grupo");
          // Este objeto ja NAO mantem o vetor v.eventos, apenas a contagem.
          streamedCompact.push(compacto(p.viagens[0]));
          groups++;buffer=[];
        };
        while(true){
          const rows=await tx.query("FETCH FORWARD 4096 FROM q026_shadow_cursor");
          if(rows.length===0)break;
          for(const row of rows){
            const e=envelope(row);
            const key=e.unit_id+"|"+e.source_mode+"|"+e.trip_id;
            if(active!==""&&active!==key)flush();
            active=key;
            buffer.push(e);
            seen++;
          }
        }
        flush();
        await tx.query("CLOSE q026_shadow_cursor");
      });
    }finally{clearInterval(periodic)}
    assert.equal(seen,N);
    assert.equal(groups,N/1000);
    assert.equal(maxGroup,1000);
    assert.equal(streamedCompact.reduce((n,v)=>n+v.fatos,0),N);
    assert.ok(streamedCompact.every(v=>!Object.hasOwn(v,"eventos")));
    await gc();
    out("streamed-output-retained",{
      stream_ms:Math.round(performance.now()-started),
      streamed:seen,groups,max_group:maxGroup,
      sampled_peak:sampledPeak,
    });
    const hash=createHash("sha256").update(JSON.stringify(ordenar(streamedCompact))).digest("hex");
    const result={variant:"compact",n:N,groups,facts:seen,sha256:hash,
      ms:Math.round(performance.now()-started),max_group:maxGroup,...memory()};
    writeFileSync(RESULT_FILE,JSON.stringify(result));
    console.log("Q026_INDEPENDENT_RESULT "+JSON.stringify(result));
    return;

    // Reference replay from the repository, in a sequential SAME process phase.
    // Memory measurements are diagnostic; live streamedCompact is retained.
    async function baseline() {
      const t=performance.now();
      const read=await lerFatosParaReplay(b.cliente,TIPOS_DA_OPERACAO_VIVA);
      assert.equal(read.aptos.length,N);
      const p=projetar(read.aptos,{agora:now,unit_id:"ITAIM",source_mode:"simulated"});
      assert.equal(p.viagens.length,groups);
      const expected=ordenar(p.viagens.map(compacto));
      const actual=ordenar([...streamedCompact]);
      assert.deepEqual(actual,expected,"todos campos de UI divergentes");
      assert.equal(JSON.stringify(actual),JSON.stringify(expected),
        "JSON compacto byte a byte diverge do replay canônico");
      assert.equal(expected.reduce((n,v)=>n+v.fatos,0),N);
      out("baseline-held",{
        replay_ms:Math.round(performance.now()-t),
        exact_compact_json_equivalent:true,full_event_id_vectors_not_returned:true,groups,
        baseline_event_count:read.aptos.length,
      });
    }
    await baseline();
    await gc();
    out("baseline-released-and-gc");
    console.log("Q026_COMPACT_VIEW_SHADOW_PASS "+JSON.stringify({
      n:N,trips:groups,exact_compact_json_equivalent:true,
      compact_event_counts:N,full_event_id_vectors_not_returned:true,
      limitations:"Not Q-016. Sequential same-process memory phases, not a fair independent A/B. Only one synthetic mode, 1000 facts/trip. Long trips remain unbounded.",
    }));
  }finally{await b.descartar()}
})().catch(e=>{console.error(e);process.exitCode=1});
