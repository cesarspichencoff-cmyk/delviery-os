"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const net=require("node:net");
const {handshake}=require("./preflight_printers_itaim_v52_readonly.js");
const evidence=JSON.parse(fs.readFileSync(path.join(__dirname,"../docs/evidence/physical_preflight_v52_foxxy_20261008.json"),"utf8"));
let checks=0;
function ok(label,fn){fn();checks++;console.log("PASS "+checks+" "+label);}
async function main(){
 ok("record is explicitly read-only",()=>{
   assert.equal(evidence.schema,"deliveryos.tata-itaim-physical-printer-preflight.v52.readonly");
   assert.equal(evidence.operations.read_only,true);
   assert.equal(evidence.operations.print_bytes_sent,false);
   assert.equal(evidence.operations.spooler_job_created,false);
   assert.equal(evidence.operations.driver_changed,false);
   assert.equal(evidence.operations.density_changed,false);
   assert.equal(evidence.operations.paper_cut_requested,false);
 });
 ok("registered site identity is Itaim, but machine is only the measuring origin",()=>{
   assert.equal(evidence.source_store,"0001 - TATA ITAIM");
   assert.equal(evidence.computer,"Foxxy");
   assert.equal(evidence.queue_enumeration_status,"ENUMERATED");
 });
 ok("exact six distinct station entries are present",()=>{
   assert.equal(evidence.printers.length,6);
   assert.equal(new Set(evidence.printers.map(x=>x.printer_name)).size,6);
 });
 ok("no Itaim queue present on remote Foxxy",()=>{
   assert.ok(evidence.printers.every(x=>x.queue_installed_locally===false));
   assert.ok(evidence.printers.every(x=>x.local_driver===null));
 });
 ok("all recorded TCP 9100 handshakes failed, not proof devices are broken",()=>{
   assert.ok(evidence.printers.every(x=>x.tcp_9100_handshake===false));
   assert.ok(evidence.printers.every(x=>x.transport_observation==="TCP_TIMEOUT"));
   assert.ok(evidence.printers.every(x=>x.port===9100));
 });
 ok("no false physical or human acceptance state",()=>{
   assert.equal(evidence.eligible_for_physical_quality_claim,false);
   assert.equal(evidence.physical_paper_observed,false);
   assert.equal(evidence.all_queue_paths_proven,false);
   assert.ok(evidence.printers.every(x=>!x.physical_print_proven&&!x.visible_paper_proven));
   assert.ok(evidence.printers.every(x=>!x.font_legibility_proven&&!x.accent_print_proven));
 });
 ok("all tests use only non-printing handshake and metadata",()=>{
   const code=fs.readFileSync(path.join(__dirname,"preflight_printers_itaim_v52_readonly.js"),"utf8");
   assert.ok(!code.includes("socket.write("));
   assert.ok(!code.includes("Start-PrintJob"));
   assert.ok(!code.includes("WritePrinter"));
   assert.ok(!code.includes("GS V"));
   assert.ok(code.includes("connect(port,host)"));
 });
 // Loopback-only control: connection detection must work when a port accepts.
 const server=net.createServer(socket=>socket.end());
 await new Promise((resolve,reject)=>server.listen(0,"127.0.0.1",e=>e?reject(e):resolve()));
 const addr=server.address();
 const open=await handshake("127.0.0.1",addr.port,500);
 ok("loopback-only successful handshake detects a reachable endpoint",()=>{
   assert.equal(open.tcp_9100_handshake,true);
   assert.equal(open.transport_observation,"TCP_HANDSHAKE_ONLY");
 });
 await new Promise(resolve=>server.close(resolve));
 const closed=await handshake("127.0.0.1",addr.port,500);
 ok("loopback-only closed endpoint is not misreported reachable",()=>{
   assert.equal(closed.tcp_9100_handshake,false);
 });
 console.log("printer-readonly-preflight-v52: "+checks+"/"+checks+" checks PASS; no physical printer touched");
}
main().catch(e=>{console.error(e);process.exitCode=1});
