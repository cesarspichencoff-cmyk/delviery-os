/**
 * Safe classification gate: exercises existing Reader line work bridge using
 * PR135 review data SHAPE. No SQL, catalog authority, physical events or Home.
 */
import assert from "node:assert/strict";
import { produzirTrabalhoPraca } from "../product/eventos/produtor-trabalho-praca";
import { vincularReaderTrabalhoPraca, type RevisaoNativaParaTrabalho,
 type RevisaoVinculoReaderTrabalho } from "../product/eventos/vinculo-reader-trabalho-praca";
import { revisarClassificacaoTrabalhoPraca, type RevisaoClassificacaoPR135,
 type ClaimClassificacaoPR135, type ConvergenciaCatalogoPR135 } from
 "../product/eventos/revisar-classificacao-trabalho-praca";

const now="2026-11-04T18:05:00.000Z";
const rev:RevisaoNativaParaTrabalho={
 source_mode:"control",
 identity:{unit_id:"0001",store_id:"01",nr_venda_rest:"LABSALE",
  nr_comanda:"LABORDER",origin:"DLV_IFO",opened_at:"2026-11-04T18:01:00.000Z",
  snapshot_hash:"a".repeat(64)},
 items:[
  {line_no:"L01",product_code:"0000001111",route_code:"9200001000",quantity:2},
  {line_no:"L02",product_code:"0000001112",route_code:"9200002000",quantity:1}
 ]
};
const claims:ClaimClassificacaoPR135[]=[
 {source_item_index:0,product_code:"9.20.00.010.00",product_name:"PRODUTO LAB 1",
  quantity:2,station:"combinados",family:"COMBINADOS"},
 {source_item_index:1,product_code:"9.20.00.020.00",product_name:"PRODUTO LAB 2",
  quantity:1,station:"enrolados",family:"ENROLADOS"},
];
function classReview():RevisaoClassificacaoPR135{
 return {
  status:"REVIEW_CANDIDATE_ONLY",native_pair_self_consistency_checked:true,
  exact_native_items_bound:true,independent_source_attested:false,
  classification_approved:false,
  revision_binding:{native_snapshot_sha256:rev.identity.snapshot_hash,
   binding_sha256:"b".repeat(64)},
  review:{status:"REVIEW_CANDIDATE_ONLY",
   current_catalog_homologation_proven:false,provenance_independently_attested:false,
   entries:claims.map(c=>({source_item_index:c.source_item_index,
    quantity:c.quantity,station_proof:"UNKNOWN",product:{nome:c.product_name,
      classification:{station:c.station,family:c.family}}}))}
 };
}
const convergence:ConvergenciaCatalogoPR135={
 status:"JOINT_SELF_CONSISTENCY_REVIEW_ONLY",identity_match_count:2,
 unresolved_line_count:0,receipt_sha256:"c".repeat(64),
 catalog_independently_attested:false,classification_approved:false,
};
const joined=(workEvents:readonly unknown[]=[],revision=rev)=>
 vincularReaderTrabalhoPraca({revision,tenant:"tata",unit:"ITAIM",now,workEvents});
function event(index:number,station:"combinados"|"enrolados",quantity:number){
 const b=joined();
 const r=produzirTrabalhoPraca({
  tenant:"tata",unidade:"ITAIM",praca:station,pedido_id:b.opaque_order_ref!,
  grupo:b.lines[index]!.line_ref,estado:"aguardando",
  ocorrido_em:"2026-11-04T18:02:00.000Z",observado_em:"2026-11-04T18:02:00.000Z",
  operador:"terminal-1",revisao:1,quantidade:quantity
 });
 assert.equal(r.ok,true);
 return (r as Extract<typeof r,{ok:true}>).evento;
}
function review(o:{revision?:RevisaoNativaParaTrabalho;events?:readonly unknown[];
  classification?:RevisaoClassificacaoPR135;claims?:readonly ClaimClassificacaoPR135[];
  catalog?:ConvergenciaCatalogoPR135;binding?:RevisaoVinculoReaderTrabalho}={}){
 const revision=o.revision??rev;
 return revisarClassificacaoTrabalhoPraca({
  revision,binding:o.binding??joined(o.events??[],revision),
  classification:o.classification??classReview(),
  claims:o.claims??claims,catalog:o.catalog??convergence,
 });
}
let ok=0;
function test(label:string,run:()=>void){run();ok++;console.log("PASS "+label);}
test("exact code-index-qty-station review never grants authority or ready",()=>{
 const x=review();
 assert.equal(x.status,"REVIEW_CANDIDATE_ONLY",x.reasons.join(","));
 assert.equal(x.checked_lines,2);
 assert.deepEqual(x.declared_station_candidates.map(x=>x.station),
  ["combinados","enrolados"]);
 assert.equal(x.current_catalog_homologation_proven,false);
 assert.equal(x.station_physically_attested,false);
 assert.equal(x.work_producer_authorized,false);
 assert.equal(x.ready_for_dispatch,null);
 assert.equal(x.live_home_authorized,false);
 assert.equal(x.source_modified,false);
});
test("recorded work for matching line/station remains REVIEW ONLY",()=>{
 const x=review({events:[event(0,"combinados",2)]});
 assert.equal(x.status,"REVIEW_CANDIDATE_ONLY");
 assert.deepEqual(x.declared_station_candidates.map(x=>x.work_event_count),[1,0]);
});
test("work at another station holds instead of silently rerouting",()=>{
 const x=review({events:[event(0,"enrolados",2)]});
 assert.equal(x.status,"HOLD");
 assert.ok(x.reasons.includes("WORK_EVENT_STATION_CONTRADICTS_CLASSIFICATION"));
 assert.equal(x.ready_for_dispatch,null);
});
test("work event for nonproduction null-station is refused",()=>{
 const cs=claims.map((c,i)=>i===0?{...c,station:null}:c);
 const cr=classReview();
 const c0:RevisaoClassificacaoPR135={
  ...cr,review:{...cr.review!,entries:cr.review!.entries.map((e,i)=>
    i===0?{...e,product:{...e.product,classification:{
      ...e.product.classification,station:null}}}:e)},
 };
 const x=review({events:[event(0,"combinados",2)],claims:cs,classification:c0});
 assert.equal(x.status,"HOLD");
});
test("claim order changes do not alter exact source indexes",()=>{
 const x=review({claims:[...claims].reverse()});
 assert.equal(x.status,"REVIEW_CANDIDATE_ONLY");
 assert.deepEqual(x.declared_station_candidates.map(v=>v.station),
  ["enrolados","combinados"]);
});
test("historical pending 14 classification status cannot be promoted",()=>{
 const x=review({classification:{...classReview(),status:"HOLD"}});
 assert.equal(x.status,"HOLD");
 assert.ok(x.reasons.includes("CLASSIFICATION_SOURCE_OR_REVISION_NOT_QUALIFIED"));
});
test("old snapshot receipt cannot bind a changed native revision",()=>{
 const x=review({revision:{...rev,identity:{...rev.identity,snapshot_hash:"f".repeat(64)}}});
 assert.equal(x.status,"HOLD");
});
test("mismatched native CDARVPROD and classified code hold",()=>{
 const items=rev.items.map((v,i)=>i===0?{...v,route_code:"9200009000"}:v);
 assert.equal(review({revision:{...rev,items}}).status,"HOLD");
});
test("wrong quantity between Reader and claims holds",()=>{
 const cs=claims.map((v,i)=>i===0?{...v,quantity:99}:v);
 assert.equal(review({claims:cs}).status,"HOLD");
});
test("broad sushi environment is not a specific canonical station",()=>{
 const cs=claims.map((v,i)=>i===0?{...v,station:"sushi"}:v);
 const cr=classReview();
 const class2={...cr,review:{...cr.review!,
  entries:cr.review!.entries.map((e,i)=>i===0?
    {...e,product:{...e.product,classification:{
      ...e.product.classification,station:"sushi"}}}:e)}};
 const x=review({claims:cs,classification:class2});
 assert.equal(x.status,"HOLD");
 assert.ok(x.reasons.includes("CLASSIFICATION_STATION_NOT_CANONICAL"));
});
test("catalog identity missing one item holds even if review claims pass",()=>{
 const x=review({catalog:{...convergence,identity_match_count:1,unresolved_line_count:1}});
 assert.equal(x.status,"HOLD");
 assert.ok(x.reasons.includes("CATALOG_IDENTITY_NOT_CONVERGENT"));
});
test("self declared current catalog approval cannot be laundered into trust",()=>{
 const x=review({classification:{...classReview(),classification_approved:true}});
 assert.equal(x.status,"HOLD");
 assert.equal(x.live_home_authorized,false);
});
test("renamed product in classification is not exact with claimed product name",()=>{
 const cs=claims.map((v,i)=>i===0?{...v,product_name:"ALIAS FICTICIO"}:v);
 assert.equal(review({claims:cs}).status,"HOLD");
});
test("no code, item, claim or hash is emitted in positive review",()=>{
 const txt=JSON.stringify(review());
 for(const secret of ["0000001111","9200001000","PRODUTO LAB 1","LABSALE","LABORDER"])
  assert.equal(txt.includes(secret),false);
});
test("two equal-SKU equal-quantity native lines are distinct by exact opaque line ref",()=>{
 const twinRevision:RevisaoNativaParaTrabalho={...rev,items:[
  {...rev.items[0],line_no:"L01"},
  {...rev.items[0],line_no:"L02"},
 ]};
 const twinClaims:ClaimClassificacaoPR135[]=claims.map((_,i)=>({
  ...claims[0],source_item_index:i
 }));
 const template=classReview();
 const twinClass:RevisaoClassificacaoPR135={...template,
  review:{...template.review!,entries:twinClaims.map(c=>({
   source_item_index:c.source_item_index,quantity:c.quantity,
   station_proof:"UNKNOWN",product:{nome:c.product_name,
    classification:{station:c.station,family:c.family}}
  }))}};
 const exact=joined([],twinRevision);
 assert.equal(exact.lines.length,2);
 assert.notEqual(exact.lines[0].line_ref,exact.lines[1].line_ref);
 const inputs={revision:twinRevision,claims:twinClaims,classification:twinClass};
 assert.equal(review(inputs).status,"REVIEW_CANDIDATE_ONLY");
 const swapped:RevisaoVinculoReaderTrabalho={...exact,lines:[
  {...exact.lines[0],line_ref:exact.lines[1].line_ref},
  {...exact.lines[1],line_ref:exact.lines[0].line_ref},
 ]};
 const wrong=review({...inputs,binding:swapped});
 assert.equal(wrong.status,"HOLD");
 assert.ok(wrong.reasons.includes("READER_NATIVE_LINE_REFERENCE_DRIFT"));
 assert.equal(wrong.ready_for_dispatch,null);
 assert.equal(wrong.live_home_authorized,false);
});
test("foreign order binding is refused even when every line ref is otherwise correct",()=>{
 const exact=joined();
 const forgery:RevisaoVinculoReaderTrabalho={...exact,
  opaque_order_ref:"reader-order:"+"0".repeat(64)};
 const result=review({binding:forgery});
 assert.equal(result.status,"HOLD");
 assert.ok(result.reasons.includes("READER_ORDER_BINDING_IDENTITY_DRIFT"));
 assert.equal(result.checked_lines,0);
 assert.equal(result.live_home_authorized,false);
});
test("native line reference from a previous revision cannot be reused",()=>{
 const original=joined();
 const revised:RevisaoNativaParaTrabalho={...rev,identity:{
  ...rev.identity,snapshot_hash:"f".repeat(64)
 }};
 const stale={...original,opaque_order_ref:joined([],revised).opaque_order_ref};
 // Keep the classification receipt for the *new* revision valid, so this
 // specifically tests whether an old line_ref can sneak into that revision.
 const c=classReview();
 const updatedClassification:RevisaoClassificacaoPR135={...c,
  revision_binding:{...c.revision_binding!,
   native_snapshot_sha256:revised.identity.snapshot_hash}};
 const result=review({revision:revised,binding:stale,
  classification:updatedClassification});
 assert.equal(result.status,"HOLD");
 assert.ok(result.reasons.includes("READER_NATIVE_LINE_REFERENCE_DRIFT"));
 assert.equal(result.ready_for_dispatch,null);
});
console.log("READER_CLASSIFICATION_WORK_REVIEW_PASS "+ok+"/"+ok+" SYNTHETIC_ONLY");
