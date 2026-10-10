/**
 * Q-026 — suite adversarial da leitura agrupada por viagem.
 *
 * Banco PostgreSQL NOVO por execucao. Fatos somente sinteticos.
 * Reconstitui historico anterior a 0003 com migracoes REAIS; exige contagem
 * de UNKNOWN; nao finge que agrupamento de viagens equivale ao replay total.
 * ZERO alteracao de runtime/schema operacional.
 */
import assert from "node:assert/strict";
import { bancoIsolado } from "../../src/platform/banco-isolado";
import { SOURCE_MODES, type EventEnvelope, type SourceMode } from "../../src/platform/contracts/event-catalog";
import { envelopeDaMensagem } from "../../src/platform/projections/consumidor";
import { projetar, type ViagemProjetada } from "../../src/platform/projections/operacao-viva";
import { lerFatosParaReplay } from "../../src/platform/projections/replay-do-event-log";
import { TIPOS_DA_OPERACAO_VIVA } from "../../src/platform/runtime/handler-operacao-viva";
import type { SqlRow } from "../../src/platform/persistence/sql-client";

const url=(process.env.DELIVERYOS_PG_URL??"").trim();
if(!url){console.error("PULADO: sem PostgreSQL de teste");process.exit(78)}
const agora=new Date("2026-10-09T22:00:00.000Z");
let count=0;
const check=(title:string)=>{count++;console.log("  ok ADV"+count+" "+title)};
const eventTypes=TIPOS_DA_OPERACAO_VIVA;
assert.ok(eventTypes.includes("gps_batch_received")&&eventTypes.includes("trip_closed"));
type Fato={id:string;unit:string;obj:string;objectId:string;type:string;at:string;received:string;mode?:SourceMode;seq?:string;trust?:string;version?:string};
function iso(s:string){return new Date(s).toISOString()}
async function main(){
  // Historico antigo nasce com esquema anterior a coluna source_mode.
  const b=await bancoIsolado(url,"0002_event_log_contexto_dispositivo","q026ad");
  try{
    const insertBefore="INSERT INTO identity.unit (unit_id,display_name) VALUES ('ITAIM','Itaim'),('OUTRA','Outra')";
    await b.cliente.query(insertBefore);
    await b.cliente.query([
      "INSERT INTO platform.event_log",
      "(event_id,unit_id,object_type,object_id,event_type,payload,",
      "occurred_at,recorded_at,origin,idempotency_key,contract_version)",
      "VALUES ('old-unknown','ITAIM','trip','T-OLD','trip_started','{}',",
      "'2026-10-08T20:00:00Z','2026-10-09T20:00:00Z','device','old-unknown','trip_started@1.0.0')"
    ].join(" "));
    await b.migrarTudo();
    async function inserir(f:Fato){
      await b.cliente.query([
        "INSERT INTO platform.event_log",
        "(event_id,unit_id,object_type,object_id,event_type,payload,",
        "occurred_at,recorded_at,origin,idempotency_key,contract_version,source_mode,sequence_local,clock_trust)",
        "VALUES ($1,$2,$3,$4,$5,'{}'::jsonb,$6,$7,'device',$1,$8,$9,$10,$11)"
      ].join(" "),[f.id,f.unit,f.obj,f.objectId,f.type,iso(f.at),iso(f.received),f.version??f.type+"@1.0.0",f.mode,f.seq??null,f.trust??"trusted"]);
    }
    const exemplos:Fato[]=[
      {id:"r-start",unit:"ITAIM",obj:"trip",objectId:"T-SAME",type:"trip_started",at:"2026-10-08T01:00:00Z",received:"2026-10-08T01:00:10Z",mode:"real",seq:"1"},
      {id:"r-gps",unit:"ITAIM",obj:"trip",objectId:"T-SAME",type:"gps_batch_received",at:"2026-10-10T02:00:00Z",received:"2026-10-09T21:59:45Z",mode:"real",seq:"2",trust:"suspect"},
      {id:"r-close-late",unit:"ITAIM",obj:"trip",objectId:"T-SAME",type:"trip_closed",at:"2026-10-08T02:00:00Z",received:"2026-10-09T21:59:58Z",mode:"real",seq:"3"},
      {id:"s-start",unit:"ITAIM",obj:"trip",objectId:"T-SAME",type:"trip_started",at:"2026-10-09T20:59:00Z",received:"2026-10-09T20:59:01Z",mode:"simulated",seq:"1"},
      {id:"s-gps",unit:"ITAIM",obj:"trip",objectId:"T-SAME",type:"gps_batch_received",at:"2026-10-09T21:59:00Z",received:"2026-10-09T21:59:01Z",mode:"simulated",seq:"2"},
      {id:"c-close",unit:"ITAIM",obj:"trip",objectId:"T-CONTROL",type:"trip_closed",at:"2026-10-09T20:00:00Z",received:"2026-10-09T20:00:01Z",mode:"control"},
      {id:"o-start",unit:"OUTRA",obj:"trip",objectId:"T-OUTRA",type:"trip_started",at:"2026-10-09T20:00:00Z",received:"2026-10-09T20:00:01Z",mode:"real"},
      {id:"r-unknown-trip",unit:"ITAIM",obj:"trip",objectId:"T-GPS-ONLY",type:"gps_batch_received",at:"2026-10-09T21:58:00Z",received:"2026-10-09T21:58:00Z",mode:"real"},
      {id:"r-other-object",unit:"ITAIM",obj:"device",objectId:"D-1",type:"gps_batch_received",at:"2026-10-09T21:59:59Z",received:"2026-10-09T21:59:59Z",mode:"real"},
      {id:"invalid-sequence",unit:"ITAIM",obj:"trip",objectId:"T-CORRUPT",type:"trip_started",at:"2026-10-09T20:00:00Z",received:"2026-10-09T20:00:00Z",mode:"real",seq:"9223372036854775807"},
      {id:"r-second",unit:"ITAIM",obj:"trip",objectId:"T-OPEN",type:"trip_started",at:"2026-10-09T21:57:00Z",received:"2026-10-09T21:57:00Z",mode:"real"},
    ];
    for(const f of exemplos)await inserir(f);
    const old=await b.cliente.query("SELECT source_mode FROM platform.event_log WHERE event_id='old-unknown'");
    assert.equal(old[0].source_mode,null);check("linha pre-0003 preserva source_mode UNKNOWN sem backfill");

    const replay=await lerFatosParaReplay(b.cliente,eventTypes);
    assert.equal(replay.lidas,exemplos.length+1);
    assert.equal(replay.sem_modo,1);
    assert.deepEqual(replay.corrompidas.map(x=>x.event_id),["invalid-sequence"]);
    assert.equal(replay.aptos.length,exemplos.length-1);
    check("replay contabiliza historico UNKNOWN e sequencia fora do limite em quarentena");

    // Caminho Shadow: banco devolve fatos com todos os modos. Decoder central
    // da outbox e reutilizado; rejeita corrupcao com as mesmas guardas.
    const rows:EventEnvelope[]=[];
    let droppedUnknown=0,droppedBad=0,nonTrip=0;
    await b.cliente.transaction(async(tx)=>{
      await tx.query("SET TRANSACTION READ ONLY");
      const tipos=eventTypes.map(t=>"'"+t.replace(/'/g,"''")+"'").join(",");
      await tx.query("DECLARE q026a NO SCROLL CURSOR FOR SELECT event_id,unit_id,object_type,object_id,event_type,occurred_at,origin,device_id,sequence_local,idempotency_key,contract_version,source_mode,recorded_at,clock_trust FROM platform.event_log WHERE event_type IN ("+tipos+") ORDER BY unit_id,source_mode NULLS LAST,object_type,object_id");
      while(true){
        const lote=await tx.query("FETCH FORWARD 3 FROM q026a");
        if(!lote.length)break;
        for(const l of lote){
          if(l.source_mode===null){droppedUnknown++;continue}
          if(!SOURCE_MODES.includes(l.source_mode as SourceMode)){droppedBad++;continue}
          let seq:number|undefined;
          if(l.sequence_local!==null&&l.sequence_local!==undefined){
            const n=Number(l.sequence_local);
            if(!Number.isSafeInteger(n)||n<0){droppedBad++;continue}
            seq=n;
          }
          const toIso=(x:unknown)=>x instanceof Date?x.toISOString():new Date(String(x)).toISOString();
          const e=envelopeDaMensagem({
            outbox_id:"shadow:"+String(l.event_id),
            kind:String(l.event_type),
            idempotency_key:String(l.idempotency_key),
            payload:{
              event_id:String(l.event_id),
              event_type:String(l.event_type),
              event_version:String(l.contract_version),
              unit_id:String(l.unit_id),
              trip_id:l.object_type==="trip"?String(l.object_id):undefined,
              device_id:l.device_id??undefined,
              occurred_at:toIso(l.occurred_at),
              received_at:toIso(l.recorded_at),
              clock_trust:l.clock_trust,
              origin:l.origin,
              source_mode:l.source_mode,
              sequence:seq
            }
          });
          assert.ok(e);
          rows.push(e);
          if(!e.trip_id)nonTrip++;
        }
      }
      await tx.query("CLOSE q026a");
    });
    assert.equal(droppedUnknown,replay.sem_modo);
    assert.equal(droppedBad,replay.corrompidas.length);
    assert.equal(nonTrip,1);
    assert.deepEqual(new Set(rows.map(e=>e.event_id)),new Set(replay.aptos.map(e=>e.event_id)));
    check("cursor SQL pagina tres linhas preserva TODOS fatos aptos, modos, UNKNOWN e corrupcao");

    const scopes=new Map<string,{unit:string;mode:SourceMode}>();
    for(const e of replay.aptos)scopes.set(JSON.stringify([e.unit_id,e.source_mode]),{unit:e.unit_id,mode:e.source_mode});
    const perTrip=new Map<string,EventEnvelope[]>();
    for(const e of rows){
      if(!e.trip_id)continue;
      const key=JSON.stringify([e.unit_id,e.source_mode,e.trip_id]);
      const buf=perTrip.get(key)??[];buf.push(e);perTrip.set(key,buf);
    }
    const byScope=new Map<string,ViagemProjetada[]>();
    for(const events of perTrip.values()){
      const e=events[0];
      const result=projetar(events,{agora,unit_id:e.unit_id,source_mode:e.source_mode});
      assert.equal(result.viagens.length,1);
      const key=JSON.stringify([e.unit_id,e.source_mode]);
      const arr=byScope.get(key)??[];arr.push(result.viagens[0]);byScope.set(key,arr);
    }
    for(const scope of scopes.values()){
      const key=JSON.stringify([scope.unit,scope.mode]);
      const expected=projetar(replay.aptos,{agora,unit_id:scope.unit,source_mode:scope.mode});
      const actual=(byScope.get(key)??[]).sort((a,b)=>a.trip_id.localeCompare(b.trip_id));
      assert.deepEqual(actual,expected.viagens,"divergencia escopo "+key);
    }
    assert.equal(byScope.size,4);
    check("ViagemProjetada[] integral igual nos 4 escopos unidade+modo (mesmo trip_id em modos distintos)");
    const realItaim=projetar(replay.aptos,{agora,unit_id:"ITAIM",source_mode:"real"});
    assert.equal(realItaim.viagens.find(v=>v.trip_id==="T-SAME")?.estado,"encerrada");
    assert.equal(realItaim.viagens.find(v=>v.trip_id==="T-GPS-ONLY")?.estado,"desconhecido");
    check("fechamento ocorrido ontem mas recebido hoje nao e perdido, GPS isolado nao vira viagem iniciada");
    assert.equal(realItaim.viagens.find(v=>v.trip_id==="T-SAME")?.frescor,"fresh");
    check("relogio suspeito usa recorded_at do servidor para determinar frescor");

    // PROVA NEGATIVA: uma projeção por viagem NAO reconstitui o cursor GLOBAL.
    const emptyTrip=rows.find(e=>!e.trip_id)!;
    assert.equal(emptyTrip.event_id,"r-other-object");
    assert.ok(realItaim.cursor);
    assert.ok(!realItaim.viagens.some(v=>v.eventos.includes(emptyTrip.event_id)));
    check("cursor do replay pode depender de evento sem trip_id, perdido se ler apenas viagens");

    // PROVA NEGATIVA: somar dimensoes de grupos individuais nao recompõe
    // integridade/confianca e o proprio leitor paginado nao calcula dimensoes.
    const realGroups=[...perTrip.values()].filter(v=>v[0].unit_id==="ITAIM"&&v[0].source_mode==="real");
    const aggregate=realGroups.map(f=>projetar(f,{agora,unit_id:"ITAIM",source_mode:"real"}).dimensoes.carga)
      .reduce((s,n)=>s+n,0);
    assert.equal(aggregate,realItaim.dimensoes.carga);
    assert.notDeepEqual(
      realGroups[0]&&projetar(realGroups[0],{agora,unit_id:"ITAIM",source_mode:"real"}).dimensoes,
      realItaim.dimensoes
    );
    check("dimensoes agregadas NAO equivalem as dimensoes de uma viagem");

    let rejected=false;
    try{
      await inserir({id:"r-duplicate-db",unit:"OUTRA",obj:"trip",objectId:"T-DUP",type:"trip_started",at:"2026-10-09T19:00:00Z",received:"2026-10-09T19:00:00Z",mode:"real"});
      await b.cliente.query("INSERT INTO platform.event_log (event_id,unit_id,object_type,object_id,event_type,payload,occurred_at,origin,idempotency_key,contract_version,source_mode) VALUES ('new-id','ITAIM','trip','T-NEW','trip_started','{}','2026-10-09T19:00:00Z','device','r-duplicate-db','trip_started@1.0.0','simulated')");
    }catch{rejected=true}
    assert.equal(rejected,true,"unicidade de idempotencia mudou");
    check("chave idempotente global no schema impede duplicata cruzando unidade/modo");

    console.log("Q026_PAGED_ADVERSARIAL: "+count+"/9 PASS; no operational changes.");
    console.log("Q026_PAGED_ADVERSARIAL_LIMIT: trips equivalentes, cursor e dimensoes globais NAO demonstrados pela paginacao.");
  }finally{await b.descartar()}
}
void main().catch(e=>{console.error(e);process.exitCode=1});
