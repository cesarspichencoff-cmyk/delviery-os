/**
 * Q-026 SHADOW ONLY: separate-process, full Entregas read-model RSS comparison.
 * Two Node processes use equivalent disposable PG16 databases/seed. The
 * baseline runs the actual PR #45 RR reader; the compact variant independently
 * constructs trips and ALL device fields inside ONE PostgreSQL RR snapshot.
 * Q-016 forensics are never replaced and no product runtime is edited.
 */
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import type { UiSnapshot } from "../../src/entregas/ui/adapters/UiApplicationFacade";
import { bancoIsolado } from "../../src/platform/banco-isolado";
import { SOURCE_MODES,type SourceMode,type EventEnvelope } from "../../src/platform/contracts/event-catalog";
import { envelopeDaMensagem } from "../../src/platform/projections/consumidor";
import { classificarFrescor,type ViagemProjetada } from "../../src/platform/projections/operacao-viva";
import { instanteConfiavel,relogioEfetivo } from "../../src/platform/contracts/relogio";
import { TIPOS_DA_OPERACAO_VIVA } from "../../src/platform/runtime/handler-operacao-viva";
import { PORTA_DE_REALIDADE_VERSION,lerRealidadeDeEntregas,
  type AparelhoReal,type UltimoLote,type RealidadeDeEntregas,type ViagensDeUmModo }
  from "../../src/platform/leitura/realidade-de-entregas";
import { entregasVM } from "../../src/product/viewmodels/entregas-vm";
import type { SqlRow } from "../../src/platform/persistence/sql-client";
import { gerarLinhas,gravarLinhas,PERFIL_LOJA } from "./q026-replay-fixture";

const url=(process.env.DELIVERYOS_PG_URL??"").trim();
const modeBench=process.env.Q026_FULL_RSS_MODE;
const OUT=(process.env.Q026_FULL_RSS_OUT??"").trim();
const LONG=Number(process.env.Q026_FULL_RSS_N);
if(!url){console.error("Q026_FULL_MODEL_MEMORY_PG_REQUIRED");process.exit(78)}
if((modeBench!=="baseline"&&modeBench!=="compact")||!OUT||![120000,300000,1030000].includes(LONG))
  throw Error("Q026_FULL_RSS_MODE_OR_SIZE_INVALID");
assert.equal(typeof global.gc,"function","explicit node --expose-gc required");
const agora=PERFIL_LOJA.agora;
const N=6000,TOTAL=N+LONG;
const mode=(v:unknown):SourceMode|null=>typeof v==="string"&&SOURCE_MODES.includes(v as SourceMode)?v as SourceMode:null;
const iso=(v:unknown):string|null=>v===null||v===undefined?null:(v instanceof Date?v:new Date(String(v))).toISOString();
const snap={trips:[],occurrences:[],connection:"online",pending_sync:0,last_error:null} as unknown as UiSnapshot;
const mib=(n:number)=>+(n/1048576).toFixed(2);
const rssPeak=()=>+(process.resourceUsage().maxRSS/1024).toFixed(2);
async function gcClean(){for(let i=0;i<3;i++){global.gc?.();await new Promise<void>(r=>setImmediate(r))}}

function semIds(n:number):readonly string[]{
  return new Proxy({length:n},{
    get(t,p){if(p==="length")return t.length;throw Error("VM acessou ID forense "+String(p))},
    ownKeys(){throw Error("VM enumerou IDs forenses")}
  }) as unknown as readonly string[];
}
function toIso(v:unknown):string{
  const d=v instanceof Date?v:new Date(String(v));
  assert.ok(Number.isFinite(d.getTime()),"timestamp invalido no cursor");
  return d.toISOString();
}
function fromRow(l:SqlRow):EventEnvelope|null{
  if(!SOURCE_MODES.includes(l.source_mode as SourceMode))return null;
  let sequence:number|undefined;
  if(l.sequence_local!==null&&l.sequence_local!==undefined){
    const n=Number(l.sequence_local);
    if(!Number.isSafeInteger(n)||n<0)return null;
    sequence=n;
  }
  const event_id=String(l.event_id);
  return envelopeDaMensagem({
    outbox_id:"q026-shadow:"+event_id,
    kind:String(l.event_type),
    idempotency_key:String(l.idempotency_key),
    payload:{
      event_id,event_type:String(l.event_type),
      event_version:String(l.contract_version),
      unit_id:String(l.unit_id),
      trip_id:l.object_type==="trip"?String(l.object_id):undefined,
      device_id:l.device_id??undefined,
      occurred_at:toIso(l.occurred_at),
      received_at:l.recorded_at===null||l.recorded_at===undefined?undefined:toIso(l.recorded_at),
      clock_trust:l.clock_trust??undefined,origin:l.origin,
      source_mode:l.source_mode,sequence
    }
  });
}

const RANK:Record<string,number>={desconhecido:0,criada:1,em_rota:2,chegou:3,entregue:4,retornando:5,retornou:6,encerrada:7};
const NEXT:Record<string,string>={
  trip_created:"criada",trip_started:"em_rota",arrival_detected:"chegou",
  delivery_confirmed:"entregue",trip_return_started:"retornando",
  trip_returned:"retornou",trip_closed:"encerrada"
};
const cmp=(a:EventEnvelope,b:EventEnvelope)=>{
  const time=Date.parse(a.occurred_at)-Date.parse(b.occurred_at);
  if(time!==0)return time;
  const sequence=(a.sequence??0)-(b.sequence??0);
  if(sequence!==0)return sequence;
  return a.event_id.localeCompare(b.event_id);
};
/** One bounded reducer per (unit,mode,trip), NOT a forensic projection. */
class CompactTrip {
  readonly trip_id:string;
  readonly unit_id:string;
  readonly source_mode:SourceMode;
  estado:ViagemProjetada["estado"]="desconhecido";
  device_id:string|undefined;
  private deviceWinner:EventEnvelope|undefined;
  ultimo_fato_em:string|undefined;
  private lastMs=-Infinity;
  ocorrencias_abertas=0;
  ultima_posicao_em:string|undefined;
  private posMs=-Infinity;
  fatos=0;
  constructor(e:EventEnvelope){
    assert.ok(e.trip_id);
    this.trip_id=e.trip_id!;
    this.unit_id=e.unit_id;
    this.source_mode=e.source_mode;
  }
  accept(e:EventEnvelope){
    assert.deepEqual([e.unit_id,e.source_mode,e.trip_id],[this.unit_id,this.source_mode,this.trip_id]);
    const next=NEXT[e.event_type];
    if(next&&RANK[next]>RANK[this.estado])this.estado=next as ViagemProjetada["estado"];
    const t=Date.parse(e.occurred_at);
    assert.ok(Number.isFinite(t),"invalid timestamp");
    if(t>this.lastMs){this.lastMs=t;this.ultimo_fato_em=e.occurred_at}
    if(e.event_type==="gps_batch_received"){
      const position=instanteConfiavel(e);
      if(position){
        const p=Date.parse(position);
        if(p>this.posMs){this.posMs=p;this.ultima_posicao_em=position}
      }
    }
    if(e.device_id && (!this.deviceWinner||cmp(e,this.deviceWinner)>0)){
      this.deviceWinner=e;this.device_id=e.device_id;
    }
    if(e.event_type==="occurrence_created")this.ocorrencias_abertas++;
    this.fatos++;
  }
  result(agora:Date):ViagemProjetada{
    assert.ok(this.fatos>0&&this.ultimo_fato_em);
    return {
      trip_id:this.trip_id,unit_id:this.unit_id,estado:this.estado,
      device_id:this.device_id,ultimo_fato_em:this.ultimo_fato_em!,
      ocorrencias_abertas:this.ocorrencias_abertas,source_mode:this.source_mode,
      eventos:semIds(this.fatos),ultima_posicao_em:this.ultima_posicao_em,
      frescor:classificarFrescor(this.ultima_posicao_em,agora)
    };
  }
}


async function compactFull(b:Awaited<ReturnType<typeof bancoIsolado>>):Promise<{reality:RealidadeDeEntregas;tx_ms:number;max_batch:number;fetches:number}>{
  let unknown=0,invalid=0,maxBatch=0,fetches=0,seen=0;
  const scopes=new Map<string,{unit_id:string;source_mode:SourceMode;viagens:ViagemProjetada[]}>();
  const txDevices:{lines:SqlRow[];latest:SqlRow[];counts:SqlRow[]}={lines:[],latest:[],counts:[]};
  const start=performance.now();
  await b.cliente.transaction(async tx=>{
    await tx.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY");
    const list=TIPOS_DA_OPERACAO_VIVA.map(t=>"'"+t.replace(/'/g,"''")+"'").join(",");
    await tx.query([
      "DECLARE q026_full_rss NO SCROLL CURSOR FOR",
      "SELECT event_id,unit_id,object_type,object_id,event_type,occurred_at,origin,",
      "device_id,sequence_local,idempotency_key,contract_version,source_mode,recorded_at,clock_trust",
      "FROM platform.event_log WHERE event_type IN ("+list+")",
      "ORDER BY unit_id,source_mode NULLS LAST,object_type,object_id"
    ].join(" "));
    let acc:CompactTrip|null=null,active:string|null=null;
    const flush=()=>{
      if(!acc)return;
      const item=acc.result(agora);
      const key=JSON.stringify([item.unit_id,item.source_mode]);
      const bucket=scopes.get(key)??{unit_id:item.unit_id,source_mode:item.source_mode,viagens:[]};
      bucket.viagens.push(item);scopes.set(key,bucket);
      acc=null;
    };
    for(;;){
      const rows=await tx.query("FETCH FORWARD 257 FROM q026_full_rss");
      maxBatch=Math.max(maxBatch,rows.length);
      if(rows.length===0)break;
      fetches++;
      for(const row of rows){
        if(row.source_mode===null||row.source_mode===undefined){unknown++;continue}
        const e=fromRow(row);
        if(!e){invalid++;continue}
        seen++;
        const scope=JSON.stringify([e.unit_id,e.source_mode]);
        if(!scopes.has(scope))scopes.set(scope,{unit_id:e.unit_id,source_mode:e.source_mode,viagens:[]});
        if(!e.trip_id)continue;
        const key=JSON.stringify([e.unit_id,e.source_mode,e.trip_id]);
        if(active!==null&&active!==key)flush();
        active=key;
        if(!acc)acc=new CompactTrip(e);
        acc.accept(e);
      }
    }
    flush();
    await tx.query("CLOSE q026_full_rss");
      txDevices.lines=await tx.query(
        "SELECT d.device_id,d.unit_id,d.actor_id,d.label,d.registered_at,d.secret_bound_at,"+
        "d.last_session_at,d.app_version,d.revoked_at,d.queue_pending_points,"+
        "d.queue_pending_events,d.queue_depth_reported_at FROM identity.device d "+
        "ORDER BY d.unit_id,d.device_id");
      txDevices.latest=await tx.query(
        "SELECT DISTINCT ON (device_id) device_id,occurred_at,recorded_at,"+
        "object_type,object_id,source_mode,correlation_id,clock_trust "+
        "FROM platform.event_log WHERE event_type='gps_batch_received' AND device_id IS NOT NULL "+
        "ORDER BY device_id,recorded_at DESC,sequence_local DESC NULLS LAST");

      txDevices.counts=await tx.query(
        "SELECT device_id,source_mode,count(*)::int AS n FROM platform.event_log "+
        "WHERE event_type='gps_batch_received' AND device_id IS NOT NULL "+
        "GROUP BY device_id,source_mode");

  });
  const txMs=performance.now()-start;
  assert.equal(unknown,1);
  assert.equal(invalid,1);
  assert.equal(seen,TOTAL+1);
  assert.ok(maxBatch<=257);
    const latestBy=new Map<string,UltimoLote>();
    for(const u of txDevices.latest){
      latestBy.set(String(u.device_id),{
        occurred_at:iso(u.occurred_at)!,recorded_at:iso(u.recorded_at)!,
        relogio:relogioEfetivo({occurred_at:u.occurred_at,received_at:u.recorded_at,clock_trust:u.clock_trust}),
        trip_id:u.object_type==="trip"?String(u.object_id):null,
        source_mode:mode(u.source_mode),
        correlation_id:u.correlation_id===null?null:String(u.correlation_id)
      });
    }
    const countBy=new Map<string,Record<SourceMode,number>>();
    for(const c of txDevices.counts){
      const id=String(c.device_id);
      const current=countBy.get(id)??{real:0,simulated:0,control:0};
      const m=mode(c.source_mode);
      if(m)current[m]+=Number(c.n);
      countBy.set(id,current);
    }
    const appliances:AparelhoReal[]=txDevices.lines.map(l=>({
      device_id:String(l.device_id),unit_id:String(l.unit_id),
      actor_id:l.actor_id===null?null:String(l.actor_id),
      label:String(l.label),autorizado_em:iso(l.registered_at)!,
      credencial_vinculada_em:iso(l.secret_bound_at),
      ultima_sessao_em:iso(l.last_session_at),
      app_version:l.app_version===null?null:String(l.app_version),
      revogado_em:iso(l.revoked_at),
      fila_offline:l.queue_depth_reported_at!==null&&l.queue_depth_reported_at!==undefined&&
        l.queue_pending_points!==null&&l.queue_pending_points!==undefined&&
        l.queue_pending_events!==null&&l.queue_pending_events!==undefined
          ?{pending_points:Number(l.queue_pending_points),pending_events:Number(l.queue_pending_events),
            reportada_em:iso(l.queue_depth_reported_at)!}:null,
      fatos_por_modo:countBy.get(String(l.device_id))??{real:0,simulated:0,control:0},
      ultimo_lote:latestBy.get(String(l.device_id))??null
    }));

  const reality:RealidadeDeEntregas={
    versao:PORTA_DE_REALIDADE_VERSION,fonte:"postgresql",lida_em:agora.toISOString(),
    aparelhos:appliances,historico_sem_modo:unknown,
    projecoes:[...scopes.values()]
      .sort((a,b)=>(a.unit_id+"|"+a.source_mode).localeCompare(b.unit_id+"|"+b.source_mode))
      .map(p=>({...p,viagens:p.viagens.sort((a,b)=>a.trip_id.localeCompare(b.trip_id))})) as ViagensDeUmModo[]
  };
  return {reality,tx_ms:txMs,max_batch:maxBatch,fetches};
}
const flat=(v:ViagemProjetada)=>({
  trip_id:v.trip_id,unit_id:v.unit_id,estado:v.estado,device_id:v.device_id,
  ultimo_fato_em:v.ultimo_fato_em,ocorrencias_abertas:v.ocorrencias_abertas,
  source_mode:v.source_mode,fatos:v.eventos.length,
  ultima_posicao_em:v.ultima_posicao_em,frescor:v.frescor
});
const digest=(r:RealidadeDeEntregas)=>{
  const simplified={
    versao:r.versao,fonte:r.fonte,lida_em:r.lida_em,
    aparelhos:r.aparelhos,
    historico_sem_modo:r.historico_sem_modo,
    projecoes:r.projecoes.map(p=>({
      unit_id:p.unit_id,source_mode:p.source_mode,viagens:p.viagens.map(flat)
    }))
  };
  const vms=[null,"ITAIM","LAB-BANCADA","SEM-UNIDADE"].map(unidade=>
    entregasVM(snap,agora.toISOString(),null,{disponivel:true,realidade:r},{unidade}));
  return createHash("sha256").update(JSON.stringify({simplified,vms})).digest("hex");
};

void(async()=>{
  const b=await bancoIsolado(url,"0002_event_log_contexto_dispositivo","q026fullrss");
  try{
    await b.cliente.query([
      "INSERT INTO platform.event_log",
      "(event_id,unit_id,object_type,object_id,event_type,payload,occurred_at,",
      "origin,idempotency_key,contract_version,device_id,sequence_local)",
      "VALUES ('old-mode-null','ITAIM','trip','T-OLD','trip_started','{}',",
      "'2026-09-01T10:00:00Z','device','old-mode-null','trip_started@1.0.0','DEV-01',1)"
    ].join(" "));
    await b.migrarTudo();
    await b.cliente.query("INSERT INTO identity.unit(unit_id,display_name) VALUES ('ITAIM','Itaim'),('LAB-BANCADA','Lab')");
    const dados=gerarLinhas({
      ...PERFIL_LOJA,fatos:N,semente:1347,aparelhos:16,pontos_por_viagem:80,
      unidades:["ITAIM","LAB-BANCADA"],empates:0.06,atrasados:0.07,suspeitos:0.04
    });
    const devices=new Set(dados.map(d=>JSON.stringify([d.device_id,d.unit_id])));
    for(const x of devices){
      const [id,unit]=JSON.parse(x) as [string,string];
      await b.cliente.query("INSERT INTO identity.device(device_id,unit_id,label) VALUES ($1,$2,$1)",[id,unit]);
    }
    await gravarLinhas(b.cliente,[...dados].sort((a,b)=>a.recorded_at.localeCompare(b.recorded_at)));
    // Exercise nullable and populated device fields, plus an authorized silent device.
    await b.cliente.query(
      "INSERT INTO identity.device(device_id,unit_id,label) VALUES ('DEV-NO-GPS','ITAIM','No telemetry')");
    await b.cliente.query(
      "UPDATE identity.device SET app_version='2026.10-shadow',secret_bound_at=$1,"+
      "queue_pending_points=3,queue_pending_events=2,queue_depth_reported_at=$1 "+
      "WHERE device_id='DEV-01' AND unit_id='ITAIM'",["2026-10-09T22:00:00Z"]);
    await b.cliente.query([
      "INSERT INTO platform.event_log (event_id,unit_id,object_type,object_id,event_type,payload,",
      "occurred_at,recorded_at,origin,idempotency_key,contract_version,source_mode,sequence_local,device_id)",
      "VALUES ('bad-sequence-ui','ITAIM','trip','T-BAD','trip_started','{}',",
      "'2026-10-09T13:00:00Z','2026-10-09T13:00:01Z','device','bad-sequence-ui','trip_started@1.0.0','real',",
      "9223372036854775807,'DEV-01'),",
      "('device-without-trip','ITAIM','device','DEV-01','gps_batch_received','{}',",
      "'2026-09-01T09:00:00Z','2026-09-01T09:00:01Z','device','device-without-trip',",
      "'gps_batch_received@1.0.0','real',9,'DEV-01')"
    ].join(" "));

    // LONG trip is purposely mixed into the SAME unit + mode as short trips.
    // Distinct SQL-generated unique IDs do not reuse the short-trip fixture.
    const longSql=[
      "INSERT INTO platform.event_log (event_id,unit_id,object_type,object_id,event_type,payload,",
      "occurred_at,recorded_at,origin,idempotency_key,contract_version,source_mode,sequence_local,device_id,clock_trust)",
      "SELECT 'extra-'||g,'ITAIM','trip','Q026-ONE-LONG',",
      "CASE WHEN g=1 THEN 'trip_started' WHEN g%201=0 THEN 'trip_closed'",
      "WHEN g%37=0 THEN 'occurrence_created' WHEN g%17=0 THEN 'trip_return_started'",
      "ELSE 'gps_batch_received' END, '{}'::jsonb,",
      "TIMESTAMPTZ '2026-10-09T18:00:00Z'+((g%500)::double precision*interval '0.2 second'),",
      "TIMESTAMPTZ '2026-10-09T18:00:00Z'+((g%500)::double precision*interval '0.2 second')+",
      "(CASE WHEN g%23=0 THEN interval '300 second' ELSE interval '0 second' END),",
      "'device','extra-key-'||g,",
      "(CASE WHEN g=1 THEN 'trip_started' WHEN g%201=0 THEN 'trip_closed'",
      "WHEN g%37=0 THEN 'occurrence_created' WHEN g%17=0 THEN 'trip_return_started'",
      "ELSE 'gps_batch_received' END)||'@1.0.0','simulated',",
      "CASE WHEN g%13=0 THEN NULL ELSE (g%5)::bigint END,",
      "CASE WHEN g%11=0 THEN NULL ELSE 'DEV-01' END,",
      "CASE WHEN g%23=0 THEN 'suspect' ELSE 'trusted' END",
      "FROM generate_series($1::integer,$2::integer) g"
    ].join(" ");
    for(let g=1;g<=LONG;g+=30000)
      await b.cliente.query(longSql,[g,Math.min(LONG,g+29999)]);

    await gcClean();
    const rss_after_fixture_mib=mib(process.memoryUsage().rss);
    const peak_after_fixture_mib=rssPeak();
    const started=performance.now();
    const data=modeBench==="baseline"
      ? {reality:await lerRealidadeDeEntregas(b.cliente,{agora}),tx_ms:null,max_batch:null,fetches:null}
      : await compactFull(b);
    const resultHash=digest(data.reality);
    const operationMs=performance.now()-started;
    assert.equal(data.reality.historico_sem_modo,1);
    assert.equal(data.reality.aparelhos.length,16);
    assert.equal(data.reality.projecoes.flatMap(p=>p.viagens).reduce((n,v)=>n+v.eventos.length,0),TOTAL);
    assert.equal(data.reality.projecoes.flatMap(p=>p.viagens).find(v=>v.trip_id==="Q026-ONE-LONG")?.eventos.length,LONG);
    const beforeGc=mib(process.memoryUsage().rss);
    await gcClean();
    const output={
      mode:modeBench,n:LONG,total_events:TOTAL,hash:resultHash,
      peak_rss_mib:rssPeak(),rss_after_fixture_mib,peak_after_fixture_mib,
      rss_after_reader_mib:beforeGc,rss_after_gc_mib:mib(process.memoryUsage().rss),
      full_reader_ms:+operationMs.toFixed(2),
      transaction_ms:data.tx_ms===null?null:+data.tx_ms.toFixed(2),
      max_batch:data.max_batch,fetches:data.fetches,
      device_count:data.reality.aparelhos.length,scopes:data.reality.projecoes.length,
      note:"same deterministic fixtures on independent Node processes and PG16 databases; no writes during RSS runs; Q016 not replaced"
    };
    writeFileSync(OUT,JSON.stringify(output,null,2));
    console.log("Q026_FULL_RR_RSS_RESULT "+JSON.stringify(output));
  }finally{await b.descartar()}
})().catch(e=>{console.error(e);process.exitCode=1});
