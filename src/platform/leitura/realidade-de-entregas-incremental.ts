/** Q-026 opt-in shadow implementation, from verified PR #52 full-model experiment.
 * One PostgreSQL REPEATABLE READ READ ONLY transaction, FETCH <=257.
 * NOT forensic Q-016 replay: trip.eventos is count-backed, not event IDs.
 */
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { SOURCE_MODES, type EventEnvelope, type SourceMode } from "../contracts/event-catalog";
import { envelopeDaMensagem } from "../projections/consumidor";
import { classificarFrescor, type ViagemProjetada } from "../projections/operacao-viva";
import { instanteConfiavel, relogioEfetivo } from "../contracts/relogio";
import { TIPOS_DA_OPERACAO_VIVA } from "../runtime/handler-operacao-viva";
import { PORTA_DE_REALIDADE_VERSION, type AparelhoReal, type UltimoLote, type RealidadeDeEntregas, type ViagensDeUmModo } from "./realidade-de-entregas";
import type { SqlRow, TransactionalSqlClient } from "../persistence/sql-client";
const mode=(v:unknown):SourceMode|null=>typeof v==="string"&&SOURCE_MODES.includes(v as SourceMode)?v as SourceMode:null;
const iso=(v:unknown):string|null=>v===null||v===undefined?null:(v instanceof Date?v:new Date(String(v))).toISOString();

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


export async function lerRealidadeDeEntregasIncremental(cliente: TransactionalSqlClient, opcoes: { agora: Date; unit_id?: string }): Promise<RealidadeDeEntregas> {
  const agora=opcoes.agora;
  let unknown=0,invalid=0,maxBatch=0,fetches=0,seen=0;
  const scopes=new Map<string,{unit_id:string;source_mode:SourceMode;viagens:ViagemProjetada[]}>();
  const txDevices:{lines:SqlRow[];latest:SqlRow[];counts:SqlRow[]}={lines:[],latest:[],counts:[]};
  const start=performance.now();
  await cliente.transaction(async tx=>{
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
        (opcoes.unit_id?"WHERE d.unit_id = $1 ":"")+"ORDER BY d.unit_id,d.device_id",
        opcoes.unit_id?[opcoes.unit_id]:[]);
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
    projecoes:[...scopes.values()].filter(x=>!opcoes.unit_id||x.unit_id===opcoes.unit_id)
      .sort((a,b)=>(a.unit_id+"|"+a.source_mode).localeCompare(b.unit_id+"|"+b.source_mode))
      .map(p=>({...p,viagens:p.viagens.sort((a,b)=>a.trip_id.localeCompare(b.trip_id))})) as ViagensDeUmModo[]
  };
  return reality;
}
