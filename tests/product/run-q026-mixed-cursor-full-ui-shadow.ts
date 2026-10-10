/**
 * Q026 SHADOW: real PostgreSQL cursor (mixed modes and units, UNKNOWN + corrupt)
 * vs canonical lerRealidadeDeEntregas -> COMPLETE EntregasVM output. No runtime
 * edits, no production DB, no concurrent append/snapshot equivalence claim.
 */
import assert from "node:assert/strict";
import type { UiSnapshot } from "../../src/entregas/ui/adapters/UiApplicationFacade";
import { SOURCE_MODES, type EventEnvelope, type SourceMode } from "../../src/platform/contracts/event-catalog";
import { bancoIsolado } from "../../src/platform/banco-isolado";
import { envelopeDaMensagem } from "../../src/platform/projections/consumidor";
import { projetar, type ViagemProjetada } from "../../src/platform/projections/operacao-viva";
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
void(async()=>{
  const b=await bancoIsolado(url,"0002_event_log_contexto_dispositivo","q026mix");
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
    const original=await lerRealidadeDeEntregas(b.cliente,{agora});
    const reference=await lerFatosParaReplay(b.cliente,TIPOS_DA_OPERACAO_VIVA);
    assert.equal(reference.lidas,N+3);
    assert.equal(reference.aptos.length,N+1);
    assert.equal(reference.sem_modo,1);
    assert.deepEqual(reference.corrompidas.map(x=>x.event_id),["bad-sequence-ui"]);
    assert.equal(original.historico_sem_modo,1);
    assert.equal(original.projecoes.flatMap(p=>p.viagens).reduce((n,v)=>n+v.eventos.length,0),N);
    ok("Q016 separa eventos aptos, fato device, UNKNOWN e corrompido");

    let seen=0,unknown=0,invalid=0,nonTrip=0,maxGroup=0,groups=0,batches=0;
    const scopes=new Map<string,{unit_id:string;source_mode:SourceMode;viagens:ViagemProjetada[]}>();
    await b.cliente.transaction(async tx=>{
      await tx.query("SET TRANSACTION READ ONLY");
      const list=TIPOS_DA_OPERACAO_VIVA.map(t=>"'"+t.replace(/'/g,"''")+"'").join(",");
      await tx.query([
        "DECLARE q026_mixed NO SCROLL CURSOR FOR",
        "SELECT event_id,unit_id,object_type,object_id,event_type,occurred_at,origin,",
        "device_id,sequence_local,idempotency_key,contract_version,source_mode,recorded_at,clock_trust",
        "FROM platform.event_log WHERE event_type IN ("+list+")",
        "ORDER BY unit_id,source_mode NULLS LAST,object_type,object_id"
      ].join(" "));
      let buffer:EventEnvelope[]=[];
      let active:string|null=null;
      const flush=()=>{
        if(!buffer.length)return;
        const first=buffer[0];
        maxGroup=Math.max(maxGroup,buffer.length);
        const p=projetar(buffer,{agora,unit_id:first.unit_id,source_mode:first.source_mode});
        assert.equal(p.viagens.length,1,"cursor deve gerar 1 viagem por grupo");
        const scope=JSON.stringify([first.unit_id,first.source_mode]);
        const bucket=scopes.get(scope)??{unit_id:first.unit_id,source_mode:first.source_mode,viagens:[]};
        const item=p.viagens[0];
        bucket.viagens.push({...item,eventos:semIds(item.eventos.length)});
        scopes.set(scope,bucket);groups++;buffer=[];
      };
      for(;;){
        const rows=await tx.query("FETCH FORWARD 3 FROM q026_mixed");
        if(!rows.length)break;
        batches++;
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
          active=key;buffer.push(e);
        }
      }
      flush();
      await tx.query("CLOSE q026_mixed");
    });
    assert.equal(seen,N+1);
    assert.equal(unknown,1);
    assert.equal(invalid,1);
    assert.equal(nonTrip,1);
    assert.equal(scopes.size,original.projecoes.length,"escopos devem ser os observados pelo replay, nao inventados");
    assert.deepEqual([...new Set([...scopes.values()].map(p=>p.unit_id))].sort(),["ITAIM","LAB-BANCADA"]);
    assert.deepEqual([...new Set([...scopes.values()].map(p=>p.source_mode))].sort(),["control","real","simulated"]);
    assert.ok(batches>Math.ceil(N/3));
    ok("cursor PG FETCH 3: escopos CANONICOS, UNKNOWN, corrompido e fato sem viagem");
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

    for(const unit of [null,"ITAIM","LAB-BANCADA","SEM-UNIDADE"]){
      const opts={unidade:unit};
      const baseline=entregasVM(snap,agora.toISOString(),null,{disponivel:true,realidade:original},opts);
      const candidate=entregasVM(snap,agora.toISOString(),null,{disponivel:true,realidade:shadow},opts);
      assert.deepEqual(candidate,baseline,"VM divergiu: "+unit);
      assert.equal(JSON.stringify(candidate),JSON.stringify(baseline),"JSON divergiu: "+unit);
    }
    ok("view model inteiro igual em quatro filtros, sem IDs individuais");
    assert.equal(shadow.projecoes.reduce((n,p)=>n+p.viagens.reduce((m,v)=>m+v.eventos.length,0),0),N);
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
    console.log("Q026_MIXED_CURSOR_FULL_UI_PASS "+JSON.stringify({
      checks,events:N,device_only:nonTrip,unknown,invalid,groups,
      max_group:maxGroup,fetch_size:3,batches,scopes:scopes.size,filters:4,
      boundary:"devices reused from canonical, no concurrency/snapshot proof"
    }));
  }finally{await b.descartar()}
})().catch(e=>{console.error(e);process.exitCode=1});
