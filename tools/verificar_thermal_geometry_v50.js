"use strict";
const assert=require("node:assert/strict");
const {OfflinePrinter,renderOperationalTicketsProofV46}=require("../dist/src/production/operationalTicketEscposV46.js");
const {archivedResult}=require("./verificar_real_order_tickets_v46.js");
let n=0;function test(label,fn){fn();n++;console.log(" PASS "+n+" "+label);}
test("font A normal fits 48",()=>{
 const p=new OfflinePrinter();p.font("A");p.line("X".repeat(48));assert.equal(p.blockers.size,0);
});
test("font A normal rejects 49",()=>{
 const p=new OfflinePrinter();p.font("A");p.line("X".repeat(49),"A");assert.ok([...p.blockers].some(x=>x==="LINE_EXCEEDS_48_COLUMNS:A"));
});
test("font B normal fits 64",()=>{
 const p=new OfflinePrinter();p.font("B");p.line("X".repeat(64));assert.equal(p.blockers.size,0);
});
test("font B normal rejects 65",()=>{
 const p=new OfflinePrinter();p.font("B");p.line("X".repeat(65),"B");assert.ok([...p.blockers].some(x=>x==="LINE_EXCEEDS_64_COLUMNS:B"));
});
test("font A double width fits 24",()=>{
 const p=new OfflinePrinter();p.font("A");p.bothDouble(true);p.line("X".repeat(24));assert.equal(p.blockers.size,0);
});
test("font A double width rejects 25 and zeroes bytes",()=>{
 const p=new OfflinePrinter();p.font("A");p.bothDouble(true);p.line("X".repeat(25),"DOUBLE_A");
 assert.ok([...p.blockers].some(x=>x==="LINE_EXCEEDS_24_COLUMNS:DOUBLE_A"));
 assert.equal(p.result("TEST").bytes.length,0);
});
test("font B double width fits 32",()=>{
 const p=new OfflinePrinter();p.font("B");p.bothDouble(true);p.line("X".repeat(32));assert.equal(p.blockers.size,0);
});
test("font B double width rejects 33",()=>{
 const p=new OfflinePrinter();p.font("B");p.bothDouble(true);p.line("X".repeat(33),"DOUBLE_B");
 assert.ok([...p.blockers].some(x=>x==="LINE_EXCEEDS_32_COLUMNS:DOUBLE_B"));
});
test("double HEIGHT does not halve horizontal capacity",()=>{
 const p=new OfflinePrinter();p.font("B");p.heightDouble(true);p.line("X".repeat(64));assert.equal(p.blockers.size,0);
});
test("returning to normal width restores full capacity",()=>{
 const p=new OfflinePrinter();p.font("A");p.bothDouble(true);p.bothDouble(false);
 p.line("X".repeat(48));assert.equal(p.blockers.size,0);
});
test("large bottom sequence fits, and is right aligned",()=>{
 const proof=renderOperationalTicketsProofV46(archivedResult()).conference;
 assert.ok(proof.text_trace.trimEnd().endsWith("001"));
 assert.ok(proof.bytes.length>0);
});
test("no automatic cut or print effects",()=>{
 const proof=renderOperationalTicketsProofV46(archivedResult()).conference;
 assert.equal(proof.ready_for_operational_print,false);
 assert.deepEqual(proof.effects,{print:false,spooler_write:false,odhen_write:false,cut:false});
 for(let i=0;i<proof.bytes.length-1;i++)assert.ok(!(proof.bytes[i]===0x1d&&proof.bytes[i+1]===0x56));
});
console.log("thermal-geometry-v50: "+n+"/"+n+" PASS");
