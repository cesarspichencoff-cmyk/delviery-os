/** TESTE ADVERSARIAL SINTETICO: ACK nao pode ser herdado do caller anterior.
 * Nenhuma chamada real, banco, dispositivo ou alteracao operacional.
 */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EntregasApplicationService } from "./application-service";
import { MemoryUnitOfWork } from "../persistence/memory-uow";
import { openFileUnitOfWork } from "../persistence/file-store";
import { PgEntregasUnitOfWork } from "../persistence/pg-uow";
import type { SqlClient, SqlRow, TransactionalSqlClient } from "../../platform/persistence/sql-client";
import { CONTRACT_VERSION_FULL } from "../foundation/contract";
import type { UnitOfWork } from "../persistence/ports";
import { asInternalRiderActorId } from "../foundation/brands";
import type { DurableInboundReceipt } from "../persistence/inbound-receipt";

const actor={actor_id:"ops-isolation",role:"operador_expedicao" as const};
const command={
  type:"CreateTrip" as const,unit_id:"unit-isolation",command_id:"cmd-current",
  actor,occurred_at:"2026-10-20T20:00:00Z",
  trip_id:"trip-isolation",courier_actor_id:asInternalRiderActorId("rider-isolation"),
  deliveries:[{delivery_id:"del-isolation",order_ref:"order-isolation"}],
};
const pending:DurableInboundReceipt={
  unit_id:command.unit_id,event_id:"evt-FOREIGN",idempotency_key:"key-FOREIGN",
  fingerprint:"b".repeat(64),actor_id:actor.actor_id,actor_role:actor.role,
  device_id:null,command_id:"cmd-FOREIGN",command_type:"CreateTrip",
  outcome:"applied",code:null,recorded_at:command.occurred_at,
};
async function test(label:string,uow:UnitOfWork,withReceipt:boolean):Promise<void>{
  const svc=new EntregasApplicationService(uow);
  uow.inboundReceipts.stage(pending);
  const own={...pending,event_id:"evt-CURRENT",idempotency_key:"key-CURRENT",
    command_id:command.command_id};
  const result=await svc.execute(command,withReceipt?own:undefined);
  assert.equal(result.ok,false,label+": comando nao pode herdar ACK externo");
  assert.equal(result.code,"STAGE_DIRTY",label+": sem status explicito fail-closed");
  // A unidade pertence a outro escritor. Nao e seguro apagar o stage
  // dele automaticamente. Quarentenar este servico sem fazer commit.
  assert.equal(uow.inboundReceipts.hasStaged(),true,
    label+": rollback do comando alheio destruiria estado de outro escritor");
  const second=await svc.execute(command);
  assert.equal(second.ok,false,label+": instancia contaminada nao pode retomar");
  assert.equal(second.code,"STAGE_QUARANTINED");
  assert.equal((await uow.trips.get(command.trip_id)),null,label+": nenhum fato operacional");
  await uow.rollback(); // somente a custodia da instancia sintética limpa o teste
  assert.equal((await uow.inboundReceipts.find(pending.event_id,pending.idempotency_key)).length,0);
}
async function testDomainStage(label:string,uow:UnitOfWork):Promise<void>{
  const svc=new EntregasApplicationService(uow);
  const first=await svc.execute(command);
  assert.equal(first.ok,true,label+": setup nao cria trip");
  const baseline=await uow.trips.get(command.trip_id);
  assert.ok(baseline);
  await uow.trips.save(baseline,baseline.version); // alteracao externa, ainda nao COMMITADA
  const pending=await uow.trips.get(command.trip_id);
  assert.ok(pending && pending.version>baseline.version);
  const other=await svc.execute({
    type:"AddDeliveryToTrip",unit_id:command.unit_id,
    command_id:"cmd-domain-outside",occurred_at:command.occurred_at,
    actor,trip_id:"trip-ausente-domain",delivery_id:"del-outside",
    order_ref:"ORDER-outside",planned_stop_order:1,
  });
  assert.equal(other.ok,false,label+": comando nao pode incorporar staged alheio");
  assert.equal(other.code,"STAGE_DIRTY",
    label+": dominio externo nao pode ser rollbackado por outra requisicao");
  assert.equal((await uow.trips.get(command.trip_id))?.version,pending.version,
    label+": recusa apagou stage operacional de outro escritor");
  const second=await svc.execute(command);
  assert.equal(second.code,"STAGE_QUARANTINED");
  await uow.rollback(); // limpeza explicita do dono sintético
}
async function main():Promise<void>{
  for(const withReceipt of [false,true]){
    await test("mem "+withReceipt,new MemoryUnitOfWork(),withReceipt);
  }
  const dir=mkdtempSync(join(tmpdir(),"receipt-stage-isolation-"));
  try{
    for(const withReceipt of [false,true]){
      await test("file "+withReceipt,
        openFileUnitOfWork(join(dir,"store-"+withReceipt+".json")),withReceipt);
    }
    await testDomainStage("file domain",openFileUnitOfWork(join(dir,"domain.json")));
  }finally{rmSync(dir,{recursive:true,force:true});}
  await testDomainStage("memory domain",new MemoryUnitOfWork());
  const statements:string[]=[];
  const fakeDb: TransactionalSqlClient={
    async query<T extends SqlRow=SqlRow>(sql:string):Promise<T[]>{statements.push(sql);return []},
    async transaction<T>(fn:(tx:SqlClient)=>Promise<T>):Promise<T>{return fn(fakeDb)},
    async close():Promise<void>{},
  };
  const pg=new PgEntregasUnitOfWork(fakeDb,command.unit_id);
  await pg.trips.save({
    trip:{
      trip_id:"trip-foreign-staged",unit_id:command.unit_id,
      courier_actor_id:command.courier_actor_id,created_by:actor.actor_id,
      state:"preparando_saida",delivery_ids:[],created_at:command.occurred_at,
      last_event_id:"event-internal",contract_version:CONTRACT_VERSION_FULL,
      policy_bundle_id:"synthetic-policy",
    },deliveries:[],version:0,
  },null);
  const pgSvc=new EntregasApplicationService(pg);
  const outcome=await pgSvc.execute(command);
  assert.equal(outcome.code,"STAGE_DIRTY");
  assert.equal(pg.hasPendingWrites(),true,
    "P0: dominio staged no PostgreSQL simulado nao pode ser limpo por comando alheio");
  assert.equal(statements.length,0,"P0: guard deve bloquear ANTES de SQL");
  console.log("INBOUND_STAGE_ISOLATION: 7/7 OK (PG FAKE, MEM E ARQUIVO)");
}
void main().catch(e=>{console.error("RED STAGE ISOLATION:",e);process.exitCode=1});
