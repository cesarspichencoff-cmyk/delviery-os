/**
 * LAB CONTRACT ONLY: prova de limite de origem em eventos publicos.
 * NAO liga consumer/ingest produtivo, NAO usa banco, arquivo ou credenciais.
 *
 * O indicador source_mode=real é UM CAMPO do envelope, NAO atestacao.
 * O teste mede o comportamento observado e impede confundí-lo com proof real.
 */
import assert from "node:assert/strict";
import { buildSignalEvent, domainEventToPublic } from "../../src/entregas/integration/public-event-builder";
import { validatePublicEvent } from "../../src/entregas/contracts/events/validate";
import { adaptarEventoPublicoEntregas } from "../../src/platform/ingest/entregas-shadow-adapter";
import { loadEntregasSourceIngestConfig } from "../../src/platform/config/entregas-source-ingest-config";
import { EntregasLiveConsumer, type ConsumerCheckpointState } from "../../src/platform/runtime/entregas-live-consumer";
import type { EntregasPublicEvent } from "../../src/entregas/contracts/events/types";
import type { DomainEvent } from "../../src/entregas/foundation/types";
import { CONTRACT_VERSION_FULL } from "../../src/entregas/foundation/contract";
import type { EscritorTransacional, FatoParaGravar } from "../../src/platform/ingest/ingest-service";
import type { OutboxMessage } from "../../src/platform/contracts/messaging";
import type { EntregasEventFeed } from "../../src/entregas/contracts/EntregasEventFeed";

const NOW="2026-09-30T21:30:00.000Z";
const T="2026-09-30T21:00:00.000Z";
let passes=0;
function check(v:boolean,description:string) {
  assert.ok(v,description);
  passes++;
  console.log("ok ORIGIN-"+passes+" "+description);
}
function syntheticPublic(event_type:"trip_started"|"delivery_ready",source_mode?:"real"|"simulated"|"control"){
  return buildSignalEvent({
    event_type,unit_id:"ITAIM",occurred_at:T,recorded_at:T,
    idempotency_key:"LAB_"+event_type+"_"+(source_mode??"unknown"),
    trip_id:"LAB_TRIP",payload:{lab_only:true},source_mode
  });
}
class FixtureFeed implements EntregasEventFeed {
  polls=0;
  constructor(readonly listOf:readonly EntregasPublicEvent[]){}
  async list() {return [...this.listOf];}
  async poll(cursor:string|null,limit=50) {
    this.polls++;
    const idx=cursor?this.listOf.findIndex(x=>x.event_id===cursor)+1:0;
    const events=this.listOf.slice(idx,idx+limit);
    return {events:[...events],next_cursor:events.at(-1)?.event_id??cursor};
  }
}
async function tick(mode:"real"|"simulated"|"control"|undefined,enabled:boolean,active:boolean){
 const event=syntheticPublic("trip_started",mode);
 const feed=new FixtureFeed([event]);
 const facts:FatoParaGravar[]=[];
 const messages:OutboxMessage[]=[];
 const writer:EscritorTransacional={
  async commit(f,m){
   facts.push(...f);messages.push(...m);
   return {ok:true as const,facts:f.length,messages:m.length};
  }
 };
 let checkpoint:ConsumerCheckpointState={version:1,checkpoint:null,isolated_count:0,updated_at:null};
 const runtime=new EntregasLiveConsumer({
  enabled,feed,writer,
  state:{async load(){return checkpoint},async save(s){checkpoint=s}},
  control:{async canRun(){return active}},
  now:()=>new Date(NOW)
 });
 const result=await runtime.tick();
 return {result,facts,messages,checkpoint,feed};
}
async function main(){
 const unset=loadEntregasSourceIngestConfig({});
 check(unset.enabled===false,"source ingestion e OFF por padrao, sem feed/file/db");
 const falsy=loadEntregasSourceIngestConfig({DELIVERYOS_ENTREGAS_SOURCE_INGEST_ENABLED:"false"});
 check(falsy.enabled===false,"flag false preserva OFF");
 const signal=syntheticPublic("delivery_ready",undefined);
 check(validatePublicEvent(signal).ok===true &&
   signal.source_mode===undefined,"sinal independente permite UNKNOWN mas NAO inventa real");
 const blockedSignal=adaptarEventoPublicoEntregas(syntheticPublic("delivery_ready","real"));
 check(!blockedSignal.ok&&blockedSignal.motivo==="tipo_sem_equivalencia_segura",
   "sinal delivery_ready nao vira estado de Trip no adaptador da plataforma");

 const de:DomainEvent={
  event_id:"LAB_DOMAIN",object_type:"trip",object_id:"LAB_TRIP",event_type:"trip_started",
  occurred_at:T,recorded_at:T,origin:"app",
  idempotency_key:"LAB_DOMAIN_K",payload:{lab_only:true},
  clock_trust:"trusted",contract_version:CONTRACT_VERSION_FULL
 } as DomainEvent;
 const fromDomain=domainEventToPublic(de,{unit_id:"ITAIM"});
 check(fromDomain!==null&&fromDomain.source_mode===undefined,
   "evento de dominio nao ganha source_mode real por omissao");
 const missing=adaptarEventoPublicoEntregas(fromDomain!);
 check(!missing.ok&&missing.motivo==="source_mode_ausente",
   "adaptador isola evento de dominio com modo UNKNOWN");

 const claimed=syntheticPublic("trip_started","real");
 check(validatePublicEvent(claimed).ok===true&&claimed.source_mode==="real",
   "RISCO: validador estrutural aceita modo real autodeclarado sem atestacao");
 const accepted=adaptarEventoPublicoEntregas(claimed);
 check(accepted.ok&&accepted.evento.source_mode==="real"&&accepted.evento.origin==="source",
   "RISCO: adaptador aceita tipo de dominio gerado como sinal e repassa modo real sem checar fonte");
 const disabled=await tick("real",false,true);
 check(disabled.result.status==="disabled"&&disabled.feed.polls===0&&disabled.facts.length===0,
   "barreira da feature flag impede ate leitura do feed");
 const stopped=await tick("real",true,false);
 check(stopped.result.status==="killed"&&stopped.feed.polls===0&&stopped.facts.length===0,
   "kill switch fechado impede consumo e persistencia");
 const unknown=await tick(undefined,true,true);
 check(unknown.result.status==="worked"&&unknown.facts.length===0&&
   unknown.result.isolated===1&&unknown.checkpoint.isolated_count===1,
   "consumer ativo isola evento sem modo e nao grava fato");
 const simulated=await tick("simulated",true,true);
 check(simulated.result.status==="worked"&&simulated.facts.length===1&&
   simulated.facts[0].source_mode==="simulated","consumer preserva modo simulated explicito");
 const real=await tick("real",true,true);
 check(real.result.status==="worked"&&real.facts.length===1&&
   real.facts[0].source_mode==="real"&&real.messages.length===1,
   "RISCO: quando ativado em memoria, modo real declarado atravessa consumer e writer sem prova da fonte");
 check(real.checkpoint.checkpoint!==null,
   "checkpoint registra evento validado estruturalmente, nao autenticidade de produtor");
 const control=await tick("control",true,true);
 check(control.result.status==="worked"&&control.facts.length===1&&
   control.facts[0].source_mode==="control","consumer preserva modo control sem conversao a real");
 const explicitDomain=domainEventToPublic(de,{unit_id:"ITAIM",source_mode:"real"});
 check(explicitDomain!==null&&explicitDomain.source_mode==="real",
   "builder do dominio segue atestacao recebida; nao faz verificacao independente");
 console.log("ENTREGAS_SOURCE_PROVENANCE_BOUNDARY_LAB: "+passes+"/"+passes+
  " PASS (UNTRUSTED REAL CLAIM CONFIRMED, NO REAL SOURCE/INGEST/DEPLOY)");
}
void main().catch(e=>{console.error(e);process.exitCode=1});
