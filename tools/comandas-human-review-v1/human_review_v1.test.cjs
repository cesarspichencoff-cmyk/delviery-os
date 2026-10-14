'use strict';
const assert=require('node:assert/strict');
const {assess,reviewV2,N,COMBOS,CASES}=require('./human_review_v1.cjs');
const mk=(k,q=1)=>({canonical_code:N[k][0],product_name:N[k][1],quantity:q});
let checks=0;
for(const [id,items,sizes]of CASES){
 const r=assess(items.map(([k,q])=>mk(k,q)));
 assert.equal(r.status,'REVIEW_ONLY');checks++;
 assert.equal(r.bag.case,id);checks++;
 assert.deepEqual(r.bag.sizes,sizes);checks++;
 assert.equal(r.ready_override,false);checks++;
 assert.equal(r.print_authorized,false);checks++;
 assert.equal(assess([...items.map(([k,q])=>mk(k,q)),mk('SHIMEJI')]).bag,null);checks++;
}
for(const q of [1,2,3]){
 const r=assess([mk('LETRA_B',q)]);
 assert.equal(r.boxes[0].count,q);checks++;
 assert.equal(r.boxes[0].model,'750');checks++;
}
for(const q of [4,5,99]){
 const r=assess([mk('LETRA_B',q)]);
 assert.equal(r.boxes.length,0);checks++;
 assert.equal(r.print_authorized,false);checks++;
}
assert.equal(assess([mk('KIDS'),mk('ZERO')]).kits[0].count,1);checks++;
assert.equal(assess([mk('KIDS'),mk('ZERO'),mk('SHIMEJI')]).kits.length,0);checks++;
assert.equal(assess([mk('KIDS',3)]).boxes.length,0);checks++;
assert.equal(assess([mk('LETRA_B',3),mk('SHIMEJI')]).bag,null);checks++;
for(const items of [null,[],[mk('LETRA_B',0)],[{...mk('LETRA_B'),product_name:'FALSO'}],
 [{...mk('EXEC'),quantity:'1'}]]){
 assert.equal(assess(items).status,'HOLD_INVALID_IDENTITY');checks++;
}
const base={schema:'deliveryos.live-shadow-decision.v1',ready:false,blocking_reasons:['BAG_SIZE_NOT_FACT'],items:[mk('EXEC')]};
const before=JSON.stringify(base);
assert.equal(reviewV2(base).candidate_for_reconciliation,true);checks++;
assert.equal(JSON.stringify(base),before);checks++;
assert.equal(reviewV2({...base,blocking_reasons:['BAG_SIZE_NOT_FACT','KITS_NOT_FACT']}).candidate_for_reconciliation,false);checks++;
assert.equal(reviewV2({...base,blocking_reasons:['ALLERGEN_NOTE_REQUIRES_HUMAN_REVIEW']}).candidate_for_reconciliation,false);checks++;
assert.equal(reviewV2({...base,ready:true}).status,'HOLD');checks++;
assert.equal(reviewV2(base).print_authorized,false);checks++;

// C4 requires the V2 source-proven exact dupla classification. It never clears KITS_NOT_FACT.
const special={...mk('ESPECIAL_1P'),classification:{family:'combinado'}};
const dupla={...mk('SUSHI_POLVO_TRUFADO'),classification:{family:'dupla',subfamily:'dupla_dyo',truth_class:'PROVEN_ACADEMIA_PACKAGING_RULE',review_required:false},classification_source:'ACADEMIA_DOCUMENTED_CATEGORY_EXACT_NAME_AND_ROUTED_STATION_2026_10_07'};
const b8={schema:'deliveryos.live-shadow-decision.v1',items:[special,dupla],ready:false,blocking_reasons:['BAG_SIZE_NOT_FACT','KITS_NOT_FACT']};
const b8before=JSON.stringify(b8);
const b8review=reviewV2(b8);
assert.equal(b8review.kits[0].kind,'Kit p/1');checks++;
assert.equal(b8review.kits[0].count,1);checks++;
assert.equal(b8review.kits[0].case,'C4');checks++;
assert.equal(b8review.candidate_for_reconciliation,false);checks++;
assert.equal(b8review.print_authorized,false);checks++;
assert.equal(JSON.stringify(b8),b8before);checks++;
assert.equal(reviewV2({...b8,items:[special,{...dupla,classification:{family:'enrolado'}}]}).kits.length,0);checks++;
assert.equal(reviewV2({...b8,items:[special,{...dupla,quantity:2}]}).kits.length,0);checks++;
console.log(JSON.stringify({result:'PASS',checks,synthetic_only:true,consumer_modified:false,prints:0}));
