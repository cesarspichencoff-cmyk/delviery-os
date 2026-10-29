/** Replay/collision em UoW commitadas. Teste sintetico, sem HTTP/PG real. */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EntregasApplicationService } from "./application-service";
import { MemoryUnitOfWork } from "../persistence/memory-uow";
import { openFileUnitOfWork } from "../persistence/file-store";
import type { UnitOfWork } from "../persistence/ports";
import { canonicalInboundFingerprint, type DurableInboundReceipt } from "../persistence/inbound-receipt";
import { asInternalRiderActorId } from "../foundation/brands";
const actor={actor_id:"actor-replay",role:"operador_expedicao" as const};
const cmd={
  type:"CreateTrip" as const, unit_id:"unit-replay", command_id:"cmd-replay",
  idempotency_key:"idem-replay",occurred_at:"2026-10-20T20:00:00Z",actor,
  trip_id:"trip-replay",courier_actor_id:asInternalRiderActorId("rider-replay"),
  deliveries:[{delivery_id:"delivery-replay",order_ref:"ORDER-ORIGINAL"}],
};
const baseReceipt:DurableInboundReceipt={
  unit_id:cmd.unit_id,event_id:"evt-replay",idempotency_key:cmd.idempotency_key,
  actor_id:actor.actor_id,actor_role:actor.role,device_id:null,
  command_id:cmd.command_id,command_type:cmd.type,
  outcome:"applied",code:null,recorded_at:"2026-10-20T20:05:00Z",fingerprint:"",
};
function receiptFor(command: typeof cmd):DurableInboundReceipt{
  return {...baseReceipt,fingerprint:canonicalInboundFingerprint({
    event_id:baseReceipt.event_id,idempotency_key:baseReceipt.idempotency_key,
    command,unit_id:command.unit_id,actor_id:actor.actor_id,actor_role:actor.role,
    device_id:null,
  })};
}
async function run(label:string,initial:UnitOfWork,reopen:()=>UnitOfWork):Promise<void>{
  const first=await new EntregasApplicationService(initial).execute(cmd,receiptFor(cmd));
  assert.equal(first.ok,true,label+" inicial: "+first.error);
  const baseCount=(await initial.events.listAll()).length;
  assert.ok(baseCount>0);
  const persisted=reopen();
  const replay=await new EntregasApplicationService(persisted).execute(cmd,receiptFor(cmd));
  assert.equal(replay.ok,true,label+" replay identico nao pode virar recusado: "+replay.code);
  assert.equal(replay.code,"REPLAY_APPLIED",label+" ACK ja gravado precisa ser explicito");
  assert.equal((await persisted.events.listAll()).length,baseCount,
    label+" replay nao cria evento");
  const changed={...cmd,deliveries:[{...cmd.deliveries[0],order_ref:"ORDER-ADULTERADO"}]};
  const collision=await new EntregasApplicationService(persisted).execute(changed,receiptFor(changed));
  assert.equal(collision.ok,false,label+" payload diferente nao pode ser aplicado");
  assert.equal(collision.code,"RECEIPT_COLLISION",label+" precisa ser conflito terminal explicito");
  assert.equal((await persisted.events.listAll()).length,baseCount);
  const stored=await persisted.trips.get(cmd.trip_id);
  assert.equal(stored?.deliveries[0]?.order_ref,"ORDER-ORIGINAL");
  console.log("OK "+label+" replay e colisao sem efeitos duplicados");
}
async function main(){
  const memory=new MemoryUnitOfWork();
  await run("memoria",memory,()=>memory.newUnit());
  const dir=mkdtempSync(join(tmpdir(),"inbound-replay-test-"));
  try{const file=join(dir,"store.json");await run("arquivo",openFileUnitOfWork(file),()=>openFileUnitOfWork(file))}
  finally{rmSync(dir,{recursive:true,force:true})}
  console.log("INBOUND_REPLAY: 4/4 OK (2x replay, 2x colisao; SEM API/PG REAL)");
}
void main().catch(e=>{console.error("RED REPLAY:",e);process.exitCode=1;});
