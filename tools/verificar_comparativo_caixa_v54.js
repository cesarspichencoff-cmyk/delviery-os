"use strict";
const assert=require("node:assert/strict");
const {build}=require("./gerar_comparativo_legibilidade_caixa_v54.js");
const policy=require("../data/thermal_test_target_policy_v53.json");
const {proof,parsed}=build();
let n=0;function check(name,fn){fn();n++;console.log("PASS "+n+" "+name);}
check("01 physical test scope still CAIXA only",()=>{
 assert.deepEqual(policy.physical_test_policy.strict_printer_queue_allowlist,["CAIXA"]);
 assert.equal(policy.physical_test_policy.allow_print_to_other_queues,false);
});
check("02 all side-by-side comparison content is non-order calibration",()=>{
 assert.ok(proof.text_trace.includes("TESTE B - NAO E PEDIDO"));
 assert.ok(proof.text_trace.includes("NAO E COMANDA / NAO PRODUZIR"));
 assert.ok(!proof.text_trace.includes("IFOOD "));
 assert.ok(!proof.text_trace.includes("TEKNISA "));
});
check("03 baseline A native font double height, normal width",()=>{
 const line=parsed.lines.find(x=>x.text==="3  HOT ROLL TATA");
 assert.ok(line);assert.equal(line.segments[0].font,"A");
 assert.equal(line.segments[0].scale_width,1);
 assert.equal(line.segments[0].scale_height,2);
});
check("04 proposal B wider and taller only where text fits",()=>{
 const sample=parsed.lines.filter(x=>x.text==="3  HOT ROLL TATA");
 assert.equal(sample.length,2);
 assert.equal(sample[1].segments[0].scale_width,2);
 assert.equal(sample[1].segments[0].scale_height,2);
 assert.equal(sample[1].width_dots,sample[0].width_dots*2);
});
check("05 two-digit quantity also fits the double-width variant",()=>{
 const l=parsed.lines.filter(x=>x.text==="12  URAMAKI EBITEN");
 assert.equal(l.length,2);
 assert.equal(l[1].segments[0].scale_width,2);
 assert.ok(l[1].width_dots<=576);
});
check("06 emphasized vs regular observation can be physically compared",()=>{
 const l=parsed.lines.filter(x=>x.text==="OBS: SEM PIMENTA E SEM SAL");
 assert.equal(l.length,2);
 assert.equal(l[0].segments[0].bold,true);
 assert.equal(l[1].segments[0].bold,false);
 assert.equal(l[0].segments[0].font,"A");
});
check("07 accent and native small font samples retained",()=>{
 assert.ok(parsed.lines.some(x=>x.text.includes("AÇÃO PÃO É Ç SHISÔ")));
 assert.ok(parsed.lines.some(x=>x.text.startsWith("FONT B COMPARACAO LONGA")));
});
check("08 sequence visually differentiated from first sample",()=>{
 assert.equal(parsed.lines.find(x=>x.text==="998").alignment,"RIGHT");
});
check("09 entire output fits reference paper geometry and has no unexpected command",()=>{
 assert.equal(parsed.pass,true);
 assert.deepEqual(parsed.errors,[]);
 assert.ok(parsed.lines.every(x=>x.width_dots<=576));
});
check("10 no printing, drawer, cut, density or spooler effect",()=>{
 assert.equal(proof.ready_for_operational_print,false);
 assert.equal(proof.effects.print,false);
 assert.equal(proof.effects.cut,false);
 assert.equal(proof.effects.spooler_write,false);
 assert.ok(parsed.commands.every(x=>["INIT","CODE_PAGE","FONT","ALIGN","BOLD","CHAR_SIZE"].includes(x.type)));
});
console.log("caixa-typography-compare-v54: "+n+"/"+n+" PASS, offline-only");
