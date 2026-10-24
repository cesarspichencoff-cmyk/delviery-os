/** Laboratory-only failure injection: commit acknowledged by store but client loses response.
 * Never uses real orders, device, API, migrations or external DB.
 */
import assert from "node:assert/strict";
import { mkdtempSync,rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openFileUnitOfWork } from "../persistence/file-store";
import { EntregasApplicationService } from "./application-service";
import { MemoryUnitOfWork } from "../persistence/memory-uow";
import type { UnitOfWork } from "../persistence/ports";
import { canonicalInboundFingerprint, type DurableInboundReceipt } from "../persistence/inbound-receipt";
import { asInternalRiderActorId } from "../foundation/brands";

const actor={actor_id:"ops-commit-fault",role:"operador_expedicao" as const};
const cmd={
  type:"CreateTrip" as const, command_id:"cmd-commit-fault",idempotency_key:"key-commit-fault",
  unit_id:"unit-commit-fault",occurred_at:"2026-10-20T20:00:00Z",actor,
  trip_id:"trip-commit-fault",courier_actor_id:asInternalRiderActorId("rider-commit-fault"),
  deliveries:[{delivery_id:"delivery-commit-fault",order_ref:"ORDER-commit-fault"}],
};
const receipt:DurableInboundReceipt={
  unit_id:cmd.unit_id,event_id:"event-commit-fault",idempotency_key:cmd.idempotency_key,
  actor_id:actor.actor_id,actor_role:actor.role,device_id:null,
  command_id:cmd.command_id,command_type:cmd.type,outcome:"applied",
  code:null,recorded_at:"2026-10-20T20:05:00Z",
  fingerprint:canonicalInboundFingerprint({
    event_id:"event-commit-fault",idempotency_key:cmd.idempotency_key,command:cmd,
    unit_id:cmd.unit_id,actor_id:actor.actor_id,actor_role:actor.role,device_id:null,
  }),
};
function wrap(store:UnitOfWork,mode:"after"|"before"):UnitOfWork{
  return {
    inboundReceipts:store.inboundReceipts,trips:store.trips,handoffs:store.handoffs,
    occurrences:store.occurrences,riders:store.riders,
    events:store.events,outbox:store.outbox,
    hasPendingWrites:()=>store.hasPendingWrites(),
    async commit(){
      if(mode==="after") await store.commit();
      throw new Error("SIMULATED_LOST_COMMIT_RESPONSE");
    },
    rollback:()=>store.rollback(),
  };
}
async function main(){
  const after=new MemoryUnitOfWork();
  const resultAfter=await new EntregasApplicationService(wrap(after,"after")).execute(cmd,receipt);
  assert.equal(resultAfter.ok,true,"recibo COMMITADO prova evento aplicado");
  assert.equal(resultAfter.code,"REPLAY_APPLIED");
  assert.notEqual(resultAfter.retryable,true,"ACK comprovado nao e retryable");
  assert.equal((await after.inboundReceipts.find(receipt.event_id,receipt.idempotency_key)).length,1);
  assert.equal((await after.events.listAll()).length>0,true);
  console.log("OK lost COMMIT response AFTER atomic store commit: ACK from confirmed receipt");

  const before=new MemoryUnitOfWork();
  const resultBefore=await new EntregasApplicationService(wrap(before,"before")).execute(cmd,receipt);
  assert.equal(resultBefore.ok,false,"sem recibo confirmado nao pode produzir ACK");
  assert.equal(resultBefore.code,"COMMIT_UNCONFIRMED_RETRY");
  assert.equal(resultBefore.retryable,true,"incerteza antes de commit deve permanecer pendente");
  assert.equal((await before.inboundReceipts.find(receipt.event_id,receipt.idempotency_key)).length,0);
  assert.equal((await before.events.listAll()).length,0);
  console.log("OK lost COMMIT response BEFORE commit: retry, never final reject");

  // O store ja aplicou, mas o cliente perdeu tanto a resposta quanto
  // a capacidade de reler o recibo. Sem prova acessivel, NUNCA ACK.
  const inaccessible=new MemoryUnitOfWork();
  const unsafeRead=wrap(inaccessible,"after");
  let readCount=0;
  const realFind=unsafeRead.inboundReceipts.find.bind(unsafeRead.inboundReceipts);
  unsafeRead.inboundReceipts={
    ...unsafeRead.inboundReceipts,
    async find(eventId,key){
      readCount++;
      if(readCount>1)throw new Error("SIMULATED_RECEIPT_DB_READ_UNAVAILABLE");
      return realFind(eventId,key);
    },
  };
  const cannotConfirm=await new EntregasApplicationService(unsafeRead).execute(cmd,receipt);
  assert.equal(cannotConfirm.ok,false);
  assert.equal(cannotConfirm.code,"COMMIT_UNCONFIRMED_RETRY");
  assert.equal(cannotConfirm.retryable,true,"recibo incomprovavel nao e rejeicao terminal");
  assert.equal((await inaccessible.inboundReceipts.find(receipt.event_id,receipt.idempotency_key)).length,1);
  console.log("OK committed but reread unavailable: retry, no unproven ACK");

  const dir=mkdtempSync(join(tmpdir(),"inbound-commit-fault-"));
  try {
    const file=join(dir,"state.json");
    const fileResult=await new EntregasApplicationService(
      wrap(openFileUnitOfWork(file),"after")).execute(cmd,receipt);
    assert.equal(fileResult.ok,true,"arquivo deve confirmar via recibo ja commitado");
    assert.equal(fileResult.code,"REPLAY_APPLIED");
    const reopened=openFileUnitOfWork(file);
    assert.equal((await reopened.inboundReceipts.find(
      receipt.event_id,receipt.idempotency_key)).length,1);
    const count=(await reopened.events.listAll()).length;
    const replay=await new EntregasApplicationService(reopened).execute(cmd,receipt);
    assert.equal(replay.ok,true);
    assert.equal(replay.code,"REPLAY_APPLIED");
    assert.equal((await reopened.events.listAll()).length,count);
    console.log("OK file: lost response + reopening retains ACK and no duplicate event");

    const absent=join(dir,"before.json");
    const failed=await new EntregasApplicationService(
      wrap(openFileUnitOfWork(absent),"before")).execute(cmd,receipt);
    assert.equal(failed.ok,false);
    assert.equal(failed.code,"COMMIT_UNCONFIRMED_RETRY");
    assert.equal(failed.retryable,true,"falha de arquivo antes de commit e recuperavel");
    assert.equal((await openFileUnitOfWork(absent).inboundReceipts.find(
      receipt.event_id,receipt.idempotency_key)).length,0);
    console.log("OK file: failure before commit leaves no durable ACK");
  } finally { rmSync(dir,{recursive:true,force:true}) }

  console.log("INBOUND_COMMIT_UNCERTAINTY: 5/5 OK (MEMORY+FILE FAULT-INJECTION)");
}
void main().catch(e=>{console.error("RED COMMIT UNCERTAINTY:",e);process.exitCode=1});
