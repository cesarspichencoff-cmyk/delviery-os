/** Synthetic integration into the EXISTING health producer and projector. */
import assert from "node:assert/strict";
import { adaptarSaudeReviewGestor } from "../../src/product/eventos/gestor-health-review-bridge";
import { projetarLeitura } from "../../src/product/eventos/projetar-leitura";
import { validarEvento } from "../../src/product/eventos/catalogo-operacional";

const t="2026-11-12T21:15:00-03:00";
const source=()=>({
 schema:"deliveryos.gestor-mounted-window-differential.v1",
 state:"PRIVATE_DIFFERENTIAL_REVIEW_ONLY",
 source:"MOUNTED_CARDS_ONLY",candidateOrders:2,candidateLines:3,candidateUnits:5,
 merchantVerified:false,fullCoverageVerified:false,upstreamFreshnessVerified:false,
 ordersPublishable:0,homePublishAuthorized:false,
 disappearanceMeansCancellation:false,
 secret_customer:"DO_NOT_LEAK_11999998888",
});
const input=(review:unknown=source(),captured_at=t)=>({
 review,now:t,captured_at,source_revision:1,tenant_id:"TATA_LAB",unit_id:"ITAIM" as const,
});
let n=0;
function check(name:string, fn:()=>void){fn();n++;console.log("PASS "+name)}
const read=(r:ReturnType<typeof adaptarSaudeReviewGestor>)=>{
 assert.equal(r.state,"REVIEW_ONLY_FIXTURE");
 if(r.state!=="REVIEW_ONLY_FIXTURE")throw Error("UNEXPECTED_HOLD");
 assert.equal(validarEvento(r.event).ok,true);
 const p=projetarLeitura([r.event],{tenant_id:"TATA_LAB",unit_id:"ITAIM",agora_iso:t});
 assert.equal(p.linhagem.natureza,"demonstracao");
 assert.equal(p.pedidos_ativos.length,0);
 assert.equal(p.carga_por_praca.length,0);
 assert.equal(p.pedidos_prontos.length,0);
 assert.equal(p.confianca.estado,"nao_estimada");
 assert.equal(r.orders_publishable,0);
 assert.equal(r.home_publish_authorized,false);
 assert.equal(JSON.stringify(r).includes("DO_NOT_LEAK"),false);
 return p;
};
check("fresh mounted Gestor produces only PARTIAL source state",()=>{
 const p=read(adaptarSaudeReviewGestor(input()));
 assert.deepEqual(p.fontes,[{id:"gestor_ifood_mounted_view",estado:"parcial"}]);
});
check("stale local capture cannot show source healthy or zero orders",()=>{
 const p=read(adaptarSaudeReviewGestor(input(source(),"2026-11-12T21:10:00-03:00")));
 assert.equal(p.fontes[0].estado,"stale");
});
check("HOLD differential becomes unavailable, not healthy",()=>{
 const p=read(adaptarSaudeReviewGestor(input({...source(),state:"HOLD"})));
 assert.equal(p.fontes[0].estado,"indisponivel");
});
check("unverified merchant source still PARTIAL even with nonzero card count",()=>{
 const r=adaptarSaudeReviewGestor(input({...source(),candidateOrders:900}));
 const p=read(r);assert.equal(p.fontes[0].estado,"parcial");
});
check("malformed review never creates accepted order",()=>{
 const p=read(adaptarSaudeReviewGestor(input({foo:"bar"})));
 assert.equal(p.fontes[0].estado,"indisponivel");
});
check("future local clock refuses generation",()=>{
 const r=adaptarSaudeReviewGestor(input(source(),"2026-11-12T21:16:00-03:00"));
 assert.equal(r.state,"HOLD");assert.equal(r.event,null);
});
check("wrong unit and tenant refused",()=>{
 assert.equal(adaptarSaudeReviewGestor({...input(),unit_id:"PINHEIROS" as never}).state,"HOLD");
 assert.equal(adaptarSaudeReviewGestor({...input(),tenant_id:"private@account"}).state,"HOLD");
});
check("self-claim merchant verified never gets source healthy",()=>{
 const p=read(adaptarSaudeReviewGestor(input({...source(),merchantVerified:true})));
 assert.equal(p.fontes[0].estado,"indisponivel");
});
check("source health event idempotent on repeated same revision",()=>{
 const x=adaptarSaudeReviewGestor(input());
 if(x.state!=="REVIEW_ONLY_FIXTURE")throw Error("hold");
 const p=projetarLeitura([x.event,x.event],{tenant_id:"TATA_LAB",unit_id:"ITAIM",agora_iso:t});
 assert.equal(p.eventos_ignorados,1);assert.equal(p.fontes[0].estado,"parcial");
});
check("event source explicitly fixture and never real mode",()=>{
 const x=adaptarSaudeReviewGestor(input());
 if(x.state!=="REVIEW_ONLY_FIXTURE")throw Error("hold");
 assert.ok(x.event.source.startsWith("fixture:"));
 assert.equal(x.event.event_type,"source_health_changed");
 assert.equal(x.upstream_proven,false);
});
console.log("GESTOR_SOURCE_HEALTH_EXISTING_PROJECTOR_PASS "+n+"/"+n+" SYNTHETIC");
