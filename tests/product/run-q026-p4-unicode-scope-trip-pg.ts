/**
 * Q-026 P4 adversarial ordering: JavaScript localeCompare treats NFC and
 * decomposed NFD unit/trip IDs as a tie. Canonical sort is stable and retains
 * input order. PG SQL ORDER BY uses a *different collation* and can change
 * scopes/trips sequence even if every fact and device has parity.
 */
import assert from "node:assert/strict";
import { bancoIsolado } from "../../src/platform/banco-isolado";
import { lerRealidadeDeEntregas } from "../../src/platform/leitura/realidade-de-entregas";
import { lerRealidadeDeEntregasIncremental } from "../../src/platform/leitura/realidade-de-entregas-incremental";

const url=(process.env.DELIVERYOS_PG_URL??"").trim();
if(!url){console.error("Q026_SCOPE_TRIP_PG_REQUIRED");process.exit(78)}
const uA="UNIT-é",uB="UNIT-e\u0301";
const tA="TRIP-é",tB="TRIP-e\u0301";
assert.notEqual(uA,uB);assert.equal(uA.localeCompare(uB),0);
assert.notEqual(tA,tB);assert.equal(tA.localeCompare(tB),0);
const facts=[
 {id:"event-001",u:uA,t:tA},
 {id:"event-004",u:uA,t:tB},
 {id:"event-002",u:uB,t:tA},
 {id:"event-003",u:uB,t:tB}
];
const now=new Date("2026-10-10T18:00:00Z");
function projectionOrder(v:Awaited<ReturnType<typeof lerRealidadeDeEntregas>>|
 Awaited<ReturnType<typeof lerRealidadeDeEntregasIncremental>>){
 return v.projecoes.map(scope=>({
  unit:scope.unit_id,mode:scope.source_mode,
  trips:scope.viagens.map(t=>({id:t.trip_id,device:t.device_id,events:t.eventos.length,state:t.estado}))
 }));
}
void(async()=>{
 for(const ordering of [facts,[...facts].reverse()]){
  const db=await bancoIsolado(url,undefined,"q026scopep4");
  try{
    for(const u of [uA,uB])await db.cliente.query(
      "INSERT INTO identity.unit(unit_id,display_name) VALUES ($1,'Synthetic')",[u]);
    for(const f of ordering){
     await db.cliente.query(
      "INSERT INTO platform.event_log("+
      "event_id,unit_id,object_type,object_id,event_type,payload,occurred_at,"+
      "recorded_at,origin,idempotency_key,contract_version,source_mode,sequence_local,clock_trust) "+
      "VALUES ($1,$2,'trip',$3,'trip_started','{}'::jsonb,"+
      "'2026-10-09T17:00:00Z','2026-10-09T17:00:00Z',"+
      "'device',$1,'trip_started@1.0.0','simulated',5,'trusted')",
      [f.id,f.u,f.t]
     );
    }
    const canonical=await lerRealidadeDeEntregas(db.cliente,{agora:now});
    const incremental=await lerRealidadeDeEntregasIncremental(db.cliente,{agora:now});
    assert.equal(canonical.projecoes.length,2);
    assert.equal(incremental.projecoes.length,2);
    const expected=projectionOrder(canonical);
    const observed=projectionOrder(incremental);
    assert.deepEqual(observed,expected,
      "canonical stable localeCompare ordering of scopes/trips must remain byte-for-byte identical");
    console.log("Q026_P4_SCOPE_TRIP_ORDER_CASE_PASS "+JSON.stringify({
      physical_first_unit:ordering[0].u,
      canonical_scopes:expected.map(p=>p.unit),
      canonical_trips:expected.map(p=>p.trips.map(t=>t.id)),
      incremental_equal:true
    }));
  }finally{await db.descartar()}
 }
 console.log("Q026_P4_SCOPE_TRIP_ORDER_PG_PASS two-orders");
})().catch(e=>{console.error("Q026_P4_SCOPE_TRIP_ORDER_PG_FAILED",e);process.exitCode=1});
