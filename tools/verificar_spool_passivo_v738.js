"use strict";
/* Static/source audit plus ParseFile only. Does NOT execute PS or open queues. */
const fs=require("node:fs"),assert=require("node:assert/strict");
const path=require("node:path"),{spawnSync}=require("node:child_process");
const psFile=path.resolve(__dirname,"auditar_spool_formato_v738_readonly.ps1");
const source=fs.readFileSync(psFile,"utf8");
let n=0;function check(label,fn){fn();n++;console.log("PASS V738 "+n+" "+label);}
check("only target spool directory is used",()=>{
 assert.match(source,/System32\\spool\\PRINTERS/);
 assert.match(source,/-Filter '\*\.SPL'/);
});
check("file handle requests read access only",()=>{
 assert.match(source,/\[IO\.FileAccess\]::Read/);
 assert.match(source,/\[IO\.FileShare\]::ReadWrite/);
 assert.match(source,/\[IO\.FileShare\]::Delete/);
});
check("only first 64 bytes accessed",()=>{
 assert.match(source,/Min\(\[int64\]64,\$stream\.Length\)/);
 assert.doesNotMatch(source,/\[IO\.File\]::ReadAll/);
 assert.doesNotMatch(source,/\.CopyTo\(/);
});
check("no print spooler, device, service or filesystem changes",()=>{
 assert.doesNotMatch(source,/\b(?:Set-Printer|Set-PrintConfiguration|Remove-Printer|Remove-PrintJob|Restart-Service|Start-Service|Stop-Service|New-Printer|Add-Printer|Set-ItemProperty|Enable-Printer|Disable-Printer|Set-Content|Out-File|Add-Content|WriteAllBytes|Copy-Item|Move-Item|Remove-Item|Invoke-WebRequest|Invoke-RestMethod|Start-Process)\b/i);
 assert.match(source,/service_change=\$false/);
 assert.match(source,/printer_change=\$false/);
 assert.match(source,/spooler_change=\$false/);
 assert.match(source,/file_write=\$false/);
});
check("sampling limited and does not persist or export customer content",()=>{
 assert.match(source,/\$durationSec=18\b/);
 assert.match(source,/Start-Sleep -Milliseconds 100/);
 assert.match(source,/customer_content_exported=\$false/);
 assert.match(source,/order_content_recovered=\$false/);
});
check("spool capture never proves source or paper",()=>{
 assert.match(source,/print_stream_source_proven=\$false/);
 assert.match(source,/ifood_or_teknisa_origin_proven=\$false/);
 assert.match(source,/status='OBSERVATION_ONLY_NOT_SPOOL_CONTENT_PROOF'/);
});
check("PowerShell parse only, never execute passive probe",()=>{
 const cmd="$t=$null; $e=$null; [void][System.Management.Automation.Language.Parser]::ParseFile($env:V738_PROBE_PATH,[ref]$t,[ref]$e); if($e.Count -gt 0){$e | ForEach-Object {$_.Message}; exit 5}; 'V738_POWERSHELL_PARSE_PASS'";
 const r=spawnSync("pwsh",["-NoProfile","-NonInteractive","-Command",cmd],
   {encoding:"utf8",timeout:15000,windowsHide:true,env:{...process.env,V738_PROBE_PATH:psFile}});
 assert.equal(r.status,0,(r.stderr||"").slice(0,350)+" "+(r.stdout||"").slice(0,350));
 assert.match(r.stdout,/V738_POWERSHELL_PARSE_PASS/);
});
console.log("THERMAL_PASSIVE_SPOOL_PREFIX_V738="+n+"/"+n+
 " STATIC_AND_SYNTAX_ONLY_NO_WINDOWS_SPOOL_ACCESS_NO_PRINT");
