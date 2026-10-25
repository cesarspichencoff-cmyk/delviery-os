"use strict";
/** Synthetic source reports only; no Windows printer or network operations. */
const assert=require("node:assert/strict");
const fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const {spawnSync}=require("node:child_process");
const {assessPair}=require("./comparar_preflight_impressoras_v878_offline.cjs");
const codes=["00002","00003","00004","00006","00007","00009"];
function report(time="2026-10-23T19:00:00.000Z"){
 const q=codes.map((code,i)=>({
  printer_name:"FAKE_PRINT_"+code,driver_name:"TEST_FAKE_DRIVER",
  shared:false,share_name:"",published:false,
  port_name:"LOCAL_PORT_"+code,printer_status:"Normal",job_count:0,
  port:{name:"LOCAL_PORT_"+code,printer_host_address:"192.0.2."+(i+1),
   port_number:9100,snmp_enabled:false},
  configuration:{paper_size:"80mm",color:false,duplexing_mode:"OneSided"},
  cim:{work_offline:false,detected_error_state:"0",extended_printer_status:"3"}
 }));
 return {schema:"deliveryos.production-printer-preflight-readonly.v1",
  captured_at:time,computer_name:"SYNTHETIC_WINDOWS_TEST",
  probe_tcp_9100_requested:false,
  effect_boundary:{print_attempted:false,spooler_job_created:false,
   printer_configuration_changed:false,network_payload_sent_to_printer:false},
  expected:codes.map((code,i)=>({
   printer_code:code,configured_name:"FAKE_PRINT_"+code,
   configured_ip:"192.0.2."+(i+1),configured_port_alias:null,
   matching_windows_ports:["LOCAL_PORT_"+code],
   matching_windows_queues:["FAKE_PRINT_"+code],tcp_9100_probe:null
  })),
  windows_queues:q,notes:["MOCK ONLY"]};
}
const base=report(),follow=report("2026-10-23T19:01:00.000Z");
let count=0;
function ok(name,cb){cb();count++;console.log("PASS "+count+" "+name);}
function mustHold(name,change,reason){
 ok(name,()=>{
  const b=structuredClone(follow);change(b);
  const a=assessPair(base,b);
  assert.equal(a.status,"HOLD");
  assert.ok(a.reasons.includes(reason),JSON.stringify(a.reasons));
  assert.equal(a.authorizes_install,false);assert.equal(a.authorizes_print,false);
  assert.equal(a.absence_of_interference_proven,false);
  assert.ok(!JSON.stringify(a).includes("FAKE_PRINT_"));
 });
}
ok("SNMP false-to-null drift must HOLD",()=>{
 const b=structuredClone(follow);
 b.windows_queues[0].port.snmp_enabled=null;
 const verdict=assessPair(base,b);
 assert.equal(verdict.status,"HOLD");
 assert.ok(verdict.reasons.includes("QUEUE_PORT_OR_CONFIGURATION_CHANGED"));
});
ok("identical nonzero printer backlog is not an all-clear",()=>{
 const a=structuredClone(base),b=structuredClone(follow);
 a.windows_queues[0].job_count=4;
 b.windows_queues[0].job_count=4;
 const verdict=assessPair(a,b);
 assert.equal(verdict.status,"HOLD");
 assert.ok(verdict.reasons.includes("BASELINE_QUEUE_BACKLOG_PRESENT_UNRESOLVED"));
 assert.ok(verdict.reasons.includes("FOLLOWUP_QUEUE_BACKLOG_PRESENT_UNRESOLVED"));
});
ok("ambiguous candidate ports in both reports are HOLD",()=>{
 const a=structuredClone(base),b=structuredClone(follow);
 a.expected[0].matching_windows_ports.push("OTHER_POSSIBLE_PORT");
 b.expected[0].matching_windows_ports.push("OTHER_POSSIBLE_PORT");
 const verdict=assessPair(a,b);
 assert.equal(verdict.status,"HOLD");
 assert.ok(verdict.reasons.includes("BASELINE_ROUTE_MULTIPLE_PORT_CANDIDATES"));
});
ok("contradictory TCP result with probe disabled must HOLD",()=>{
 const a=structuredClone(base),b=structuredClone(follow);
 for(const x of [a,b])x.expected[0].tcp_9100_probe={port:9100,tcp_test_succeeded:true};
 const verdict=assessPair(a,b);
 assert.equal(verdict.status,"HOLD");
 assert.ok(verdict.reasons.includes("BASELINE_TCP_PROBE_RESULT_CONTRADICTS_FLAG"));
 assert.ok(verdict.reasons.includes("FOLLOWUP_TCP_PROBE_RESULT_CONTRADICTS_FLAG"));
});
ok("falling but not empty printer backlog remains HOLD",()=>{
 const a=structuredClone(base),b=structuredClone(follow);
 a.windows_queues[0].job_count=4;b.windows_queues[0].job_count=1;
 const verdict=assessPair(a,b);
 assert.equal(verdict.status,"HOLD");
 assert.ok(verdict.reasons.includes("FOLLOWUP_QUEUE_BACKLOG_PRESENT_UNRESOLVED"));
});
ok("stable synthetic topology is comparison only, never GO",()=>{
 const x=assessPair(base,follow);
 assert.equal(x.status,"STRUCTURAL_MATCH_ONLY");
 assert.deepEqual(x.reasons,[]);
 for(const k of ["observed_host_proven","absence_of_interference_proven",
  "physical_print_proven","authorizes_install","authorizes_print"])
  assert.equal(x[k],false);
});
ok("same wrong physical destination in both snapshots must HOLD",()=>{
 const a=structuredClone(base),b=structuredClone(follow);
 for(const x of [a,b])x.windows_queues[0].port.printer_host_address="198.51.100.99";
 const verdict=assessPair(a,b);
 assert.equal(verdict.status,"HOLD");
 assert.ok(verdict.reasons.includes("BASELINE_ROUTE_PHYSICAL_DESTINATION_MISMATCH"));
 assert.equal(verdict.authorizes_print,false);
});
ok("matching LPT alias must not hide contradictory physical IP",()=>{
 const a=structuredClone(base),b=structuredClone(follow);
 for(const x of [a,b]){
  x.expected[0].configured_port_alias="LOCAL_PORT_00002";
  x.windows_queues[0].port.printer_host_address="198.51.100.99";
 }
 const verdict=assessPair(a,b);
 assert.equal(verdict.status,"HOLD");
 assert.ok(verdict.reasons.includes("BASELINE_ROUTE_PHYSICAL_DESTINATION_MISMATCH"));
 assert.ok(verdict.reasons.includes("FOLLOWUP_ROUTE_PHYSICAL_DESTINATION_MISMATCH"));
 assert.equal(verdict.authorizes_print,false);
});
ok("alias-only LPT port without physical IP is comparison only",()=>{
 const a=structuredClone(base),b=structuredClone(follow);
 for(const x of [a,b]){
  x.expected[0].configured_port_alias="LOCAL_PORT_00002";
  x.windows_queues[0].port.printer_host_address="";
  x.windows_queues[0].port.port_number=null;
  x.windows_queues[0].port.snmp_enabled=null;
 }
 const verdict=assessPair(a,b);
 assert.equal(verdict.status,"STRUCTURAL_MATCH_ONLY");
 assert.equal(verdict.authorizes_install,false);
 assert.equal(verdict.authorizes_print,false);
});
ok("blank physical IP without configured alias must HOLD",()=>{
 const a=structuredClone(base),b=structuredClone(follow);
 for(const x of [a,b])x.windows_queues[0].port.printer_host_address="";
 const verdict=assessPair(a,b);
 assert.equal(verdict.status,"HOLD");
 assert.ok(verdict.reasons.includes("BASELINE_ROUTE_PHYSICAL_DESTINATION_MISMATCH"));
});
ok("same cross-wired queue in both snapshots must HOLD",()=>{
 const a=structuredClone(base),b=structuredClone(follow);
 for(const x of [a,b]){
  x.expected[0].matching_windows_queues=["FAKE_PRINT_00003"];
  x.expected[0].matching_windows_ports=["LOCAL_PORT_00003"];
 }
 const verdict=assessPair(a,b);
 assert.equal(verdict.status,"HOLD");
 assert.ok(verdict.reasons.includes("BASELINE_ROUTE_PHYSICAL_DESTINATION_MISMATCH"));
 assert.equal(verdict.authorizes_install,false);
});
ok("two routes reusing one queue in both snapshots must HOLD",()=>{
 const a=structuredClone(base),b=structuredClone(follow);
 for(const x of [a,b]){
  x.expected[1].matching_windows_queues=["FAKE_PRINT_00002"];
  x.expected[1].matching_windows_ports=["LOCAL_PORT_00002"];
 }
 const verdict=assessPair(a,b);
 assert.equal(verdict.status,"HOLD");
 assert.ok(verdict.reasons.includes("BASELINE_ROUTE_QUEUE_REUSED_ACROSS_CODES"));
});
ok("missing shared metadata from both reports cannot compare as stable",()=>{
 const a=structuredClone(base),b=structuredClone(follow);
 delete a.windows_queues[0].shared;
 delete b.windows_queues[0].shared;
 const verdict=assessPair(a,b);
 assert.equal(verdict.status,"HOLD");
 assert.ok(verdict.reasons.includes("BASELINE_QUEUE_METADATA_INCOMPLETE"));
});
// Identical unhealthy statuses must fail closed: equality is not health.
for(const status of ["PaperJam","OutOfPaper","DoorOpen","NoToner",
                     "Degraded","UnrecognizedFutureStatus"]){
 ok("same "+status+" in both snapshots must HOLD",()=>{
  const a=structuredClone(base),b=structuredClone(follow);
  a.windows_queues[0].printer_status=status;
  b.windows_queues[0].printer_status=status;
  const verdict=assessPair(a,b);
  assert.equal(verdict.status,"HOLD");
  assert.ok(verdict.reasons.includes("BASELINE_PRINTER_STATUS_UNHEALTHY"));
  assert.ok(verdict.reasons.includes("FOLLOWUP_PRINTER_STATUS_UNHEALTHY"));
  assert.equal(verdict.authorizes_print,false);
 });
}
ok("same no-paper CIM error in both snapshots must HOLD",()=>{
 const a=structuredClone(base),b=structuredClone(follow);
 for(const x of [a,b])x.windows_queues[0].cim.detected_error_state="4";
 const verdict=assessPair(a,b);
 assert.equal(verdict.status,"HOLD");
 assert.ok(verdict.reasons.includes("BASELINE_CIM_UNHEALTHY_OR_UNRECOGNIZED"));
 assert.ok(verdict.reasons.includes("FOLLOWUP_CIM_UNHEALTHY_OR_UNRECOGNIZED"));
});
ok("same jammed CIM error in both snapshots must HOLD",()=>{
 const a=structuredClone(base),b=structuredClone(follow);
 for(const x of [a,b])x.windows_queues[0].cim.detected_error_state="8";
 const verdict=assessPair(a,b);
 assert.equal(verdict.status,"HOLD");
 assert.ok(verdict.reasons.includes("BASELINE_CIM_UNHEALTHY_OR_UNRECOGNIZED"));
});
ok("same offline extended CIM status in both snapshots must HOLD",()=>{
 const a=structuredClone(base),b=structuredClone(follow);
 for(const x of [a,b])x.windows_queues[0].cim.extended_printer_status="7";
 const verdict=assessPair(a,b);
 assert.equal(verdict.status,"HOLD");
 assert.ok(verdict.reasons.includes("BASELINE_CIM_UNHEALTHY_OR_UNRECOGNIZED"));
});
mustHold("CIM detected error after baseline",b=>b.windows_queues[0].cim.detected_error_state="4","FOLLOWUP_CIM_UNHEALTHY_OR_UNRECOGNIZED");
mustHold("unrecognized CIM extended status after baseline",b=>b.windows_queues[0].cim.extended_printer_status="999","FOLLOWUP_CIM_UNHEALTHY_OR_UNRECOGNIZED");
ok("missing CIM error state in both snapshots cannot compare as stable",()=>{
 const a=structuredClone(base),b=structuredClone(follow);
 delete a.windows_queues[0].cim.detected_error_state;
 delete b.windows_queues[0].cim.detected_error_state;
 const verdict=assessPair(a,b);
 assert.equal(verdict.status,"HOLD");
 assert.ok(verdict.reasons.includes("BASELINE_CIM_STATUS_UNKNOWN"));
 assert.ok(verdict.reasons.includes("FOLLOWUP_CIM_STATUS_UNKNOWN"));
});
ok("missing CIM extended status in both snapshots cannot compare as stable",()=>{
 const a=structuredClone(base),b=structuredClone(follow);
 delete a.windows_queues[0].cim.extended_printer_status;
 delete b.windows_queues[0].cim.extended_printer_status;
 const verdict=assessPair(a,b);
 assert.equal(verdict.status,"HOLD");
 assert.ok(verdict.reasons.includes("BASELINE_CIM_STATUS_UNKNOWN"));
 assert.ok(verdict.reasons.includes("FOLLOWUP_CIM_STATUS_UNKNOWN"));
});
ok("missing native port identifier cannot compare as stable",()=>{
 const a=structuredClone(base),b=structuredClone(follow);
 delete a.windows_queues[0].port.port_number;
 delete b.windows_queues[0].port.port_number;
 const verdict=assessPair(a,b);
 assert.equal(verdict.status,"HOLD");
 assert.ok(verdict.reasons.includes("BASELINE_QUEUE_METADATA_INCOMPLETE"));
});
mustHold("queue deleted",b=>b.windows_queues.pop(),"QUEUE_SET_CHANGED");
mustHold("new queue",b=>b.windows_queues.push({
 ...b.windows_queues[0],printer_name:"UNEXPECTED_FAKE"}),"QUEUE_SET_CHANGED");
mustHold("driver drift",b=>b.windows_queues[0].driver_name="DRIVER_V2","QUEUE_METADATA_CHANGED");
mustHold("shared mode changed",b=>b.windows_queues[0].shared=true,"QUEUE_METADATA_CHANGED");
mustHold("share label changed",b=>b.windows_queues[0].share_name="SHARE_NEW","QUEUE_METADATA_CHANGED");
mustHold("publishing setting changed",b=>b.windows_queues[0].published=true,"QUEUE_METADATA_CHANGED");
mustHold("SNMP setting changed",b=>b.windows_queues[0].port.snmp_enabled=true,"QUEUE_PORT_OR_CONFIGURATION_CHANGED");
mustHold("driver color setting changed",b=>b.windows_queues[0].configuration.color=true,"QUEUE_PORT_OR_CONFIGURATION_CHANGED");
mustHold("duplex setting changed",b=>b.windows_queues[0].configuration.duplexing_mode="TwoSided","QUEUE_PORT_OR_CONFIGURATION_CHANGED");
mustHold("CIM error state changed",b=>b.windows_queues[0].cim.detected_error_state="4","QUEUE_PORT_OR_CONFIGURATION_CHANGED");
mustHold("unknown status is not proof of health",b=>b.windows_queues[0].printer_status="Unknown","FOLLOWUP_PRINTER_STATUS_UNHEALTHY");
mustHold("port name drift",b=>b.windows_queues[0].port_name="OTHER_PORT","QUEUE_METADATA_CHANGED");
mustHold("network port destination drift",b=>b.windows_queues[0].port.printer_host_address="192.0.2.200","QUEUE_PORT_OR_CONFIGURATION_CHANGED");
mustHold("port number drift",b=>b.windows_queues[0].port.port_number=9101,"QUEUE_PORT_OR_CONFIGURATION_CHANGED");
mustHold("paper config drift",b=>b.windows_queues[0].configuration.paper_size="A4","QUEUE_PORT_OR_CONFIGURATION_CHANGED");
mustHold("queue status drift",b=>b.windows_queues[0].printer_status="Paused","QUEUE_METADATA_CHANGED");
mustHold("queue backlog increased is not attributed",b=>b.windows_queues[0].job_count=7,"QUEUE_BACKLOG_INCREASED_CAUSE_UNKNOWN");
mustHold("different computer",b=>b.computer_name="ANOTHER_FAKE_HOST","DIFFERENT_COMPUTER");
mustHold("same timestamp",b=>b.captured_at=base.captured_at,"TIME_WINDOW_INVALID");
mustHold("reversed time",b=>b.captured_at="2026-10-23T18:59:00.000Z","TIME_WINDOW_INVALID");
mustHold("snapshot interval greater than 15 min",b=>b.captured_at="2026-10-23T19:20:00.000Z","TIME_WINDOW_INVALID");
mustHold("unexpected TCP probe",b=>b.probe_tcp_9100_requested=true,"FOLLOWUP_EFFECTS_OR_NETWORK_PROBE");
mustHold("spooler write claimed",b=>b.effect_boundary.spooler_job_created=true,"FOLLOWUP_EFFECTS_OR_NETWORK_PROBE");
mustHold("source routing disappeared",b=>b.expected.pop(),"FOLLOWUP_EXPECTED_ROUTING_SET_INCOMPLETE");
mustHold("source routing binding changed",b=>b.expected[0].matching_windows_ports=["WRONG_PORT"],"ROUTE_BINDING_CHANGED");
mustHold("routing ambiguous",b=>b.expected[0].matching_windows_queues.push("FAKE_PRINT_00003"),"FOLLOWUP_ROUTE_UNRESOLVED");
mustHold("port entry disagrees with queue port",b=>b.windows_queues[0].port.name="WRONG_PORT","FOLLOWUP_QUEUE_PORT_INCONSISTENT");
mustHold("route lists a port unrelated to its queue",b=>b.expected[0].matching_windows_ports=["OTHER_PORT"],"FOLLOWUP_ROUTE_PORT_NOT_BOUND_TO_QUEUE");
mustHold("missing port metadata",b=>b.windows_queues[0].port=null,"FOLLOWUP_QUEUE_METADATA_INCOMPLETE");
mustHold("CIM unreadable",b=>b.windows_queues[0].cim=null,"FOLLOWUP_CIM_STATUS_UNKNOWN");
mustHold("printer already offline",b=>b.windows_queues[0].cim.work_offline=true,"FOLLOWUP_OFFLINE_PRINTER_REPORTED");
mustHold("unhealthy status at baseline",b=>b.windows_queues[0].printer_status="Offline","FOLLOWUP_PRINTER_STATUS_UNHEALTHY");
mustHold("configuration access error",b=>b.windows_queues[0].configuration.error="DENIED","FOLLOWUP_PRINT_CONFIGURATION_UNREADABLE");
mustHold("same printer duplicate",b=>b.windows_queues.push({...b.windows_queues[0]}),"FOLLOWUP_QUEUES_KEY");
mustHold("missing queue list",b=>{delete b.windows_queues},"FOLLOWUP_QUEUES_COUNT");
mustHold("bad schema",b=>b.schema="INVALID","FOLLOWUP_SCHEMA");
ok("CLI accepts two bounded fixture files, outputs only coded metadata",()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),"comandas-v878-"));
 try{
  const a=path.join(temp,"a.json"),b=path.join(temp,"b.json");
  fs.writeFileSync(a,JSON.stringify(base));fs.writeFileSync(b,JSON.stringify(follow));
  const proc=spawnSync(process.execPath,[path.join(__dirname,
   "comparar_preflight_impressoras_v878_offline.cjs"),a,b],
   {encoding:"utf8",timeout:7000});
  assert.equal(proc.status,0,proc.stderr);
  const obj=JSON.parse(proc.stdout);
  assert.equal(obj.status,"STRUCTURAL_MATCH_ONLY");
  assert.ok(!proc.stdout.includes("192.0.2."));
  assert.ok(!proc.stdout.includes("FAKE_PRINT_"));
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
});
ok("CLI missing input stays HOLD without names or printer effects",()=>{
 const proc=spawnSync(process.execPath,[path.join(__dirname,
  "comparar_preflight_impressoras_v878_offline.cjs"),"/NO_SUCH_REPORT","/NO_SUCH_REPORT"],
  {encoding:"utf8",timeout:7000});
 assert.equal(proc.status,2);
 const result=JSON.parse(proc.stdout);
 assert.equal(result.status,"HOLD");
 assert.equal(result.authorizes_install,false);
});
console.log("COMANDAS_PRE_FLIGHT_COMPARISON_V878="+count+"/"+count+
 " MOCK_ONLY NO_OPERATIONAL_HOST NO_PRINTER NO_NETWORK NO_INSTALL");
