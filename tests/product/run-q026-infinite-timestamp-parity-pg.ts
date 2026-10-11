/**
 * Q-026: Q016 canonical decoder must quarantine unparseable PG timestamps
 * and unsafe sequence values, never crash an ENTIRE presentation read.
 * Both paths read the same disposable PostgreSQL16 under RR READ ONLY.
 */
import assert from "node:assert/strict";
import { bancoIsolado } from "../../src/platform/banco-isolado";
import { lerRealidadeDeEntregas } from "../../src/platform/leitura/realidade-de-entregas";
import { lerRealidadeDeEntregasIncremental } from "../../src/platform/leitura/realidade-de-entregas-incremental";
import { lerFatosParaReplay } from "../../src/platform/projections/replay-do-event-log";
import { TIPOS_DA_OPERACAO_VIVA } from "../../src/platform/runtime/handler-operacao-viva";

const admin=(process.env.DELIVERYOS_PG_URL??"").trim();
if(!admin){console.error("Q026_INVALID_TIME_PG_REQUIRED");process.exit(78)}
const now=new Date("2026-10-10T18:00:00Z");
const normalized=(read:Awaited<ReturnType<typeof lerRealidadeDeEntregas>>|
  Awaited<ReturnType<typeof lerRealidadeDeEntregasIncremental>>)=>JSON.stringify({
  version:read.versao,source:read.fonte,at:read.lida_em,
  unknown:read.historico_sem_modo,devices:read.aparelhos,
  projection:read.projecoes.map(s=>({
    unit_id:s.unit_id,source_mode:s.source_mode,
    trips:s.viagens.map(t=>({
      trip_id:t.trip_id,unit_id:t.unit_id,source_mode:t.source_mode,
      state:t.estado,device_id:t.device_id,ultimo_fato_em:t.ultimo_fato_em,
      ocorrencias_abertas:t.ocorrencias_abertas,ultima_posicao_em:t.ultima_posicao_em,
      frescor:t.frescor,event_count:t.eventos.length
    }))
  }))
});
void(async()=>{
 const db=await bancoIsolado(admin,undefined,"q026infinite");
 try{
  await db.cliente.query("INSERT INTO identity.unit(unit_id,display_name) VALUES ('ITAIM','Synthetic Itaim')");
  await db.cliente.query(
    "INSERT INTO identity.device(device_id,unit_id,label,registered_at) "+
    "VALUES ('BADTIME-DEV','ITAIM','Synthetic','2026-10-09T00:00:00Z')");
  const values=[
    ["good-1","trip_started","2026-10-09T15:00:00Z",1],
    ["bad-infinity","gps_batch_received","infinity",2],
    ["bad-neg-infinity","gps_batch_received","-infinity",3],
    ["bad-unsafe-seq","gps_batch_received","2026-10-09T16:00:00Z",9007199254740992],
    ["good-2","gps_batch_received","2026-10-09T17:00:00Z",4]
  ] as const;
  for(const [id,type,occurred,sequence] of values){
    await db.cliente.query(
      "INSERT INTO platform.event_log("+
      "event_id,unit_id,object_type,object_id,event_type,payload,occurred_at,"+
      "recorded_at,origin,idempotency_key,contract_version,source_mode,sequence_local,device_id,clock_trust) "+
      "VALUES ($1,'ITAIM','trip','VALID-TRIP',$2,'{}'::jsonb,$3::timestamptz,"+
      "'2026-10-09T18:00:00Z','device',$1,$4,'simulated',$5,'BADTIME-DEV','trusted')",
      [id,type,occurred,type+"@1.0.0",String(sequence)]
    );
  }
  const q016=await lerFatosParaReplay(db.cliente,TIPOS_DA_OPERACAO_VIVA);
  assert.equal(q016.lidas,5);
  assert.equal(q016.aptos.length,2);
  assert.equal(q016.corrompidas.length,3);
  const why=q016.corrompidas.map(x=>x.event_id).sort();
  assert.deepEqual(why,["bad-infinity","bad-neg-infinity","bad-unsafe-seq"].sort());
  const canonical=await lerRealidadeDeEntregas(db.cliente,{agora:now});
  assert.equal(canonical.projecoes.length,1);
  assert.equal(canonical.projecoes[0].viagens.length,1);
  assert.equal(canonical.projecoes[0].viagens[0].eventos.length,2);
  const inc=await lerRealidadeDeEntregasIncremental(db.cliente,{agora:now});
  assert.equal(normalized(inc),normalized(canonical),
    "incremental must match Q016 canonical quarantine of infinite timestamps");
  console.log("Q026_CORRUPT_TIME_PARITY_PG_PASS "+JSON.stringify({
    total_event_rows:q016.lidas,aptos:q016.aptos.length,
    quarantined:why,canonical_equals_incremental:true,
    no_partial_healthy_result:true,postgres:"ephemeral PG16"
  }));
 }finally{await db.descartar()}
})().catch(e=>{console.error("Q026_CORRUPT_TIME_PARITY_PG_FAILED",e);process.exitCode=1});
