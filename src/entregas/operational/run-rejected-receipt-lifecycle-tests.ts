/** Teste adversarial sintético: um comando recusado nao pode promover ACK pendente. */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EntregasApplicationService } from "./application-service";
import { asInternalRiderActorId } from "../foundation/brands";
import { MemoryUnitOfWork } from "../persistence/memory-uow";
import { openFileUnitOfWork } from "../persistence/file-store";
import { PgEntregasUnitOfWork } from "../persistence/pg-uow";
import type { SqlClient, SqlRow, TransactionalSqlClient } from "../../platform/persistence/sql-client";
import { InboundReceiptConflictError, canonicalInboundFingerprint } from "../persistence/inbound-receipt";
import type { UnitOfWork } from "../persistence/ports";
import type { DurableInboundReceipt } from "../persistence/inbound-receipt";
const r: DurableInboundReceipt = {
  unit_id:"unit-synthetic", event_id:"evt-refused-synthetic",
  idempotency_key:"idem-refused-synthetic", fingerprint:"a".repeat(64),
  actor_id:"ops-synthetic", actor_role:"operador_expedicao",device_id:null,
  command_id:"cmd-refused-synthetic",command_type:"AddDeliveryToTrip",
  outcome:"applied",code:null,recorded_at:"2026-10-20T20:00:00Z",
};
async function refused(uow: UnitOfWork): Promise<void> {
  const svc = new EntregasApplicationService(uow);
  const cmd={
    type:"AddDeliveryToTrip" as const,command_id:r.command_id,occurred_at:r.recorded_at,
    actor:{actor_id:r.actor_id,role:"operador_expedicao" as const},
    unit_id:r.unit_id, trip_id:"missing-synthetic",
    delivery_id:"delivery-synthetic",order_ref:"order-synthetic",planned_stop_order:1,
  };
  const receipt={...r,fingerprint:canonicalInboundFingerprint({
    event_id:r.event_id,idempotency_key:r.idempotency_key,command:cmd,
    unit_id:cmd.unit_id,actor_id:cmd.actor.actor_id,actor_role:cmd.actor.role,device_id:r.device_id,
  })};
  const result = await svc.execute(cmd,receipt);
  assert.equal(result.ok,false);
  assert.equal(result.code,"NOT_FOUND");
  // Simula um segundo comando independente que confirmaria sua UoW.
  await uow.commit();
}
async function main() {
  const mem=new MemoryUnitOfWork();
  await refused(mem);
  assert.equal((await mem.newUnit().inboundReceipts.find(r.event_id,r.idempotency_key)).length,0,
    "P0: a recusa retornou sem rollback, e o commit seguinte promoveu ACK falso");
  console.log("OK memoria: recusa nao vira ACK do proximo comando");
  const dir=mkdtempSync(join(tmpdir(),"receipt-no-leak-"));
  try {
    const file=join(dir,"store.json");
    await refused(openFileUnitOfWork(file));
    assert.equal((await openFileUnitOfWork(file).inboundReceipts.find(r.event_id,r.idempotency_key)).length,0,
      "P0: recusa vazou ACK falso para disco");
    console.log("OK arquivo: recusa nao vira ACK do proximo comando");
  } finally { rmSync(dir,{recursive:true,force:true}); }
  // Um segundo arrival_detected igual retorna ok:true sem mudar o dominio.
  // Com recibo staged, sucesso sem commit tambem deixa o ACK sem persistir.
  const memNoop=new MemoryUnitOfWork();
  const svc=new EntregasApplicationService(memNoop);
  const ops={actor_id:"ops-synthetic",role:"operador_expedicao" as const};
  const rider={actor_id:"rider-synthetic",role:"motoboy_interno" as const};
  const base={unit_id:r.unit_id,occurred_at:r.recorded_at};
  const created=await svc.execute({...base,type:"CreateTrip",command_id:"create-synthetic",
    actor:ops,trip_id:"trip-noop-synthetic",
    courier_actor_id:asInternalRiderActorId(rider.actor_id),
    deliveries:[{delivery_id:"delivery-noop-synthetic",order_ref:"order-noop-synthetic"}]});
  assert.equal(created.ok,true,created.error);
  const departed=await svc.execute({...base,type:"ConfirmTripDeparture",
    command_id:"depart-synthetic",actor:rider,trip_id:"trip-noop-synthetic"});
  assert.equal(departed.ok,true,departed.error);
  const arrival={...base,type:"RecordArrivalDetected" as const,
    command_id:"arrival-synthetic",actor:rider,
    trip_id:"trip-noop-synthetic",delivery_id:"delivery-noop-synthetic",
    source:"manual" as const};
  const first=await svc.execute(arrival);
  assert.equal(first.ok,true,first.error);
  const noOpReceipt={...r,event_id:"evt-noop-synthetic",
    idempotency_key:"idem-noop-synthetic",command_id:"arrive-duplicate-synthetic",
    command_type:"RecordArrivalDetected",actor_id:rider.actor_id,
    actor_role:rider.role};
  const cmdNoOp={...arrival,command_id:noOpReceipt.command_id};
  const noOpValid={...noOpReceipt,fingerprint:canonicalInboundFingerprint({
    event_id:noOpReceipt.event_id,idempotency_key:noOpReceipt.idempotency_key,
    command:cmdNoOp,unit_id:cmdNoOp.unit_id,actor_id:cmdNoOp.actor.actor_id,
    actor_role:cmdNoOp.actor.role,device_id:noOpReceipt.device_id,
  })};
  const second=await svc.execute(cmdNoOp,noOpValid);
  assert.equal(second.ok,true,second.error);
  assert.equal((await memNoop.newUnit().inboundReceipts.find(
    noOpReceipt.event_id,noOpReceipt.idempotency_key)).length,1,
    "P0: sucesso idempotente sem mudanca de dominio nao confirmou recibo");
  console.log("OK memoria: sucesso sem mutacao persiste ACK de entrada");
  const fake: TransactionalSqlClient = {
    async query<T extends SqlRow = SqlRow>(_sql:string): Promise<T[]> { return []; },
    async transaction<T>(fn:(tx:SqlClient)=>Promise<T>): Promise<T> { return fn(fake); },
    async close(): Promise<void> {},
  };
  const pg=new PgEntregasUnitOfWork(fake,r.unit_id);
  pg.inboundReceipts.stage(r);
  await assert.rejects(()=>pg.commit(),InboundReceiptConflictError);
  assert.doesNotThrow(()=>pg.inboundReceipts.stage({...r,event_id:"evt-after-rollback",
    idempotency_key:"idem-after-rollback",command_id:"cmd-after-rollback"}),
    "P0: transacao PG falha, mas deixa recibo antigo staged no objeto");
  console.log("OK PG fake: falha transacional limpa stage antes de nova tentativa");
  // Duas execucoes concorrem na MESMA UoW do serviço.
  // A para depois de stagear trip/eventos; B recusa e chama rollback.
  // Sem fila, o rollback de B apaga a viagem de A antes de seu commit.
  const concurrent = new MemoryUnitOfWork();
  const originalRiderGet = concurrent.riders.get.bind(concurrent.riders);
  let signalInside!: () => void;
  let unblock!: () => void;
  const inside = new Promise<void>((resolve) => { signalInside=resolve; });
  const hold = new Promise<void>((resolve) => { unblock=resolve; });
  concurrent.riders.get = async (id) => {
    signalInside();
    await hold;
    return originalRiderGet(id);
  };
  const concurrentSvc = new EntregasApplicationService(concurrent);
  const a = concurrentSvc.execute({
    ...base,type:"CreateTrip",command_id:"cmd-concurrent-a",actor:ops,
    trip_id:"trip-concurrent-a",courier_actor_id:asInternalRiderActorId("rider-a"),
    deliveries:[{delivery_id:"delivery-concurrent-a",order_ref:"order-concurrent-a"}],
  });
  await inside;
  const b = concurrentSvc.execute({
    ...base,type:"AddDeliveryToTrip",command_id:"cmd-concurrent-b",actor:ops,
    trip_id:"trip-that-does-not-exist",delivery_id:"delivery-concurrent-b",
    order_ref:"order-concurrent-b",planned_stop_order:1,
  });
  // Em versão serializada, B deve aguardar A. Na antiga, B fazia rollback aqui.
  await new Promise<void>((resolve) => setTimeout(resolve, 25));
  unblock();
  const [ra,rb]=await Promise.all([a,b]);
  assert.equal(ra.ok,true,ra.error);
  assert.equal(rb.ok,false);
  assert.equal((await concurrent.trips.get("trip-concurrent-a"))?.trip.trip_id,
    "trip-concurrent-a","P0: rollback de B apagou dominio da chamada A");
  assert.ok((await concurrent.events.listAll()).length>0,
    "P0: rollback concorrente apagou event log da viagem A");
  console.log("OK mutex: rejeicao concorrente nao apaga viagem de outro comando");
  // O recibo deve ser derivado da identidade autenticada e comando exato.
  // Nunca confirmar um ACK pre-stageado para outro ator/comando.
  const bindingUow=new MemoryUnitOfWork();
  const bindingSvc=new EntregasApplicationService(bindingUow);
  const wrong={...r,event_id:"evt-binding",idempotency_key:"key-binding",
    command_id:"cmd-diferente",actor_id:"ator-diferente"};
  const mismatch=await bindingSvc.execute({
    ...base,type:"AddDeliveryToTrip",command_id:"cmd-binding",actor:ops,
    trip_id:"trip-inexistente",delivery_id:"delivery-binding",
    order_ref:"order-binding",planned_stop_order:1,
  },wrong);
  assert.equal(mismatch.ok,false);
  assert.equal(mismatch.code,"RECEIPT_BINDING",
    "P0: recibo de outra identidade/comando nao pode acompanhar a execucao");
  assert.equal((await bindingUow.inboundReceipts.find(wrong.event_id,wrong.idempotency_key)).length,0);
  console.log("OK receipt binding: mismatch de ator e comando falha fechado");
  // O formato hexadecimal sozinho NAO garante integridade do payload.
  // Um comando correto, com recibo de mesma unidade e ator mas hash falso,
  // NAO pode ser executado.
  const fpUow=new MemoryUnitOfWork();
  const fpSvc=new EntregasApplicationService(fpUow);
  const fpCmd={...base,type:"CreateTrip" as const,actor:ops,
    command_id:"cmd-fingerprint",
    trip_id:"trip-fingerprint",courier_actor_id:asInternalRiderActorId("rider-fp"),
    deliveries:[{delivery_id:"delivery-fp",order_ref:"order-fp"}]};
  const fpReceipt={...r,event_id:"evt-fingerprint",
    idempotency_key:"key-fingerprint",command_id:fpCmd.command_id,
    command_type:fpCmd.type};
  const fpResult=await fpSvc.execute(fpCmd,fpReceipt);
  assert.equal(fpResult.ok,false,"P0: fingerprint arbitrario nao pode confirmar um comando");
  assert.equal(fpResult.code,"RECEIPT_FINGERPRINT");
  assert.equal(await fpUow.trips.get(fpCmd.trip_id),null);
  console.log("OK fingerprint: hash nao correspondente impede efeito operacional");
  // Colisao decidida pelo indice do banco exige RECHECK de recibo
  // commitado antes de classificar replay versus 409. Nao retornar ERROR
  // generico que o Android pode entender como rejeicao final.
  const dbConflict: TransactionalSqlClient = {
    async query<T extends SqlRow = SqlRow>():Promise<T[]> {return []},
    async transaction<T>(fn:(tx:SqlClient)=>Promise<T>):Promise<T>{
      return fn(dbConflict);
    },
    async close():Promise<void>{},
  };
  const pgConflict=new PgEntregasUnitOfWork(dbConflict,base.unit_id);
  const conflictSvc=new EntregasApplicationService(pgConflict);
  const conflictReceipt={...fpReceipt,fingerprint:canonicalInboundFingerprint({
    event_id:fpReceipt.event_id,idempotency_key:fpReceipt.idempotency_key,
    command:fpCmd,unit_id:fpCmd.unit_id,actor_id:fpCmd.actor.actor_id,
    actor_role:fpCmd.actor.role,device_id:fpReceipt.device_id,
  })};
  const conflictResult=await conflictSvc.execute(fpCmd,conflictReceipt);
  assert.equal(conflictResult.ok,false);
  assert.equal(conflictResult.code,"RECEIPT_CONFLICT_RECHECK",
    "conflito de UNIQUE pede nova consulta, nao ACK nem ERROR ambiguo");
  console.log("OK PG fake: conflito transacional requer releitura do recibo");
  // Tampering apos validar fingerprint, enquanto o dominio aguarda I/O.
  // O payload efetivamente aplicado deve ser um snapshot imutavel do
  // evento recebido, nao uma referencia mutavel do chamador.
  const mutUow=new MemoryUnitOfWork();
  const mutSvc=new EntregasApplicationService(mutUow);
  const mutTrip="trip-snapshot-mutation";
  const createdForMutation=await mutSvc.execute({...base,
    type:"CreateTrip",command_id:"cmd-mutation-create",actor:ops,
    trip_id:mutTrip,courier_actor_id:asInternalRiderActorId("rider-mutation"),
    deliveries:[{delivery_id:"delivery-mutation-base",order_ref:"original-base"}]});
  assert.equal(createdForMutation.ok,true,createdForMutation.error);
  const originalTripGet=mutUow.trips.get.bind(mutUow.trips);
  let enteredGet!:()=>void;
  let releaseGet!:()=>void;
  const enteredRead=new Promise<void>((resolve)=>{enteredGet=resolve});
  const holdRead=new Promise<void>((resolve)=>{releaseGet=resolve});
  mutUow.trips.get=async(id)=>{enteredGet();await holdRead;return originalTripGet(id)};
  const addCmd={...base,type:"AddDeliveryToTrip" as const,
    command_id:"cmd-mutation-add",actor:ops,trip_id:mutTrip,
    delivery_id:"delivery-mutation-new",order_ref:"REF_ORIGINAL",
    planned_stop_order:2,idempotency_key:"idem-mutation-new"};
  const mutReceipt={...r,event_id:"evt-mutation-new",idempotency_key:addCmd.idempotency_key,
    command_id:addCmd.command_id,command_type:addCmd.type,
    fingerprint:canonicalInboundFingerprint({
      event_id:"evt-mutation-new",idempotency_key:addCmd.idempotency_key,
      command:addCmd,unit_id:addCmd.unit_id,actor_id:addCmd.actor.actor_id,
      actor_role:addCmd.actor.role,device_id:null,
    })};
  const mutExecution=mutSvc.execute(addCmd,mutReceipt);
  await enteredRead;
  addCmd.order_ref="REF_ADULTERADA_APOS_HASH";
  releaseGet();
  const mutResult=await mutExecution;
  assert.equal(mutResult.ok,true,mutResult.error);
  const tripSaved=await originalTripGet(mutTrip);
  const newDelivery=tripSaved?.deliveries.find((x)=>x.delivery_id==="delivery-mutation-new");
  assert.equal(newDelivery?.order_ref,"REF_ORIGINAL",
    "P0: a operacao aplicou payload alterado apos calculo do fingerprint");
  console.log("OK snapshot: mutacao concorrente nao altera comando aplicado");
  console.log("RECEIPT_LIFECYCLE: 9/9 OK (SINTETICO)");
}
void main().catch(e=>{console.error("RED "+e);process.exitCode=1;});
