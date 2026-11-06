import assert from "node:assert/strict";
import {prepararGestoBancadaShadow} from "../product/eventos/gesto-bancada-shadow";
import {validarEvento} from "../product/eventos/catalogo-operacional";
import {criarLedgerShadow} from "../product/eventos/ledger-shadow";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {projetarLeitura} from "../product/eventos/projetar-leitura";
import type {RevisaoVinculoReaderTrabalho} from "../product/eventos/vinculo-reader-trabalho-praca";
import type {CruzamentoClassificacaoTrabalhoReview} from "../product/eventos/revisar-classificacao-trabalho-praca";
const ref="reader-line:"+"a".repeat(64);
const binding:RevisaoVinculoReaderTrabalho={
 schema:"reader-work-line-binding@1-review-only",state:"NO_PHYSICAL_EVENTS",reasons:[],
 opaque_order_ref:"reader-order:"+"b".repeat(64),projection:null,
 lines:[{line_ref:ref,product_code:"PROD-FICTICIO",quantity:2,event_ids:[],
   pracas_declaradas:[],conclusao_fisica_comprovada:false}],
 reader_transaction_attested:false,physical_event_attested:false,
 ready_for_dispatch:null,live_home_authorized:false,no_action_executed:true,
};
const classificacao:CruzamentoClassificacaoTrabalhoReview={
 schema:"reader-classification-work-review@1",status:"REVIEW_CANDIDATE_ONLY",
 reasons:[],checked_lines:1,declared_station_candidates:[
 {line_ref:ref,station:"combinados",work_event_count:0}],
 current_catalog_homologation_proven:false,station_physically_attested:false,
 work_producer_authorized:false,ready_for_dispatch:null,live_home_authorized:false,
 source_modified:false,
};
const pedido={line_ref:ref,praca:"combinados" as const,estado:"concluido" as const,
 revisao:2,ocorrido_em:"2026-11-04T15:31:40Z"};
const call=(change:Record<string,unknown>={})=>prepararGestoBancadaShadow({
 tenant:"tata",unidade:"ITAIM",server_now:"2026-11-04T15:32:00Z",
 binding,classificacao,pedido,
 autorizar:async()=>({decisao:"permitir",terminal_opaco:"terminal-3",unidade:"ITAIM",praca:"combinados"}),
 ...change,
});
async function main(){
 let passed=0;const test=async (name:string,fn:()=>Promise<void>)=>{await fn();passed++;console.log("PASS "+name);};
 await test("valid authorized gesture remains a demonstration fact",async()=>{
  const r=await call();
  assert.equal(r.status,"SHADOW_PREVIEW");assert.ok(r.evento);
  assert.equal(r.evento.source,"fixture:registro-operacao");
  assert.equal(r.physical_ready_proven,false);
  assert.equal(r.live_home_authorized,false);
  assert.equal(validarEvento(r.evento).ok,true);
  const p=projetarLeitura([r.evento],{tenant_id:"tata",unit_id:"ITAIM",agora_iso:"2026-11-04T15:32:00Z"});
  assert.equal(p.linhagem.natureza,"demonstracao");
  assert.equal(p.pedidos_prontos.length,0);
 });
 await test("identical replay preserves idempotent event key",async()=>{
  const a=await call(),b=await call();
  assert.equal(a.status,"SHADOW_PREVIEW");assert.equal(b.status,"SHADOW_PREVIEW");
  assert.equal(a.evento.event_id,b.evento.event_id);
 });
 await test("wrong station and unknown line never invoke authorizer",async()=>{
  let calls=0;
  const autorizar=async()=>{calls++;return {decisao:"negar" as const};};
  for(const edit of [{praca:"duplas"},{line_ref:"reader-line:"+"c".repeat(64)}]){
    const r=await call({pedido:{...pedido,...edit},autorizar});
    assert.equal(r.status,"HOLD");assert.equal(r.evento,null);
  }
  assert.equal(calls,0);
 });
 await test("unqualified classification or mismatched station is HOLD",async()=>{
  const a=await call({classificacao:{...classificacao,status:"HOLD"}});
  const b=await call({classificacao:{...classificacao,declared_station_candidates:[
    {line_ref:ref,station:"cozinha_quentes",work_event_count:0}]}});
  assert.equal(a.status,"HOLD");assert.equal(b.status,"HOLD");
 });
 await test("time drift, denied permission, exceptions never emit event",async()=>{
  const cases=[
    {pedido:{...pedido,ocorrido_em:"2026-11-04T14:00:00Z"}},
    {autorizar:async()=>({decisao:"negar" as const})},
    {autorizar:async()=>{throw Error("UNAVAILABLE")}},
  ];
  for(const edit of cases){const r=await call(edit);assert.equal(r.status,"HOLD");assert.equal(r.evento,null)}
 });
 await test("read model exposes no customer names or native product codes",async()=>{
  const r=await call(),out=JSON.stringify(r);
  for(const needle of ["PROD-FICTICIO","LABSALE","CLIENTE-FICTICIO"])
    assert.equal(out.includes(needle),false);
 });
 await test("one touch through existing shadow ledger survives restart with same event",async()=>{
  const dir=mkdtempSync(join(tmpdir(),"deliveryos-gesto-"));
  try{
   const file=join(dir,"shadow.jsonl"),result=await call();
   assert.equal(result.status,"SHADOW_PREVIEW");
   if(!result.evento)throw Error("missing demo event");
   const first=criarLedgerShadow({arquivo:file,habilitado:true});
   assert.equal(first.registrar(result.evento).tipo,"gravado");
   const reloaded=criarLedgerShadow({arquivo:file,habilitado:true});
   assert.equal(reloaded.replay().length,1);
   assert.equal(reloaded.registrar(result.evento).tipo,"duplicata_identica");
   const p=projetarLeitura(reloaded.replay(),{
    tenant_id:"tata",unit_id:"ITAIM",agora_iso:"2026-11-04T15:32:00Z"});
   assert.equal(p.linhagem.natureza,"demonstracao");
   assert.equal(p.pedidos_prontos.length,0);
  }finally{rmSync(dir,{recursive:true,force:true})}
 });
 console.log("GESTO_BANCADA_SHADOW_PASS "+passed+"/"+passed+" SYNTHETIC_ONLY");
}
main().catch(e=>{console.error(e);process.exitCode=1});
