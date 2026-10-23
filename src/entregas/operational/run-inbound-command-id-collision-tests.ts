/** RED gate: a unicidade por command_id exigida pela proposta PG 0011
 * tambem deve existir em File/Memory e no serviço. Somente laboratorio.
 * Nao incluir no runner verde enquanto houver falha comprovada.
 */
import assert from "node:assert/strict";
import { mkdtempSync,rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EntregasApplicationService } from "./application-service";
import { MemoryUnitOfWork } from "../persistence/memory-uow";
import { openFileUnitOfWork } from "../persistence/file-store";
import type { UnitOfWork } from "../persistence/ports";
import { canonicalInboundFingerprint,type DurableInboundReceipt } from "../persistence/inbound-receipt";
import { asInternalRiderActorId } from "../foundation/brands";
import { PgEntregasUnitOfWork } from "../persistence/pg-uow";
import type { SqlClient, SqlRow, TransactionalSqlClient } from "../../platform/persistence/sql-client";

const actor={actor_id:"ops-unique-cmd",role:"operador_expedicao" as const};
const common={type:"CreateTrip" as const,command_id:"command-id-SAME",
  unit_id:"unit-unique-cmd",occurred_at:"2026-10-20T20:00:00Z",actor};
function command(tag:string){
  return {...common,idempotency_key:"key-"+tag,trip_id:"trip-"+tag,
    courier_actor_id:asInternalRiderActorId("rider-"+tag),
    deliveries:[{delivery_id:"delivery-"+tag,order_ref:"order-"+tag}]};
}
function receipt(cmd:ReturnType<typeof command>,tag:string):DurableInboundReceipt{
  const event_id="event-"+tag;
  return {unit_id:cmd.unit_id,event_id,idempotency_key:cmd.idempotency_key,
    fingerprint:canonicalInboundFingerprint({event_id,idempotency_key:cmd.idempotency_key,
      command:cmd,unit_id:cmd.unit_id,actor_id:actor.actor_id,actor_role:actor.role,device_id:null}),
    actor_id:actor.actor_id,actor_role:actor.role,device_id:null,command_id:cmd.command_id,
    command_type:cmd.type,outcome:"applied",code:null,recorded_at:cmd.occurred_at};
}
async function run(name:string,uow:UnitOfWork,reopen:()=>UnitOfWork):Promise<void>{
  const svc=new EntregasApplicationService(uow);
  const a=command("A"),b=command("B");
  const initial=await svc.execute(a,receipt(a,"A"));
  assert.equal(initial.ok,true,name+": initial create");
  const count=(await uow.events.listAll()).length;
  for(const [phase,target] of [["same-uow",uow],["after-reopen",reopen()]] as const){
    const byCommand = await (target.inboundReceipts.find as
      (eventId:string,key:string,commandId:string)=>Promise<DurableInboundReceipt[]>)(
      "missing-event","missing-idempotency",b.command_id);
    assert.equal(byCommand.length,1,name+" "+phase+": third unique key not found");
    assert.equal(byCommand[0]?.event_id,"event-A");
    const collision=await new EntregasApplicationService(target).execute(b,receipt(b,"B"));
    assert.equal(collision.ok,false,name+" "+phase+": command_id duplicate must never apply");
    assert.equal(collision.code,"RECEIPT_COLLISION",name+" "+phase+": PG unique constraint parity");
    assert.equal(await target.trips.get(b.trip_id),null,name+" "+phase+": second trip unexpectedly applied");
    assert.equal((await target.events.listAll()).length,count,name+" "+phase+": event timeline changed");
    console.log("OK "+name+" "+phase+" command_id collision refused");
  }
}
async function main(){
  const memory=new MemoryUnitOfWork();
  await run("memory",memory,()=>memory.newUnit());
  const dir=mkdtempSync(join(tmpdir(),"inbound-command-id-"));
  try{
    const file=join(dir,"state.json");
    await run("file",openFileUnitOfWork(file),()=>openFileUnitOfWork(file));
  }finally{rmSync(dir,{recursive:true,force:true})}
  let pgSql = "";
  const candidate=receipt(command("A"),"A");
  const db:TransactionalSqlClient={
    async query<T extends SqlRow=SqlRow>(sql:string,params?:readonly unknown[]):Promise<T[]>{
      pgSql=sql;
      assert.match(sql,/command_id\s*=\s*\$4/,"PG must include command_id lookup");
      assert.equal(params?.[3],candidate.command_id);
      return [{...candidate,recorded_at:new Date(candidate.recorded_at)}] as unknown as T[];
    },
    async transaction<T>(fn:(tx:SqlClient)=>Promise<T>):Promise<T>{return fn(db)},
    async close():Promise<void>{},
  };
  const pg=new PgEntregasUnitOfWork(db,common.unit_id);
  const found=await (pg.inboundReceipts.find as
    (a:string,b:string,c:string)=>Promise<DurableInboundReceipt[]>)(
    "missing-event","missing-idempotency",candidate.command_id);
  assert.equal(found.length,1);
  assert.equal(found[0]?.command_id,candidate.command_id);
  assert.ok(pgSql.includes("entregas.inbound_receipt"));
  console.log("OK PG fake command_id lookup");
  console.log("INBOUND_COMMAND_ID_COLLISION: 7/7 PASS (MEMORY+FILE+PG SQL FAKE)");
}
void main().catch(e=>{console.error("RED COMMAND-ID COLLISION:",e);process.exitCode=1});
