/** Contrato puro de serializacao canonica para comandos do piloto. SEM I/O externo. */
import assert from "node:assert/strict";
import { canonicalInboundFingerprint } from "./inbound-receipt";
const fixed={
  event_id:"evt-normalize",idempotency_key:"key-normalize",
  unit_id:"unit-normalize",actor_id:"ops-normalize",
  actor_role:"operador_expedicao",device_id:null,
};
const hash=(command:Record<string,unknown>)=>canonicalInboundFingerprint({...fixed,command});
let pass=0;
function check(name:string,fn:()=>void){fn();pass++;console.log("OK "+name);}
check("omissao de propriedade opcional undefined tem hash identico",()=>{
  const a={type:"CreateTrip",trip_id:"trip-1",deliveries:[{order_ref:"ORDER1"}]};
  const b={type:"CreateTrip",trip_id:"trip-1",channel:undefined,
    deliveries:[{order_ref:"ORDER1",channel:undefined}]};
  assert.equal(hash(a),hash(b));
});
check("troca de ordem de chaves nao altera o hash",()=>{
  assert.equal(hash({type:"A",a:1,b:{x:1,y:2}}),hash({b:{y:2,x:1},a:1,type:"A"}));
});
check("payload realmente diferente troca o hash",()=>{
  assert.notEqual(hash({type:"CreateTrip",trip_id:"1"}),hash({type:"CreateTrip",trip_id:"2"}));
});
check("undefined em array falha fechado",()=>{
  assert.throws(()=>hash({type:"CreateTrip",deliveries:[undefined]}),/array|undefined|invalido/i);
});
check("ciclo no payload falha fechado",()=>{
  const a:Record<string,unknown>={type:"CreateTrip"};a.self=a;
  assert.throws(()=>hash(a),/ciclo|circular/i);
});
check("numero nao-finito falha fechado",()=>{
  assert.throws(()=>hash({type:"CreateTrip",dwell:Infinity}),/Numero nao finito/);
});
console.log("INBOUND_FINGERPRINT_NORMALIZATION: "+pass+"/6 OK (PURO)");
