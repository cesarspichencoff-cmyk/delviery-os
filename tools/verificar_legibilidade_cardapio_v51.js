"use strict";
const assert=require("node:assert/strict");
const {build}=require("./auditar_legibilidade_cardapio_v51.js");
const r=build();
assert.equal(r.total_historical_products,199);
for(const section of ["single","double_digit"]){
 const {A,B,BLOCKED}=r.result_counts[section];
 assert.equal(A+B+BLOCKED,199);
 assert.equal(BLOCKED,0,"No historical name may be silently truncated or blocked");
 assert.equal(A,193);
 assert.equal(B,6);
}
assert.equal(r.watchlist.length,6);
assert.ok(r.watchlist.every(x=>x.quantity_1.status==="FONT_B_REVIEW"));
assert.ok(r.watchlist.every(x=>x.quantity_12.status==="FONT_B_REVIEW"));
assert.deepEqual(r.effects,{print:false,spooler:false,stock:false});
console.log("thermal-legibility-catalog-v51: 8/8 assertions PASS; 193 Font A, 6 Font B, zero blocked");
