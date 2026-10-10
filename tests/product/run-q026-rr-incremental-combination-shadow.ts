/**
 * Q026 SHADOW: real PostgreSQL cursor (mixed modes and units, UNKNOWN + corrupt)
 * plus 120k events in ONE trip vs canonical -> complete EntregasVM. No runtime
 * edits, no production DB, no concurrent append/snapshot equivalence claim.
 */
import assert from "node:assert/strict";
import type { UiSnapshot } from "../../src/entregas/ui/adapters/UiApplicationFacade";
import { SOURCE_MODES, type EventEnvelope, type SourceMode } from "../../src/platform/contracts/event-catalog";
import { bancoIsolado } from "../../src/platform/banco-isolado";
import { createPgClient } from "../../src/platform/persistence/sql-client";
import { performance } from "node:perf_hooks";
import { envelopeDaMensagem } from "../../src/platform/projections/consumidor";
import { classificarFrescor, type ViagemProjetada } from "../../src/platform/projections/operacao-viva";
import { instanteConfiavel } from "../../src/platform/contracts/relogio";
import { lerFatosParaReplay } from "../../src/platform/projections/replay-do-event-log";
import { TIPOS_DA_OPERACAO_VIVA } from "../../src/platform/runtime/handler-operacao-viva";
import type { SqlRow } from "../../src/platform/persistence/sql-client";
import type { RealidadeDeEntregas, ViagensDeUmModo } from "../../src/platform/leitura/realidade-de-entregas";
import { lerRealidadeDeEntregas } from "../../src/platform/leitura/realidade-de-entregas";
import { entregasVM } from "../../src/product/viewmodels/entregas-vm";
import { gerarLinhas, gravarLinhas, PERFIL_LOJA } from "./q026-replay-fixture";

const url=(process.env.DELIVERYOS_PG_URL??"").trim();
if(!url){console.error("Q026_MIXED_CURSOR_PG_REQUIRED");process.exit(78)}
const agora=PERFIL_LOJA.agora;
const N=6000;
const LONG=120000;
const TOTAL=N+LONG;
let checks=0;
function ok(t:string){checks++;console.log("  ok MIX"+checks+" "+t)}
const snap={trips:[],occurrences:[],connection:"online",pending_sync:0,last_error:null} as unknown as UiSnapshot;
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

void(async()=>{
  const b=await bancoIsolado(url,"0002_event_log_contexto_dispositivo","q026rrinc");
  const writer=await createPgClient({url:b.url,max:1,statementTimeoutMs:60000});
  const observer=await createPgClient({url:b.url,max:1,statementTimeoutMs:60000});
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
    const original=await lerRealidadeDeEntregas(b.cliente,{agora});
    const reference=await lerFatosParaReplay(b.cliente,TIPOS_DA_OPERACAO_VIVA);
    assert.equal(reference.lidas,TOTAL+3);
    assert.equal(reference.aptos.length,TOTAL+1);
    assert.equal(reference.sem_modo,1);
    assert.deepEqual(reference.corrompidas.map(x=>x.event_id),["bad-sequence-ui"]);
    assert.equal(original.historico_sem_modo,1);
    assert.equal(original.projecoes.flatMap(p=>p.viagens).reduce((n,v)=>n+v.eventos.length,0),TOTAL);
    assert.equal(original.projecoes.flatMap(p=>p.viagens).find(v=>v.trip_id==="Q026-ONE-LONG")?.eventos.length,LONG);
    ok("Q016 separa eventos aptos, fato device, UNKNOWN e corrompido");

    let seen=0,unknown=0,invalid=0,nonTrip=0,maxGroup=0,groups=0,batches=0,maxBuffer=0;
    const scopes=new Map<string,{unit_id:string;source_mode:SourceMode;viagens:ViagemProjetada[]}>();
    let rrPid=0, injected=false, xminPinned=false, writerCommitted=false;
    const transactionStart=performance.now();
    await b.cliente.transaction(async tx=>{
      await tx.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY");
      // Force the RR snapshot before an independent connection writes.
      rrPid=Number((await tx.query("SELECT pg_backend_pid()::int AS pid"))[0].pid);
      assert.ok(rrPid>0);
      const list=TIPOS_DA_OPERACAO_VIVA.map(t=>"'"+t.replace(/'/g,"''")+"'").join(",");
      await tx.query([
        "DECLARE q026_mixed NO SCROLL CURSOR FOR",
        "SELECT event_id,unit_id,object_type,object_id,event_type,occurred_at,origin,",
        "device_id,sequence_local,idempotency_key,contract_version,source_mode,recorded_at,clock_trust",
        "FROM platform.event_log WHERE event_type IN ("+list+")",
        "ORDER BY unit_id,source_mode NULLS LAST,object_type,object_id"
      ].join(" "));
      let acc:CompactTrip|null=null;
      let active:string|null=null;
      const flush=()=>{
        if(!acc)return;
        const a:CompactTrip=acc;
        maxGroup=Math.max(maxGroup,a.fatos);
        const item=a.result(agora);
        const key=JSON.stringify([item.unit_id,item.source_mode]);
        const bucket=scopes.get(key)??{unit_id:item.unit_id,source_mode:item.source_mode,viagens:[]};
        bucket.viagens.push(item);
        scopes.set(key,bucket);
        groups++;
        acc=null;
      };
      for(;;){
        const rows=await tx.query("FETCH FORWARD 257 FROM q026_mixed");
        maxBuffer=Math.max(maxBuffer,rows.length);
        if(!rows.length)break;
        batches++;
        if(!injected){
          injected=true;
          const before=await observer.query("SELECT backend_xmin::text AS xmin FROM pg_stat_activity WHERE pid=$1",[rrPid]);
          assert.ok(before.length===1&&before[0].xmin,"RR snapshot not pinned during FETCH");
          xminPinned=true;
          // This new trip GPS is committed AFTER cursor starts, by an independent pool.
          const written=await writer.query(
            "INSERT INTO platform.event_log (event_id,unit_id,object_type,object_id,event_type,payload,"+
            "occurred_at,recorded_at,origin,idempotency_key,contract_version,source_mode,sequence_local,device_id,clock_trust) "+
            "VALUES ('q026-rr-incremental-append','ITAIM','trip','Q026-ONE-LONG','gps_batch_received','{}'::jsonb,"+
            "'2026-10-10T13:00:00Z','2026-10-10T13:00:01Z','device','q026-rr-incremental-append',"+
            "'gps_batch_received@1.0.0','simulated',999999,'DEV-01','trusted') RETURNING event_id"
          );
          assert.equal(written.length,1);
          writerCommitted=true;
          const after=await observer.query("SELECT backend_xmin::text AS xmin FROM pg_stat_activity WHERE pid=$1",[rrPid]);
          assert.equal(String(after[0].xmin),String(before[0].xmin),"RR xmin drifted after concurrent commit");
          const ghost=await tx.query("SELECT event_id FROM platform.event_log WHERE event_id='q026-rr-incremental-append'");
          assert.equal(ghost.length,0,"RR cursor and point query see different snapshots");
          const counts=await tx.query(
            "SELECT count(*)::int AS n FROM platform.event_log WHERE device_id='DEV-01' "+
            "AND source_mode='simulated' AND event_type='gps_batch_received'"
          );
          const expected=original.aparelhos.find(d=>d.device_id==="DEV-01"&&d.unit_id==="ITAIM");
          assert.ok(expected,"fixture lost canonical registered device");
          assert.equal(Number(counts[0].n),expected.fatos_por_modo.simulated,
            "RR device count diverges from canonical baseline after append");
        }
        for(const row of rows){
          if(row.source_mode===null||row.source_mode===undefined){unknown++;continue}
          const e=fromRow(row);
          if(!e){invalid++;continue}
          seen++;
          // Replay cria escopo para TODO fato apto, inclusive os que nao
          // possuem trip_id. O cursor nao pode apagar esse modo da UI.
          const scopeKey=JSON.stringify([e.unit_id,e.source_mode]);
          if(!scopes.has(scopeKey))scopes.set(scopeKey,{
            unit_id:e.unit_id,source_mode:e.source_mode,viagens:[]
          });
          if(!e.trip_id){nonTrip++;continue}
          const key=JSON.stringify([e.unit_id,e.source_mode,e.trip_id]);
          if(active!==null&&key!==active)flush();
          active=key;
          if(!acc)acc=new CompactTrip(e);
          acc.accept(e);
        }
      }
      flush();
      await tx.query("CLOSE q026_mixed");
      const snapshotTotal=await tx.query("SELECT count(*)::int AS n FROM platform.event_log");
      assert.equal(Number(snapshotTotal[0].n),TOTAL+3,"RR transaction leaked concurrent fact");
    });
    const transactionMs=+(performance.now()-transactionStart).toFixed(2);
    const observed=await observer.query("SELECT backend_xmin::text AS xmin FROM pg_stat_activity WHERE pid=$1",[rrPid]);
    assert.equal(observed[0]?.xmin,null,"RR backend_xmin remained pinned after COMMIT");
    assert.ok(injected&&xminPinned&&writerCommitted,"concurrent independent write not observed");
    const next=await lerRealidadeDeEntregas(b.cliente,{agora});
    const nextTrip=next.projecoes.flatMap(p=>p.viagens).find(v=>v.trip_id==="Q026-ONE-LONG");
    assert.equal(nextTrip?.eventos.length,LONG+1,"next snapshot did not see confirmed GPS");
    const oldDevice=original.aparelhos.find(d=>d.device_id==="DEV-01"&&d.unit_id==="ITAIM");
    const newDevice=next.aparelhos.find(d=>d.device_id==="DEV-01"&&d.unit_id==="ITAIM");
    assert.ok(oldDevice&&newDevice);
    assert.equal(newDevice.fatos_por_modo.simulated,oldDevice.fatos_por_modo.simulated+1);
    ok("RR cursor snapshot ignores confirmed concurrent GPS; next canonical snapshot sees it; xmin released");
    assert.equal(seen,TOTAL+1);
    assert.equal(unknown,1);
    assert.equal(invalid,1);
    assert.equal(nonTrip,1);
    assert.equal(scopes.size,original.projecoes.length,"escopos devem ser os observados pelo replay, nao inventados");
    assert.deepEqual([...new Set([...scopes.values()].map(p=>p.unit_id))].sort(),["ITAIM","LAB-BANCADA"]);
    assert.deepEqual([...new Set([...scopes.values()].map(p=>p.source_mode))].sort(),["control","real","simulated"]);
    assert.ok(batches>=Math.ceil((TOTAL+3)/257));
    assert.ok(maxBuffer<=257);
    assert.equal(maxGroup,LONG,"single LONG trip retained as counts only");
    ok("cursor PG FETCH 257: 5 escopos, UNKNOWN, corrupted, device-only, long-trip aggregate");
    const shadow:RealidadeDeEntregas={
      ...original,historico_sem_modo:unknown,
      projecoes:[...scopes.values()]
        .sort((a,b)=>(a.unit_id+"|"+a.source_mode).localeCompare(b.unit_id+"|"+b.source_mode))
        .map(p=>({...p,viagens:p.viagens.sort((a,b)=>a.trip_id.localeCompare(b.trip_id))})) as ViagensDeUmModo[]
    };
    const projected=original.projecoes.map(p=>({
      unit_id:p.unit_id,source_mode:p.source_mode,
      viagens:p.viagens.map(v=>({...v,eventos:semIds(v.eventos.length)}))
    }));
    assert.equal(JSON.stringify(shadow.projecoes.map(p=>[p.unit_id,p.source_mode,p.viagens.map(v=>v.eventos.length)])),
      JSON.stringify(projected.map(p=>[p.unit_id,p.source_mode,p.viagens.map(v=>v.eventos.length)])));
    ok("todos os escopos, viagens e contagens identicos ao replay");

    // Compare ALL projected fields, not just counts or UI; the actual
    // forensic event IDs are intentionally replaced by their length.
    const strip=(v:ViagemProjetada)=>({
      trip_id:v.trip_id,unit_id:v.unit_id,estado:v.estado,device_id:v.device_id,
      ultimo_fato_em:v.ultimo_fato_em,ocorrencias_abertas:v.ocorrencias_abertas,
      source_mode:v.source_mode,fatos:v.eventos.length,
      ultima_posicao_em:v.ultima_posicao_em,frescor:v.frescor
    });
    assert.deepEqual(shadow.projecoes.map(p=>({
      unit_id:p.unit_id,source_mode:p.source_mode,viagens:p.viagens.map(strip)
    })),original.projecoes.map(p=>({
      unit_id:p.unit_id,source_mode:p.source_mode,viagens:p.viagens.map(strip)
    })),"ALL UI projection fields differ from Q016 canonical result");


    // Contraprova de ordem: em vez da ordem física do cursor anterior,
    // entregar a MESMA viagem longa em ordem cronológica INVERTIDA. Se o
    // redutor depender de arrival order, ultimo device/position/state muda.
    let inverso:CompactTrip|null=null;
    let inverseSeen=0,inverseBatches=0,inverseMax=0;
    await b.cliente.transaction(async tx=>{
      await tx.query("SET TRANSACTION READ ONLY");
      await tx.query([
        "DECLARE q026_inverse NO SCROLL CURSOR FOR",
        "SELECT event_id,unit_id,object_type,object_id,event_type,occurred_at,origin,",
        "device_id,sequence_local,idempotency_key,contract_version,source_mode,recorded_at,clock_trust",
        "FROM platform.event_log WHERE object_type='trip' AND object_id='Q026-ONE-LONG'",
        "ORDER BY occurred_at DESC, sequence_local DESC NULLS LAST, event_id DESC"
      ].join(" "));
      for(;;){
        const rows=await tx.query("FETCH FORWARD 257 FROM q026_inverse");
        if(!rows.length)break;
        inverseBatches++;inverseMax=Math.max(inverseMax,rows.length);
        for(const row of rows){
          const e=fromRow(row);
          assert.ok(e && e.trip_id==="Q026-ONE-LONG");
          if(!inverso)inverso=new CompactTrip(e);
          inverso.accept(e);
          inverseSeen++;
        }
      }
      await tx.query("CLOSE q026_inverse");
    });
    assert.equal(inverseSeen,LONG);
    assert.ok(inverseBatches>=Math.ceil(LONG/257));
    assert.ok(inverseMax<=257);
    assert.ok(inverso);
    const inverted:ViagemProjetada=(inverso as CompactTrip).result(agora);
    const referenceLong=original.projecoes.flatMap(p=>p.viagens)
      .find(v=>v.trip_id==="Q026-ONE-LONG");
    assert.ok(referenceLong);
    assert.deepEqual(strip(inverted),strip(referenceLong),
      "120k eventos em ordem inversa mudaram o resultado da viagem");
    assert.notDeepEqual(strip({...inverted,device_id:"DISPOSITIVO-ERRADO"}),strip(referenceLong),
      "mutante de desempate do ultimo device nao foi detectado");
    ok("ordem cronologica inversa de 120k fatos + mutante device detectados");

    for(const unit of [null,"ITAIM","LAB-BANCADA","SEM-UNIDADE"]){
      const opts={unidade:unit};
      const baseline=entregasVM(snap,agora.toISOString(),null,{disponivel:true,realidade:original},opts);
      const candidate=entregasVM(snap,agora.toISOString(),null,{disponivel:true,realidade:shadow},opts);
      assert.deepEqual(candidate,baseline,"VM divergiu: "+unit);
      assert.equal(JSON.stringify(candidate),JSON.stringify(baseline),"JSON divergiu: "+unit);
    }
    ok("view model inteiro igual em quatro filtros, sem IDs individuais");
    assert.equal(shadow.projecoes.reduce((n,p)=>n+p.viagens.reduce((m,v)=>m+v.eventos.length,0),0),TOTAL);
    assert.equal(shadow.historico_sem_modo,1);
    // Contraexemplo: o replay possui um escopo com fato DEVICE, mas sem viagem.
    // Preservar esse escopo e exigencia do CONTRATO de leitura, mesmo quando
    // a UI atual nao tem campo para ele. Nao usar a UI como prova dessa lacuna.
    const empty=shadow.projecoes.find(p=>p.viagens.length===0);
    assert.ok(empty,"fixture deve conter escopo valido sem viagem");
    const withoutEmpty={...shadow,projecoes:shadow.projecoes.filter(p=>p!==empty)};
    const signature=(r:RealidadeDeEntregas)=>r.projecoes.map(p=>[p.unit_id,p.source_mode,p.viagens.length]);
    assert.notDeepEqual(signature(withoutEmpty),signature(original),
      "sem modo apenas de DEVICE passou despercebido pelo contrato");
    const vmWithEmpty=entregasVM(snap,agora.toISOString(),null,{disponivel:true,realidade:shadow});
    const vmWithoutEmpty=entregasVM(snap,agora.toISOString(),null,{disponivel:true,realidade:withoutEmpty});
    const uiObserva=JSON.stringify(vmWithEmpty)!==JSON.stringify(vmWithoutEmpty);
    ok("controle negativo: retirar escopo sem trip viola CONTRATO; UI percebe="+uiObserva);
    // Controle de mutacao da propria UI: mudar contagem de uma viagem TEM que
    // afetar o modelo da tela (nao aceitar igualdade cega).
    const firstScope=shadow.projecoes.find(p=>p.viagens.length>0)!;
    const withFalseCount:RealidadeDeEntregas={
      ...shadow,
      projecoes:shadow.projecoes.map(p=>p!==firstScope?p:{
        ...p,viagens:p.viagens.map((v,i)=>i===0?{
          ...v,eventos:semIds(v.eventos.length+1)
        }:v)
      })
    };
    const mutatedVm=entregasVM(snap,agora.toISOString(),null,{disponivel:true,realidade:withFalseCount});
    assert.notEqual(JSON.stringify(mutatedVm),JSON.stringify(vmWithEmpty),
      "sentinela cega: um fato a mais nao altera a UI");
    ok("controle negativo de UI: contagem +1 altera a apresentacao");
    assert.ok(maxGroup>1);
    ok("contabilidade integral sem inventar T-BAD");
    console.log("Q026_RR_INCREMENTAL_SHADOW_PASS "+JSON.stringify({
      rr_transaction_ms:transactionMs,
      rss_after_canonical_and_shadow_mib:+(process.memoryUsage().rss/1048576).toFixed(2),
      memory_note:"RSS is contaminated by the canonical baseline retained in this same process: NOT an A/B memory proof",
      checks,events:TOTAL,long_trip:LONG,device_only:nonTrip,unknown,invalid,groups,
      max_group:maxGroup,max_buffer:maxBuffer,fetch_size:257,batches,scopes:scopes.size,filters:4,
      boundary:"devices reused from canonical, SQL cursor groups may change under concurrency; no snapshot proof"
    }));
  }finally{await writer.close();await observer.close();await b.descartar()}
})().catch(e=>{console.error(e);process.exitCode=1});
