/** Adversarial: same UoW used by two service INSTANCES must never mix stages.
 * Synthetic Memory UoW only; no HTTP, PG, inventory or real orders.
 */
import assert from "node:assert/strict";
import { EntregasApplicationService } from "./application-service";
import { MemoryUnitOfWork } from "../persistence/memory-uow";
import type { UnitOfWork } from "../persistence/ports";
import { asInternalRiderActorId } from "../foundation/brands";

async function run(label:string,wrap:boolean){
  const uow=new MemoryUnitOfWork();
  // Duas referencias wrapper diferentes podem compartilhar os mesmos
  // buffers staged (como um decorator de assinatura do outbox).
  const decorate=():UnitOfWork=>({
    inboundReceipts:uow.inboundReceipts,
    trips:uow.trips,handoffs:uow.handoffs,occurrences:uow.occurrences,
    riders:uow.riders,events:uow.events,outbox:uow.outbox,
    hasPendingWrites:()=>uow.hasPendingWrites(),
    commit:()=>uow.commit(),rollback:()=>uow.rollback(),
  });
  const a=new EntregasApplicationService(wrap?decorate():uow);
  const b=new EntregasApplicationService(wrap?decorate():uow);
  // Barrier 1: A and B must BOTH pass the entry guard BEFORE any stage.
  const realTripGet=uow.trips.get.bind(uow.trips);
  const realTripSave=uow.trips.save.bind(uow.trips);
  let enteredA!:()=>void,enteredB!:()=>void;
  let allowA!:()=>void,allowB!:()=>void;
  const reachedA=new Promise<void>(r=>{enteredA=r});
  const reachedB=new Promise<void>(r=>{enteredB=r});
  const holdA=new Promise<void>(r=>{allowA=r});
  const holdB=new Promise<void>(r=>{allowB=r});
  uow.trips.get=async id=>{
    if(id==="trip-missing-B"){enteredB();await holdB}
    return realTripGet(id)
  };
  uow.trips.save=async(record,expected)=>{
    if(record.trip.trip_id==="trip-A"){enteredA();await holdA}
    return realTripSave(record,expected);
  };
  // Barrier 2: A must stage trip/events and then pause before commit.
  const realRiderGet=uow.riders.get.bind(uow.riders);
  let stagedA!:()=>void,finishA!:()=>void;
  const aStaged=new Promise<void>(r=>{stagedA=r});
  const holdRider=new Promise<void>(r=>{finishA=r});
  uow.riders.get=async id=>{stagedA();await holdRider;return realRiderGet(id)};
  const common={unit_id:"unit-shared",occurred_at:"2026-10-20T20:00:00Z",
    actor:{actor_id:"ops-shared",role:"operador_expedicao" as const}};
  const ca={
    ...common,type:"CreateTrip" as const,command_id:"create-A",
    trip_id:"trip-A",courier_actor_id:asInternalRiderActorId("rider-A"),
    deliveries:[{delivery_id:"delivery-A",order_ref:"order-A"}],
  };
  const cb={
    ...common,type:"AddDeliveryToTrip" as const,command_id:"add-B",
    trip_id:"trip-missing-B",delivery_id:"delivery-B",
    order_ref:"order-B",planned_stop_order:1,
  };
  const pa=a.execute(ca);
  const wait=async <T>(p:Promise<T>,name:string):Promise<T>=>{
    let timer:ReturnType<typeof setTimeout>|undefined;
    try{
      return await Promise.race([p,new Promise<T>((_,reject)=>{
        timer=setTimeout(()=>reject(new Error("Timeout: "+name)),2000);
      })]);
    }finally{if(timer)clearTimeout(timer)}
  };
  await wait(reachedA,"A before trip stage");
  const pb=b.execute(cb);
  // If both pass the guard, B must still not erase A's future writes.
  // A global UoW lock will keep B before its trip.get barrier, so a
  // bounded wait also allows the GREEN implementation to continue.
  await Promise.race([reachedB,new Promise<void>(r=>setTimeout(r,20))]);
  allowA();
  await wait(aStaged,"A staged domain and paused before commit");
  allowB();
  // B's NOT_FOUND must not rollback A's staged domain.
  await new Promise<void>(r=>setTimeout(r,20));
  finishA();
  const [ra,rb]=await wait(Promise.all([pa,pb]),"both executions settle");
  assert.equal(ra.ok,true,"writer A should commit its own trip");
  assert.equal(rb.ok,false,"writer B must not invent trip");
  const saved=await uow.trips.get(ca.trip_id);
  assert.equal(saved?.trip.trip_id,ca.trip_id,
    "B destroyed A's trip under cross-instance shared UoW");
  assert.ok((await uow.events.listAll()).length>0,"B destroyed A's domain events");
  console.log("OK "+label+" shared UoW cross-instance");
}
async function main(){
  await run("direct",false);
  await run("two wrappers",true);
  console.log("SHARED_UOW_CROSS_INSTANCE: 2/2 OK (MEMORY SYNTHETIC)");
}
void main().catch(e=>{console.error("RED SHARED UOW:",e);process.exitCode=1});
