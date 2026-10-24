"use strict";
/** V7.33: static proof of the WSB isolation and guest code fail-closed.
 * This DOES NOT prove Windows Sandbox is installed or running on CAIXA.
 */
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const wsb=fs.readFileSync(path.join(__dirname,"../runtime/windows/comandas_sandbox_observer_v733.wsb"),"utf8");
const ps=fs.readFileSync(path.join(__dirname,"../runtime/windows/comandas_sandbox_observe_v733.ps1"),"utf8");
let count=0;function check(n,fn){fn();count++;console.log("PASS V733 "+count+" "+n);}
const tags=name=>[...wsb.matchAll(new RegExp("<"+name+">([^<]*)</"+name+">","g"))].map(x=>x[1].trim());
check("sandbox denies networking, clipboard, GPU, audio, video and printer redirection",()=>{
 for(const tag of ["Networking","ClipboardRedirection","PrinterRedirection",
                   "vGPU","AudioInput","VideoInput"])
  assert.deepEqual(tags(tag),["Disable"],"unexpected "+tag);
});
check("sandbox maps exactly four existing host directories read-only",()=>{
 const folders=[...wsb.matchAll(/<MappedFolder>([\s\S]*?)<\/MappedFolder>/g)].map(x=>x[1]);
 assert.equal(folders.length,4);
 for(const f of folders){
  assert.match(f,/<ReadOnly>true<\/ReadOnly>/);
  assert.equal((f.match(/<HostFolder>/g)||[]).length,1);
  assert.equal((f.match(/<SandboxFolder>/g)||[]).length,1);
 }
});
check("sandbox cannot mount host spooler, printers or Windows root",()=>{
 assert.ok(!/spool\\PRINTERS|Windows\\System32|\\ADMIN\$|\\C\$/i.test(wsb));
});
check("single source root maps only local state, rules, bundle and Node runtime",()=>{
 for(const dir of ["C:\\ProgramData\\TataComandaReader\\state",
                   "C:\\ProgramData\\TataComandaReader\\shadow",
                   "C:\\ProgramData\\TataComandaReader\\comandas-sandbox-v733",
                   "C:\\Program Files\\nodejs"])
   assert.ok(wsb.includes("<HostFolder>"+dir+"</HostFolder>"),dir);
});
check("sandbox auto-runs only the safe guest observer script, never V2",()=>{
 assert.deepEqual(tags("Command"),[
  "powershell.exe -NoProfile -ExecutionPolicy Bypass -File C:\\ComandasBundleRO\\comandas_sandbox_observe_v733.ps1"
 ]);
 assert.ok(!/live_shadow_consumer_v2_candidate_v714\.cjs<\/Command>/.test(wsb));
});
check("guest only starts after checking Sandbox identity and pre-opening cutoff",()=>{
 assert.ok(ps.includes("$env:USERNAME -ne 'WDAGUtilityAccount'"));
 assert.ok(ps.includes("2026-10-13T14:14:00+00:00"));
 assert.ok(ps.indexOf("DELIVERY_OPENING_FREEZE_REACHED")<ps.indexOf("New-Item -ItemType Directory"));
});
check("guest cannot call services, printers, schedulers, registry, sequencial",()=>{
 assert.doesNotMatch(ps,/\b(?:Restart-Service|Stop-Service|Start-Service|Set-Service|Set-Printer|Out-Printer|Add-Printer|Set-ItemProperty|schtasks|New-ScheduledTask|Invoke-WebRequest|Invoke-RestMethod)\b/i);
 assert.doesNotMatch(ps,/\b(?:spoolsv|netsh|reg\.exe|sc\.exe)\b/i);
});
check("V2 source is COPIED into guest scratch but NEVER run",()=>{
 assert.ok(ps.includes("live_shadow_consumer_v2_candidate_v714.cjs"));
 assert.ok(ps.includes("comandas_windows_sidecar_preflight_v731_readonly.js"));
 assert.ok(!/& \$node[^\n]*live_shadow_consumer_v2/.test(ps));
});
check("guest uses a disposable temp directory, not mutable host paths",()=>{
 assert.ok(ps.includes("$guest = Join-Path $env:TEMP"));
 assert.ok(ps.includes("New-Item -ItemType Directory -Path $dir"));
 assert.ok(ps.includes("Copy-Item -LiteralPath"));
 assert.ok(ps.includes("GetFolderPath('Desktop')"));
 assert.ok(!ps.includes("C:\\ProgramData\\TataComandaReader\\state"));
});
check("guest reports HOLD with no installation or print permission",()=>{
 assert.ok(ps.includes("status = 'HOLD'"));
 assert.ok(ps.includes("print_authorized = $false"));
 assert.ok(ps.includes("sequence_written = $false"));
 assert.ok(ps.includes("host_files_written = $false"));
});
console.log("COMANDAS_WINDOWS_SANDBOX_ISOLATION_V733="+count+"/"+count+
 " STATIC_ONLY NO_HOST_INSTALL NO_AUTO_PRINT");
