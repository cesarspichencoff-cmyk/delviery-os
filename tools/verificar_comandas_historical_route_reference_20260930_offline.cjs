"use strict";
const assert=require("node:assert/strict");
const routes=require("../data/comandas_historical_routing_reference_20260930_review_only.json");
const decisions=require("../data/comandas_cesar_clarificacoes_20261101_review_only.json");
const archived=require("../data/comandas_historical_native_identity_lineage_20261005_review_only.json");
const index=new Map(decisions.product_rules.map(x=>[x.code,x]));
const knownCodes=new Set(archived.entries.map(x=>x.canonical_code));
let count=0;
function test(name,fn){fn();console.log("PASS "+(++count)+" "+name)}
test("source is historical Sep 30 with fixed authenticated-file checksum only",()=>{
 assert.equal(routes.schema,"tata.comandas.historical-routing-reference-equivalence.v1.review-only");
 assert.equal(routes.source_capture_date,"2026-09-30");
 assert.equal(routes.source_scope,"ITAIM_0001_01");
 assert.equal(routes.source_sha256,
  "7084771026ca54f10069f02e0babcaa00f9c7666484cbaf80ec1ecdcdcaa165d");
 assert.equal(routes.source_registered_products,463);
});
test("all five crosswalks are scoped to confirmed human instructions",()=>{
 assert.equal(routes.pairs.length,5);
 assert.equal(routes.verified_reference_route_pairs,5);
 assert.equal(routes.historical_destination_sets_equal,5);
 assert.equal(routes.historical_destination_sets_different,0);
 assert.equal(new Set(routes.pairs.map(x=>x.product_code)).size,5);
 for(const r of routes.pairs){
  const human=index.get(r.product_code);
  assert.ok(human);
  assert.ok(knownCodes.has(r.product_code));
  assert.equal(human.stated_reference,r.reference_label_from_human);
  assert.equal(r.historical_target_sets_equal,true);
  assert.equal(r.historical_target_count,r.referent_historical_target_count);
  assert.equal(r.current_route_equivalence_proven,false);
  assert.equal(r.print_authorized,false);
 }
});
test("combined for two has two historical destinations; others one",()=>{
 const combo=routes.pairs.find(x=>x.product_code==="9.15.00.070.00");
 assert.equal(combo.reference_code,"9.15.00.076.00");
 assert.equal(combo.historical_target_count,2);
 assert.ok(routes.pairs.filter(x=>x!==combo).every(x=>x.historical_target_count===1));
});
test("all fourteen historical gap codes have 13 routes and one scoped absence",()=>{
 const counts=routes.historical_gap_route_count_by_code;
 assert.equal(Object.keys(counts).length,14);
 assert.deepEqual(Object.keys(counts).sort(),archived.entries.map(x=>x.canonical_code).sort());
 assert.equal(routes.historical_gap_codes_total,14);
 assert.equal(routes.historical_gap_codes_with_route,13);
 assert.equal(routes.historical_gap_codes_without_route,1);
 assert.equal(routes.historical_gap_codes_one_target,10);
 assert.equal(routes.historical_gap_codes_two_targets,3);
 assert.equal(Object.values(counts).filter(v=>v===0).length,1);
 assert.equal(Object.values(counts).filter(v=>v===1).length,10);
 assert.equal(Object.values(counts).filter(v=>v===2).length,3);
 assert.equal(counts["8.20.11.002.00"],0);
 for(const pair of routes.pairs)
  assert.equal(counts[pair.product_code],pair.historical_target_count);
});
test("cookie Pistache is absent historically and conference-only is not paper permission",()=>{
 assert.deepEqual(routes.absent_target_codes,["8.20.11.002.00"]);
 const cookie=index.get("8.20.11.002.00");
 assert.equal(cookie.new_production_ticket_policy,"NO_NEW_PRODUCTION_TICKET");
 assert.equal(cookie.conference_ticket_policy,"REQUIRED");
 assert.equal(routes.cookie_pistachio_human_policy,
  "CONFERENCE_ONLY_NO_NEW_PRODUCTION_TICKET");
 assert.equal(routes.print_authorized,false);
});
test("historical equivalence does not authorize current routing or legacy suppression",()=>{
 for(const k of ["current_routing_proven","current_catalog_active_proven",
 "first_native_dispatch_proven","first_physical_print_proven",
 "duplicate_legacy_print_prevented_proven","print_authorized",
 "code_names_or_targets_exposed"])assert.equal(routes[k],false,k);
 const serialized=JSON.stringify(routes);
 for(const privateName of ["CDPRODUTO","printer_ip","customer","NRCOMANDA"])
  assert.equal(serialized.includes(privateName),false);
});
console.log("COMANDAS_ROUTING_HISTORICAL_CROSSWALK="+count+"/"+count+" REVIEW_ONLY");
