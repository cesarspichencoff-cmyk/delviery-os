"use strict";
const assert=require("node:assert/strict");
const {OfflinePrinter,renderOperationalTicketsProofV46,renderProductionTicketProofV46,renderConferenceTicketProofV46}=
 require("../dist/src/production/operationalTicketEscposV46.js");
const {renderTwoKitchenProofsV47}=require("../dist/src/production/twoKitchenTicketEscposV47.js");
const {archivedResult}=require("./verificar_real_order_tickets_v46.js");
const {inspectEscPos}=require("./escposByteInspectorV51.js");
const calibration=require("../data/production_printer_calibration_registry_v1.json");
let count=0;
function test(label,fn){fn();count++;console.log(" PASS "+count+" "+label);}
function inspect(p){
 assert.equal(p.ready_for_offline_preview,true,p.blocking_reasons.join(","));
 assert.equal(p.ready_for_operational_print,false);
 const r=inspectEscPos(p.bytes);
 assert.deepEqual(r.errors,[]);
 assert.ok(r.lines.every(x=>x.width_dots<=576));
 return r;
}
const order=archivedResult(), group=renderOperationalTicketsProofV46(order);
test("correct Epson GS! 0x01 for double height",()=>{
 const p=new OfflinePrinter();p.heightDouble(true);p.line("AB");
 assert.ok(Buffer.from(p.bytes).indexOf(Buffer.from([0x1d,0x21,0x01]))>=0);
 assert.ok(!Buffer.from(p.bytes).includes(Buffer.from([0x1d,0x21,0x10])));
});
test("correct Epson GS! 0x11 for double width and height",()=>{
 const p=new OfflinePrinter();p.bothDouble(true);p.line("AB");
 assert.ok(Buffer.from(p.bytes).indexOf(Buffer.from([0x1d,0x21,0x11]))>=0);
});
test("official WPC1252 code page 16 survives byte inspection",()=>{
 const p=new OfflinePrinter();p.line("ACO");const r=inspect(p.result("S"));
 assert.ok(r.commands.some(c=>c.type==="CODE_PAGE"&&c.n===16));
});
test("real production tickets are within 576-dot printable area",()=>{
 for(const p of group.production)inspect(p);
});
test("real conference ticket within 576 dots, no unknown commands",()=>{
 inspect(group.conference);
});
test("short item uses native larger Font A + height x2, normal width",()=>{
 const r=inspect(group.conference);
 const l=r.lines.find(x=>x.text.includes("COMBINADO KIDS"));
 assert.ok(l);assert.equal(l.segments[0].font,"A");
 assert.equal(l.segments[0].scale_height,2);
 assert.equal(l.segments[0].scale_width,1);
});
test("two-digit quantity retains full product name in Font A",()=>{
 const o=structuredClone(order.conference);o.boxes[0].items[0].quantity=12;
 const l=inspect(renderConferenceTicketProofV46(o)).lines.find(x=>x.text.includes("COMBINADO KIDS"));
 assert.ok(l);assert.equal(l.segments[0].font,"A");
});
test("long name falls back to Font B without clipping",()=>{
 const o=structuredClone(order.conference);
 const name="SUSHI DE SALMAO ESPECIAL COM MOLHO DE MISO GENGIBRE";
 o.boxes[0].items[0].print_name=name;
 const l=inspect(renderConferenceTicketProofV46(o)).lines.find(x=>x.text.includes(name));
 assert.ok(l);assert.equal(l.segments[0].font,"B");assert.equal(l.segments[0].scale_width,1);
});
test("too-long name blocks all bytes, never truncates",()=>{
 const o=structuredClone(order.production[0]);o.boxes[0].items[0].print_name="SUSHI ".repeat(30);
 const p=renderProductionTicketProofV46(o);
 assert.equal(p.bytes.length,0);
});
test("Portuguese accents retain exact Latin1-superset bytes",()=>{
 const p=new OfflinePrinter();p.line("AÇÃO PÃO É ÓTIMO Ç Ã Õ Ê Á");
 const proof=p.result("ACCENT");inspect(proof);
 assert.ok(proof.bytes.includes(0xc7)&&proof.bytes.includes(0xc3));
});
test("unsupported Unicode punctuation never becomes a false receipt",()=>{
 const p=new OfflinePrinter();p.line("PRATO — SUSHI","BAD");
 assert.equal(p.result("BAD").bytes.length,0);
});
test("Font A double width 24 fits and 25 does not",()=>{
 const a=new OfflinePrinter();a.font("A");a.bothDouble(true);a.line("A".repeat(24));inspect(a.result("A"));
 const b=new OfflinePrinter();b.font("A");b.bothDouble(true);b.line("B".repeat(25));
 assert.equal(b.result("B").bytes.length,0);
});
test("Font B double height 64 glyphs consume exactly 576 dots",()=>{
 const p=new OfflinePrinter();p.font("B");p.heightDouble(true);p.line("A".repeat(64));
 const l=inspect(p.result("W")).lines[0];
 assert.equal(l.width_dots,576);assert.equal(l.segments[0].scale_width,1);
 assert.equal(l.segments[0].scale_height,2);
});
test("bottom sequence is right aligned and x2 width/height",()=>{
 const s=inspect(group.conference).lines.find(x=>x.text==="001");
 assert.ok(s);assert.equal(s.alignment,"RIGHT");
 assert.equal(s.width_dots,3*12*2);
 assert.equal(s.segments[0].scale_height,2);
});
test("actual item observations remain attached and larger when they fit",()=>{
 const o=structuredClone(order.conference);
 o.boxes[0].items[0].observations=["SEM PIMENTA","MAIS CEBOLINHA"];
 const lines=inspect(renderConferenceTicketProofV46(o)).lines;
 const i=lines.findIndex(x=>x.text.includes("COMBINADO KIDS"));
 assert.ok(lines[i+1].text.includes("SEM PIMENTA"));
 assert.equal(lines[i+1].segments[0].font,"A");
});
test("two kitchen ticket variants have independent valid geometry",()=>{
 const prep={components:{status:"PROVEN_COMPLETE",blocking_reasons:[],identifiers:order.production[0].identifiers,
 tasks:[{kind:"HOT",quantity:2,originating_products:["HOT ROLL"]},
 {kind:"EBITEN",quantity:3,originating_products:["URAMAKI EBITEN"]},
 {kind:"SHISO",quantity:1,originating_products:["TUNA SHISO"]}]},
 dishes:{source:order.production.find(t=>t.station==="COZINHA")},review_reasons:[]};
 const q=renderTwoKitchenProofsV47(prep);
 assert.ok(q.components&&q.dishes);
 const a=inspect(q.components),b=inspect(q.dishes);
 assert.ok(a.lines.some(x=>x.text.includes("2  HOT")));
 assert.ok(b.lines.some(x=>x.text.includes("EDAMAME")));
 assert.ok(!b.lines.some(x=>x.text.includes("AGUARDAR COZINHA:")));
});
test("all installed printers still lack physical media and accent proof",()=>{
 assert.ok(calibration.printers.length>=2);
 assert.ok(calibration.printers.every(x=>x.calibration.actual_media_width_mm==="UNKNOWN"));
 assert.ok(calibration.printers.every(x=>x.calibration.accent_test==="UNKNOWN"));
});
test("independent parser rejects raw cut and drawer pulse commands",()=>{
 const a=new OfflinePrinter();a.line("SAMPLE");a.command(0x1d,0x56,0x01);
 assert.ok(inspectEscPos(a.bytes).errors.some(x=>x.startsWith("UNEXPECTED_GS_COMMAND")));
 const b=new OfflinePrinter();b.command(0x1b,0x70,0,5,5);
 assert.ok(inspectEscPos(b.bytes).errors.some(x=>x.startsWith("UNEXPECTED_ESCAPE_COMMAND")));
});
test("all real bytes contain only safe formatting commands",()=>{
 for(const proof of [...group.production,group.conference]){
 const r=inspect(proof);
 assert.ok(r.commands.every(c=>["INIT","CODE_PAGE","FONT","ALIGN","BOLD","CHAR_SIZE"].includes(c.type)));
 assert.equal(proof.effects.print,false);
 }
});
console.log("thermal-official-qa-v51: "+count+"/"+count+" PASS, no device effects");
