"use strict";
/**
 * Offline-only comparison of TWO archived/fixture reports produced by
 * production_printer_preflight_readonly.ps1. No Windows/print/SQL/network calls.
 * This is NOT proof that installing Comandas is safe for GP/Teknisa.
 */
const fs=require("node:fs"),path=require("node:path");
const SCHEMA="deliveryos.production-printer-preflight-readonly.v1";
const REQUIRED_CODES=["00002","00003","00004","00006","00007","00009"];
const falseEffects=["print_attempted","spooler_job_created",
 "printer_configuration_changed","network_payload_sent_to_printer"];
const canon=x=>String(x||"").normalize("NFD")
 .replace(/[\u0300-\u036f]/g,"").trim().toUpperCase();
const safeText=x=>typeof x==="string"&&x.trim().length>0&&x.length<=256;
const obj=x=>!!x&&typeof x==="object"&&!Array.isArray(x);
function uniqueEntries(rows,key,issues,reason,max){
 if(!Array.isArray(rows)||rows.length<1||rows.length>max){
  issues.add(reason+"_COUNT");return null;
 }
 const m=new Map();
 for(const row of rows){
  const k=obj(row)?canon(row[key]):"";
  if(!k||m.has(k)){issues.add(reason+"_KEY");continue;}
  m.set(k,row);
 }
 return m;
}
function parseReport(report,issues,side){
 if(!obj(report)||report.schema!==SCHEMA){
  issues.add(side+"_SCHEMA");return null;
 }
 if(report.probe_tcp_9100_requested!==false||
   !obj(report.effect_boundary)||
   falseEffects.some(k=>report.effect_boundary[k]!==false))
  issues.add(side+"_EFFECTS_OR_NETWORK_PROBE");
 if(!safeText(report.computer_name))issues.add(side+"_HOST");
 const stamp=Date.parse(report.captured_at);
 if(!Number.isFinite(stamp))issues.add(side+"_TIME");
 const queues=uniqueEntries(report.windows_queues,"printer_name",issues,side+"_QUEUES",80);
 const expected=uniqueEntries(report.expected,"printer_code",issues,side+"_ROUTES",12);
 if(expected&&(expected.size!==REQUIRED_CODES.length||
    REQUIRED_CODES.some(code=>!expected.has(code))))
  issues.add(side+"_EXPECTED_ROUTING_SET_INCOMPLETE");
 if(queues)for(const row of queues.values()){
  if(!safeText(row.driver_name)||!safeText(row.port_name)||
      !obj(row.port)||!safeText(row.port.name)||
      !obj(row.configuration)||typeof row.configuration.paper_size!=="string"||
      !Number.isSafeInteger(row.job_count)||row.job_count<0||
      !safeText(row.printer_status))
   issues.add(side+"_QUEUE_METADATA_INCOMPLETE");
  if(obj(row.port)&&canon(row.port.name)!==canon(row.port_name))
   issues.add(side+"_QUEUE_PORT_INCONSISTENT");
  if(!obj(row.cim)||typeof row.cim.work_offline!=="boolean")
   issues.add(side+"_CIM_STATUS_UNKNOWN");
  else if(row.cim.work_offline)
   issues.add(side+"_OFFLINE_PRINTER_REPORTED");
  if(/UNKNOWN|OFFLINE|ERROR|PAUSED|PAPER\s*OUT|NOT\s*AVAILABLE/.test(canon(row.printer_status)))
   issues.add(side+"_PRINTER_STATUS_UNHEALTHY");
  if(row.configuration&&Object.hasOwn(row.configuration,"error"))
   issues.add(side+"_PRINT_CONFIGURATION_UNREADABLE");
 }
 if(expected)for(const row of expected.values()){
  if(!safeText(row.configured_name)||!safeText(row.configured_ip)||
      !Array.isArray(row.matching_windows_queues)||
      row.matching_windows_queues.length!==1||
      !Array.isArray(row.matching_windows_ports)||
      row.matching_windows_ports.length<1)
   issues.add(side+"_ROUTE_UNRESOLVED");
  else if(queues&&!queues.has(canon(row.matching_windows_queues[0])))
   issues.add(side+"_ROUTE_QUEUE_NOT_IN_INVENTORY");
  else if(queues&&Array.isArray(row.matching_windows_ports)){
   const mapped=queues.get(canon(row.matching_windows_queues[0]));
   if(mapped&&!row.matching_windows_ports.some(p=>canon(p)===canon(mapped.port_name)))
    issues.add(side+"_ROUTE_PORT_NOT_BOUND_TO_QUEUE");
  }
 }
 return {stamp,queues,expected,host:canon(report.computer_name)};
}
const ordered=x=>Array.isArray(x)?x.map(canon).sort().join("|"):"UNKNOWN";
function assessPair(before,after){
 const issues=new Set();
 const a=parseReport(before,issues,"BASELINE");
 const b=parseReport(after,issues,"FOLLOWUP");
 if(a&&b){
  if(a.host!==b.host)issues.add("DIFFERENT_COMPUTER");
  if(!(b.stamp>a.stamp&&b.stamp-a.stamp<=15*60*1000))
   issues.add("TIME_WINDOW_INVALID");
  for(const [kind,first,second,keys] of [
   ["QUEUE",a.queues,b.queues,["driver_name","port_name","printer_status","shared","share_name","published"]],
   ["ROUTE",a.expected,b.expected,["configured_name","configured_ip","configured_port_alias"]]
  ]){
   if(!first||!second)continue;
   if(first.size!==second.size||
       [...first.keys()].some(key=>!second.has(key)))
    issues.add(kind+"_SET_CHANGED");
   for(const [key,left] of first.entries()){
    const right=second.get(key);if(!right)continue;
    if(keys.some(field=>canon(left[field])!==canon(right[field])))
     issues.add(kind+"_METADATA_CHANGED");
    if(kind==="QUEUE"){
     if(canon(left.port?.name)!==canon(right.port?.name)||
        canon(left.port?.printer_host_address)!==canon(right.port?.printer_host_address)||
        left.port?.port_number!==right.port?.port_number||
        canon(left.port?.snmp_enabled)!==canon(right.port?.snmp_enabled)||
        canon(left.configuration?.paper_size)!==canon(right.configuration?.paper_size)||
        canon(left.configuration?.color)!==canon(right.configuration?.color)||
        canon(left.configuration?.duplexing_mode)!==canon(right.configuration?.duplexing_mode)||
        canon(left.cim?.work_offline)!==canon(right.cim?.work_offline)||
        canon(left.cim?.detected_error_state)!==canon(right.cim?.detected_error_state)||
        canon(left.cim?.extended_printer_status)!==canon(right.cim?.extended_printer_status))
      issues.add("QUEUE_PORT_OR_CONFIGURATION_CHANGED");
     if(right.job_count>left.job_count)
      issues.add("QUEUE_BACKLOG_INCREASED_CAUSE_UNKNOWN");
    }else if(
     ordered(left.matching_windows_queues)!==ordered(right.matching_windows_queues)||
     ordered(left.matching_windows_ports)!==ordered(right.matching_windows_ports))
      issues.add("ROUTE_BINDING_CHANGED");
   }
  }
 }
 return {schema:"deliveryos.print-coexistence-diff.v1",
  status:issues.size?"HOLD":"STRUCTURAL_MATCH_ONLY",
  reasons:[...issues].sort(),
  observed_host_proven:false,absence_of_interference_proven:false,
  physical_print_proven:false,authorizes_install:false,
  authorizes_print:false,effects:{print:false,spooler_write:false,
   printer_configuration_change:false,network:false}};
}
function safeRead(file){
 const name=path.resolve(file),st=fs.lstatSync(name);
 if(!st.isFile()||st.isSymbolicLink()||st.size>256*1024)
  throw Error("INPUT_NOT_BOUNDED_REGULAR_FILE");
 return JSON.parse(fs.readFileSync(name,"utf8").replace(/^\uFEFF/,""));
}
if(require.main===module){
 let result;
 try{
  if(process.argv.length!==4)throw Error("EXPECTED_TWO_REPORT_FILES");
  result=assessPair(safeRead(process.argv[2]),safeRead(process.argv[3]));
 }catch{
  result={schema:"deliveryos.print-coexistence-diff.v1",status:"HOLD",
   reasons:["REPORT_UNREADABLE_OR_FORMAT_INVALID"],
   observed_host_proven:false,absence_of_interference_proven:false,
   physical_print_proven:false,authorizes_install:false,
   authorizes_print:false};
 }
 console.log(JSON.stringify(result));
 if(result.status==="HOLD")process.exitCode=2;
}
module.exports={assessPair};
