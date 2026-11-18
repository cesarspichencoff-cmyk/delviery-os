import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { criarLedgerShadow } from "../../src/product/eventos/ledger-shadow";
import { adaptarSaudeReviewGestor } from "../../src/product/eventos/gestor-health-review-bridge";
import { executarSaudeGestorEmShadow } from "../../src/product/eventos/gestor-health-shadow-flow";

const now="2026-11-12T21:15:00-03:00";
const source=()=>({
 schema:"deliveryos.gestor-mounted-window-differential.v1",
 state:"PRIVATE_DIFFERENTIAL_REVIEW_ONLY",source:"MOUNTED_CARDS_ONLY",
 candidateOrders:2,candidateLines:3,candidateUnits:5,
 merchantVerified:false,fullCoverageVerified:false,upstreamFreshnessVerified:false,
 ordersPublishable:0,homePublishAuthorized:false,disappearanceMeansCancellation:false,
 privateCustomer:"CUSTOMER_11999998888",
});
const inp=(revision=1,review:unknown=source(),captured_at=now)=>({
 review,now,captured_at,source_revision:revision,tenant_id:"TATA_LAB",unit_id:"ITAIM" as const
});
const dir=mkdtempSync(join(tmpdir(),"deliveryos-gestor-health-shadow-lab-"));
const filename=join(dir,"isolated-shadow-health.jsonl");
let n=0;
function check(label:string,fn:()=>void){fn();n++;console.log("PASS "+label)}
try {
 const disabled=criarLedgerShadow({arquivo:filename});
 check("shadow journal disabled by default, no file side effect",()=>{
  const r=executarSaudeGestorEmShadow(inp(),disabled);
  assert.equal(r.state,"SHADOW_DISABLED");assert.equal(existsSync(filename),false);
 });
 const enabled=criarLedgerShadow({arquivo:filename,habilitado:true});
 check("first partial source writes one explicitly fixture event",()=>{
  const r=executarSaudeGestorEmShadow(inp(),enabled);
  assert.equal(r.state,"SHADOW_PROJECTED");
  if(r.state!=="SHADOW_PROJECTED")throw Error("NOT_PROJECTED");
  assert.equal(r.registration.tipo,"gravado");
  assert.equal(r.projection.fontes[0].estado,"parcial");
  assert.equal(r.projection.linhagem.natureza,"demonstracao");
  assert.equal(r.orders_publishable,0);
 });
 check("replayed source event does not contain customer, item or order",()=>{
  const text=readFileSync(filename,"utf8");
  assert.equal(text.includes("CUSTOMER_"),false);
  assert.equal(text.includes("11999998888"),false);
  assert.equal(text.includes("candidateOrders"),false);
  assert.equal(text.includes("pedido_ciclo_observado"),false);
 });
 check("same fact idempotent across restart uses existing ledger index",()=>{
  const restart=criarLedgerShadow({arquivo:filename,habilitado:true});
  const r=executarSaudeGestorEmShadow(inp(),restart);
  assert.equal(r.state,"SHADOW_PROJECTED");
  if(r.state!=="SHADOW_PROJECTED")throw Error("NOT_PROJECTED");
  assert.equal(r.registration.tipo,"duplicata_identica");
  assert.equal(restart.replay().length,1);
 });
 check("stale local view sets STALE but no business orders",()=>{
  const r=executarSaudeGestorEmShadow(inp(2,source(),"2026-11-12T21:10:00-03:00"),enabled);
  assert.equal(r.state,"SHADOW_PROJECTED");
  if(r.state!=="SHADOW_PROJECTED")throw Error("NOT_PROJECTED");
  assert.equal(r.projection.fontes[0].estado,"stale");
  assert.equal(r.projection.pedidos_ativos.length,0);
 });
 check("source HOLD sets UNAVAILABLE, never healthy",()=>{
  const r=executarSaudeGestorEmShadow(inp(3,{...source(),state:"HOLD"}),enabled);
  assert.equal(r.state,"SHADOW_PROJECTED");
  if(r.state!=="SHADOW_PROJECTED")throw Error("NOT_PROJECTED");
  assert.equal(r.projection.fontes[0].estado,"indisponivel");
  assert.equal(r.projection.carga_por_praca.length,0);
 });
 check("wrong unit refused before any write",()=>{
  const before=enabled.replay().length;
  const r=executarSaudeGestorEmShadow({...inp(4),unit_id:"PINHEIROS" as never},enabled);
  assert.equal(r.state,"HOLD");assert.equal(enabled.replay().length,before);
 });
 check("untrusted event type in same shadow ledger fail-closes projector",()=>{
  const rogue=adaptarSaudeReviewGestor(inp(4));
  if(rogue.state!=="REVIEW_ONLY_FIXTURE")throw Error("BAD_FIXTURE");
  const polluted={...rogue.event,event_id:"FIXTURE_ROGUE_ORDER",source_event_id:"ROGUE_ORDER",
    event_type:"pedido_ciclo_observado",payload:{pedido_id:"FICTITIOUS_ORDER",estado:"aceito",source_revision:4}};
  const isolated=criarLedgerShadow({arquivo:join(dir,"polluted-shadow.jsonl"),habilitado:true});
  assert.equal(isolated.registrar(polluted).tipo,"gravado");
  const r=executarSaudeGestorEmShadow(inp(5),isolated);
  assert.equal(r.state,"HOLD");assert.equal(r.projection,null);
  assert.equal(r.home_publish_authorized,false);
 });
 check("shadow refuses official production path even when requested",()=>{
  assert.throws(()=>criarLedgerShadow({arquivo:join(dir,"official-ledger.jsonl"),habilitado:true}));
 });
 check("no Home/printer promotion after replay",()=>{
  const r=executarSaudeGestorEmShadow(inp(6),enabled);
  assert.equal(r.state,"SHADOW_PROJECTED");
  assert.equal(r.home_publish_authorized,false);
  assert.equal(r.production_effects_authorized,false);
  assert.equal(r.orders_publishable,0);
 });
} finally {
 rmSync(dir,{recursive:true,force:true});
}
console.log("GESTOR_HEALTH_SHADOW_REPLAY_PASS "+n+"/"+n+" FOX_LAB_ONLY");
