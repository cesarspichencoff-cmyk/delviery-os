/**
 * Regressao adversarial reproduzida no Foxxy: referencias do estado committed
 * nunca podem ser alteradas por leitura, input antigo ou rollback.
 * Sem API, sem DB real, sem dados de restaurante.
 */
import assert from "node:assert/strict";
import { MemoryUnitOfWork } from "./memory-uow";
import type { TripRecord } from "./ports";
import type { DomainEvent } from "../foundation/types";

const trip=(id:string):TripRecord=>({
  trip:{trip_id:id,unit_id:"ITAIM"} as TripRecord["trip"],
  deliveries:[{delivery_id:"d1",order_ref:"ORIGINAL"}] as TripRecord["deliveries"],
  version:0,
});
let passed=0;
function ok(label:string){passed++;console.log("OK "+label);}
async function main(){
  const u=new MemoryUnitOfWork();
  const input=trip("t-rollback");
  await u.trips.save(input,null);
  await u.commit();
  // Um caller pode manter a referencia passada a save apos o commit.
  input.deliveries[0]!.order_ref="ALTERACAO_EXTERNA";
  assert.equal((await u.trips.get("t-rollback"))?.deliveries[0]?.order_ref,"ORIGINAL");
  ok("input entregue a save nao altera snapshot confirmado");

  const staged=await u.trips.get("t-rollback");
  assert.ok(staged);
  staged.deliveries[0]!.order_ref="ALTERACAO_NESTED_SEM_SAVE";
  assert.equal(u.hasPendingWrites(),true);
  await u.rollback();
  assert.equal((await u.trips.get("t-rollback"))?.deliveries[0]?.order_ref,"ORIGINAL");
  assert.equal(u.hasPendingWrites(),false);
  ok("rollback remove mutacao nested de entrega");

  const old=(await u.trips.get("t-rollback"))!;
  old.trip.unit_id="PINHEIROS";
  await u.rollback();
  assert.equal((await u.trips.get("t-rollback"))?.trip.unit_id,"ITAIM");
  ok("rollback remove mutacao nested do agregado");

  const secondary=u.newUnit();
  const sibling=await secondary.trips.get("t-rollback");
  assert.ok(sibling);
  sibling.deliveries[0]!.order_ref="ALTERADA_EM_OUTRA_UOW";
  await secondary.rollback();
  assert.equal((await u.trips.get("t-rollback"))?.deliveries[0]?.order_ref,"ORIGINAL");
  assert.equal((await secondary.trips.get("t-rollback"))?.deliveries[0]?.order_ref,"ORIGINAL");
  ok("duas UoWs nao compartilham referencias mutaveis");

  const event={event_id:"event-1",object_type:"Trip",object_id:"t-rollback",
    payload:{order_ref:"ORIGINAL"}} as unknown as DomainEvent;
  await u.events.append([event]);await u.commit();
  (event as unknown as {payload:{order_ref:string}}).payload.order_ref="ALTERACAO_EXTERNA";
  assert.equal((await u.events.listAll())[0] &&
    ((await u.events.listAll())[0] as unknown as {payload:{order_ref:string}}).payload.order_ref,"ORIGINAL");
  const e=(await u.events.listAll())[0] as unknown as {payload:{order_ref:string}};
  e.payload.order_ref="ALTERACAO_COM_ROLLBACK";
  await u.rollback();
  assert.equal(((await u.events.listAll())[0] as unknown as {payload:{order_ref:string}}).payload.order_ref,"ORIGINAL");
  ok("eventos confirmados nao mudam via alias ou rollback");
  console.log("MEMORY_UOW_COMMITTED_ISOLATION="+passed+"/"+passed+" PASS");
}
void main().catch(e=>{console.error(e);process.exitCode=1;});
