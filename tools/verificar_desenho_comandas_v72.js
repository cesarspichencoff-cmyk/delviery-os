"use strict";
/**
 * V7.2 DESIGN LOCK: actual archived ticket vs Figma-origin V4.4/V4.3
 * historical SVG golden SHAs (verified in V6.5); actual offline Epson traces.
 *
 * NO IMAGE REGENERATION. NO NEW LAYOUT. NO PRINTER. NO NETWORK.
 * The SHA check is strict on purpose: authorized visual modifications require
 * an explicit new review and fixture, never updating these SHAs silently.
 */
const assert=require("node:assert/strict");
const crypto=require("node:crypto");
const fs=require("node:fs");
const {render}=require("./gerar_prova_figma_v60_offline.js");
const {archivedResult}=require("./verificar_real_order_tickets_v46.js");
const {renderOperationalTicketsProofV46}=
 require("../dist/src/production/operationalTicketEscposV46.js");
const sha=v=>crypto.createHash("sha256").update(v,"utf8").digest("hex");
const REFS=Object.freeze([
 {kind:"PRODUCAO",station:"COZINHA",boxes:2,items:2,
  svg:"041151f766725456d5487578375ac7c011c6bfa113ceaa52e1976a56d90e9db8"},
 {kind:"PRODUCAO",station:"SUSHI",boxes:4,items:4,
  svg:"87ea691d76e57dca24ef104671c53119b53dfc60ec3d5d12739d1c864babd88f"},
 {kind:"CONFERENCIA",station:"CONFERÊNCIA",boxes:6,items:6,
  svg:"f7a4cd64b85f3611abd5259c30d97f53d2cd7fcb9b3732faef50f794071d79a2"},
]);
const MASTER={url:"https://www.figma.com/design/nEjHuoJg2dMOqOzyutxXZ4",
 production:"30:2",conference:"20:2",width_px:302,left_px:16,right_px:288};
let n=0;const test=(name,fn)=>{fn();n++;console.log("PASS "+n+" "+name)};
const t=render(),projected=archivedResult();
const binary=renderOperationalTicketsProofV46(projected);
test("01 archive emits exactly 3 receipts and not extra station",()=>{
 assert.equal(t.length,3);
 assert.equal(projected.ready_for_semantic_preview,true);
 assert.deepEqual(t.map(p=>[p.kind,p.station,p.boxes,p.items]),
  REFS.map(p=>[p.kind,p.station,p.boxes,p.items]));
});
test("02 current SVG content and drawing of kitchen equal frozen V6.5 source",()=>{
 assert.equal(sha(t[0].svg),REFS[0].svg,
 "Kitchen SVG changed since documented V6.5 replay: manual Figma review required");
});
test("03 sushi SVG equal frozen V6.5 source",()=>{
 assert.equal(sha(t[1].svg),REFS[1].svg,
 "Sushi SVG changed since documented V6.5 replay: manual Figma review required");
});
test("04 conference SVG equal frozen V6.5 source",()=>{
 assert.equal(sha(t[2].svg),REFS[2].svg,
 "Conference SVG changed since documented V6.5 replay: manual Figma review required");
});
test("05 paper prototype width and margins remain exact, not inferred printer dots",()=>{
 assert.ok(t.every(p=>p.width===MASTER.width_px));
 assert.ok(t.every(p=>p.svg.includes('width="302"')));
 assert.ok(t.every(p=>p.svg.includes('x="16"')));
 assert.ok(t.every(p=>p.svg.includes('Barlow Condensed')&&p.svg.includes('Atkinson Hyperlegible Mono')));
});
test("06 physical box numbering and operator field remain on conference receipt",()=>{
 assert.equal(projected.conference.boxes.length,6);
 for(let i=1;i<=6;i++)assert.ok(t[2].svg.includes("C"+i+"  CAIXA"),"C"+i+" absent");
 assert.ok(t[2].svg.includes("Op. ________"));
 assert.ok(t[2].svg.includes("1 CAIXA | 1 PRODUTO"));
});
test("07 neither full names nor notes are silently elided in archived reference",()=>{
 assert.ok(t[1].svg.includes("COMBINADO KIDS"));
 assert.ok(t[2].svg.includes("COMBINADO KIDS"));
 assert.ok(t.every(p=>p.ready_for_visual_review));
 assert.ok(t.every(p=>p.blocking_reasons.length===0));
});
test("08 conference resources retain exact proof and no invented kit",()=>{
 assert.deepEqual(projected.conference.bags,[{label:"Sacola G",quantity:1}]);
 assert.deepEqual(projected.conference.kits,[{label:"Kit Kids",quantity:3},
  {label:"Kit Quente",quantity:1}]);
 assert.ok(t[2].svg.includes("Sacola"));
 assert.ok(t[2].svg.includes("Kit"));
});
test("09 Epson proof bytes remain exact documented archived size 340/538/849",()=>{
 assert.deepEqual([...binary.production,binary.conference].map(p=>p.byte_count),
 [340,538,849],"ESC/POS receipt changed without human design review");
 assert.ok([...binary.production,binary.conference].every(
 p=>p.ready_for_offline_preview&&!p.ready_for_operational_print));
});
test("10 each print destination remains distinct; no automatic spooling",()=>{
 assert.deepEqual(binary.effects,{print:false,spooler_write:false,odhen_write:false,cut:false});
 assert.ok(t.every(p=>p.ready_for_operational_print===false));
 assert.ok(t.every(p=>p.effects.print===false&&p.effects.spooler_write===false));
});
test("11 frozen layout test is read-only (no runtime or paper artifacts)",()=>{
 const src=fs.readFileSync(__filename,"utf8");
 assert.ok(!/execSync\(|spawnSync\(|createWriteStream\(|\.writeFileSync\(|\.connect\(/.test(src));
 assert.ok(MASTER.production==="30:2"&&MASTER.conference==="20:2");
});
test("12 hashes prove SVG regression, never pixels or Epson paper",()=>{
 assert.equal(t[0].width,302);
 assert.ok(MASTER.url.startsWith("https://www.figma.com/design/"));
 // Assertion is explicitly limited to SVG bytes and archived fixture.
 assert.ok(!("physical_pixel_parity" in t[0]));
});
console.log("THERMAL_DESIGN_LOCK_V72="+n+"/12; SVG_GOLDENS_MATCH; NO_PRINT; NO_FIGMA_PIXEL_PARITY_CLAIM");
