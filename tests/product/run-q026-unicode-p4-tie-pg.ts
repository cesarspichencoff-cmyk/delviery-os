/**
 * Q-026 P4 audit: distinct Unicode spellings with identical localeCompare()
 * represent an EXACT comparator tie. The canonical projection's stable sort
 * retains original row order, including the last fact's device_id.
 *
 * PG16 ephemeral, no production data, both insertion orders.
 */
import assert from "node:assert/strict";
import { bancoIsolado } from "../../src/platform/banco-isolado";
import { lerRealidadeDeEntregas } from "../../src/platform/leitura/realidade-de-entregas";
import { lerRealidadeDeEntregasIncremental } from "../../src/platform/leitura/realidade-de-entregas-incremental";
import { lerFatosParaReplay } from "../../src/platform/projections/replay-do-event-log";
import { TIPOS_DA_OPERACAO_VIVA } from "../../src/platform/runtime/handler-operacao-viva";

const url=(process.env.DELIVERYOS_PG_URL??"").trim();
if(!url){console.error("Q026_UNICODE_TIE_PG_REQUIRED");process.exit(78)}
const first="event-é";
const second="event-e\u0301";
assert.notEqual(first,second);
assert.equal(first.localeCompare(second),0,
 "Node ICU should preserve exact collator tie for canonically equivalent Unicode");
type Fact={id:string;device:string};
const facts:Fact[]=[{id:first,device:"DEV-A"},{id:second,device:"DEV-B"}];
const now=new Date("2026-10-10T18:00:00Z");
void(async()=>{
  for(const insertionOrder of [facts,[...facts].reverse()]){
    const db=await bancoIsolado(url,undefined,"q026unicode");
    try{
      await db.cliente.query("INSERT INTO identity.unit(unit_id,display_name) VALUES ('ITAIM','Synthetic')");
      await db.cliente.query(
        "INSERT INTO identity.device(device_id,unit_id,label,registered_at) VALUES "+
        "('DEV-A','ITAIM','Synthetic A','2026-10-09T00:00:00Z'),"+
        "('DEV-B','ITAIM','Synthetic B','2026-10-09T00:00:00Z')");
      for(const f of insertionOrder){
        await db.cliente.query(
          "INSERT INTO platform.event_log("+
          "event_id,unit_id,object_type,object_id,event_type,payload,occurred_at,"+
          "recorded_at,origin,idempotency_key,contract_version,source_mode,sequence_local,device_id,clock_trust) "+
          "VALUES ($1,'ITAIM','trip','TIE-TRIP','gps_batch_received','{}'::jsonb,"+
          "'2026-10-09T17:00:00Z','2026-10-09T17:00:00Z','device',$1,"+
          "'gps_batch_received@1.0.0','simulated',5,$2,'trusted')",
          [f.id,f.device]
        );
      }
      const canonical=await lerRealidadeDeEntregas(db.cliente,{agora:now});
      const inc=await lerRealidadeDeEntregasIncremental(db.cliente,{agora:now});
      const forense=await lerFatosParaReplay(db.cliente,TIPOS_DA_OPERACAO_VIVA);
      assert.equal(forense.aptos.length,2);
      assert.equal(canonical.projecoes.length,1);
      assert.equal(inc.projecoes.length,1);
      const ct=canonical.projecoes[0].viagens[0];
      const it=inc.projecoes[0].viagens[0];
      assert.equal(ct.eventos.length,2);
      assert.equal(it.eventos.length,2);
      assert.equal(it.device_id,ct.device_id,
        "incremental P4 tie must choose EXACT same device as canonical stable sort");
      console.log("Q026_UNICODE_TIE_P4_CASE_PASS "+JSON.stringify({
        insertion_order:insertionOrder.map(x=>x.device),
        canonical_device:ct.device_id,incremental_device:it.device_id,
        unicode_collator_tie:true,forensic_events_preserved:forense.aptos.length
      }));
    }finally{await db.descartar()}
  }
  console.log("Q026_UNICODE_TIE_P4_PG_PASS two-orders");
})().catch(e=>{console.error("Q026_UNICODE_TIE_P4_PG_FAILED",e);process.exitCode=1});
