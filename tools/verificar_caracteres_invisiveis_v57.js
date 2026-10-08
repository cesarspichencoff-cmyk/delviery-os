"use strict";
// V5.7 adversarial probe: run before and after security fixes.
// No hardware access. Confirms bytes, independent inspector and note planner
// all reject invisible/control characters instead of claiming a readable slip.
const {OfflinePrinter}=require("../dist/src/production/operationalTicketEscposV46.js");
const {inspectEscPos}=require("./escposByteInspectorV51.js");
const {createAnnotationPlan}=require("./planejar_observacoes_legiveis_v56.js");
let failures=0;
for(const [label,char] of [["DELETE",String.fromCharCode(0x7f)],["SOFT_HYPHEN",String.fromCharCode(0xad)]]){
  const value="SEM"+char+"SAL";
  const p=new OfflinePrinter();
  p.line(value,"HAZARDOUS_NOTE");
  const ticket=p.result("TEST_ONLY");
  const note=createAnnotationPlan("OBS",value);
  const proof=inspectEscPos([0x1b,0x40,0x1b,0x74,0x10,0x1b,0x4d,0x00,0x53,0x45,0x4d,char.charCodeAt(0),0x53,0x41,0x4c,0x0a]);
  const evidence={
    test:label,
    renderer_rejects:ticket.bytes.length===0,
    note_rejects:note.status==="BLOCKED",
    byte_inspector_rejects:proof.pass===false,
    note_reason:note.reason,
    byte_errors:proof.errors
  };
  console.log(JSON.stringify(evidence));
  if(!evidence.renderer_rejects||!evidence.note_rejects||!evidence.byte_inspector_rejects)failures++;
}
console.log("REJECTED_CASES="+(2-failures)+"/2");
if(failures)process.exitCode=1;
