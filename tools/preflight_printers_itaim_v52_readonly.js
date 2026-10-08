"use strict";
/**
 * TATA Itaim PRINT ACCESS PREFLIGHT — READ ONLY.
 * Performs six outbound TCP HANDSHAKES (no data bytes), enumerates Windows
 * print queue metadata, and records evidence in JSON.
 * No print job, printer setup change, queue purge, cutter, density or fiscal.
 */
const fs=require("node:fs");
const os=require("node:os");
const net=require("node:net");
const path=require("node:path");
const {spawnSync}=require("node:child_process");
const root=path.resolve(__dirname,"..");
const source="data/production_printer_calibration_registry_v1.json";
const registry=require(path.join(root,source));
const outArg=process.argv.find(x=>x.startsWith("--output="));
const outPath=outArg?path.resolve(process.cwd(),outArg.substring(9)):null;
function windowsQueues(){
  if(process.platform!=="win32")return {status:"NON_WINDOWS",rows:[]};
  const cmd="Get-Printer -ErrorAction SilentlyContinue | Select-Object Name,DriverName,PortName | ConvertTo-Json -Compress";
  const p=spawnSync("powershell.exe",["-NoProfile","-NonInteractive","-Command",cmd],{
    encoding:"utf8",timeout:8000,windowsHide:true,
  });
  if(p.status!==0||p.error)return {status:"UNAVAILABLE",rows:[]};
  try{
    const raw=JSON.parse(p.stdout.trim()||"[]");
    return {status:"ENUMERATED",rows:Array.isArray(raw)?raw:[raw]};
  }catch{
    return {status:"UNAVAILABLE",rows:[]};
  }
}
function handshake(host,port=9100,timeoutMs=1200){
 return new Promise(resolve=>{
  const socket=new net.Socket();
  let settled=false;
  function done(connected,reason){
   if(settled)return;
   settled=true;
   socket.destroy();
   resolve({tcp_9100_handshake:connected,transport_observation:reason});
  }
  socket.setTimeout(timeoutMs,()=>done(false,"TCP_TIMEOUT"));
  socket.on("connect",()=>done(true,"TCP_HANDSHAKE_ONLY"));
  socket.on("error",()=>done(false,"TCP_CONNECT_FAILED"));
  try{socket.connect(port,host)}catch{done(false,"TCP_CONNECT_FAILED")}
 });
}
function ipAddresses(){
 return Object.values(os.networkInterfaces()).flat().filter(x=>x&&x.family==="IPv4"&&!x.internal)
   .map(x=>x.address);
}
async function run(){
 const q=windowsQueues();
 const printers=await Promise.all(registry.printers.map(async p=>{
  const target=String(p.configured_ip);
  const queueName=String(p.calibration.windows_queue_name);
  const matching=q.rows.filter(x=>x.Name===queueName);
  const network=await handshake(target);
  return {
    printer_name:p.printer_name,registered_ip:target,port:9100,
    queue_name:queueName,
    queue_installed_locally:q.status==="ENUMERATED"?matching.length>0:null,
    local_driver:matching.length?matching[0].DriverName:null,
    ...network,
    physical_print_proven:false,
    visible_paper_proven:false,
    font_legibility_proven:false,
    accent_print_proven:false,
    on_site_calibration_approved:false,
  };
 }));
 const report={
  schema:"deliveryos.tata-itaim-physical-printer-preflight.v52.readonly",
  timestamp_utc:new Date().toISOString(),
  source_registry:source,source_store:registry.store,
  computer:os.hostname(),local_ipv4:ipAddresses(),
  queue_enumeration_status:q.status,
  local_queue_count:q.status==="ENUMERATED"?q.rows.length:null,
  printers,
  physical_paper_observed:false,
  all_queue_paths_proven:printers.every(p=>p.queue_installed_locally===true&&p.tcp_9100_handshake===true),
  eligible_for_physical_quality_claim:false,
  operations:{read_only:true,print_bytes_sent:false,spooler_job_created:false,
    driver_changed:false,density_changed:false,paper_cut_requested:false,
    tcp_handshakes_only:true},
  warning:"Connection metadata never proves physical media, site identity, printer variant or print quality. Never substitute results from another unit.",
 };
 if(outPath){
  fs.mkdirSync(path.dirname(outPath),{recursive:true});
  fs.writeFileSync(outPath,JSON.stringify(report,null,2)+"\n","utf8");
 }
 return report;
}
if(require.main===module)run().then(r=>{
  console.log(JSON.stringify(r,null,2));
  console.log("PREVIEW_ONLY_NO_PRINTER_EFFECTS=true");
}).catch(e=>{console.error("PREFLIGHT_ERROR="+e.message);process.exitCode=1});
module.exports={run,handshake};
