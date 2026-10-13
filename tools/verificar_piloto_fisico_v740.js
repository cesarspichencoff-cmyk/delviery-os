"use strict";
const fs=require("node:fs");
const path=require("node:path");
const assert=require("node:assert/strict");
const {spawnSync}=require("node:child_process");
const f=path.join(__dirname,"piloto_fisico_tres_vias_caixa_v740.ps1");
const s=fs.readFileSync(f,"utf8");
let ok=0;
function check(name,fn){fn();ok++;console.log("PASS V740 "+ok+" "+name);}
check("print requires separate three-slips authorization and explicit switch",()=>{
  assert.match(s,/\[switch\] \$EmitThreeSyntheticSlips/);
  assert.match(s,/if \(-not \$EmitThreeSyntheticSlips\) \{/);
  assert.match(s,/if \(\$Authorization -cne \$tag\) \{ throw 'SEPARATE_EXPLICIT_AUTHORIZATION_REQUIRED' \}/);
  assert.ok(s.indexOf("if (-not $EmitThreeSyntheticSlips)")<s.indexOf("Add-Type -AssemblyName System.Drawing"));
});
check("strictly synthetic three kinds and no order content, SQL, or API",()=>{
  assert.match(s,/slot='PRODUCAO 1'/);
  assert.match(s,/slot='PRODUCAO 2'/);
  assert.match(s,/slot='CONFERENCIA'/);
  assert.match(s,/SEM PRODUTOS \/ SEM CLIENTE/);
  assert.match(s,/TESTE - NAO PRODUZIR/);
  assert.doesNotMatch(s,/\b(?:SqlConnection|Invoke-WebRequest|Invoke-RestMethod|Get-Credential|HttpClient|Stop-Service|Start-Service|Restart-Service|Set-Printer|Set-PrintConfiguration)\b/i);
});
check("hardcoded CAIXA host port and model only",()=>{
  assert.match(s,/\$printerName = 'CAIXA'/);
  assert.match(s,/\$port = 'ESDPRT001'/);
  assert.match(s,/\$driver = 'EPSON TM-T20 ReceiptE4'/);
  assert.match(s,/MachineName -ne 'CAIXA_MOOCA'/);
  assert.match(s,/\$now.Hour -ge 11/);
});
check("bounded to three jobs, one copy, one page and one-time attempted sentinel",()=>{
  assert.match(s,/FileMode\]::CreateNew/);
  assert.match(s,/THIS_MOCK_PILOT_ALREADY_ATTEMPTED/);
  assert.match(s,/Copies = \[int16\]1/);
  assert.match(s,/HasMorePages = \$false/);
  assert.match(s,/if \(@\(Get-PrintJob -PrinterName \$printerName/);
});
check("not connected to live service and no auto-run in CI",()=>{
  assert.doesNotMatch(s,/Register-ScheduledTask|Set-ScheduledTask|Enable-ScheduledTask|Set-Service|sc\.exe|Restart-Computer|Start-Process/);
});
check("PowerShell parse on CI only, no execution",()=>{
  const cmd="$t=$null;$e=$null;[void][System.Management.Automation.Language.Parser]::ParseFile($env:TATA_MOCK_SCRIPT,[ref]$t,[ref]$e);if($e.Count -gt 0){$e|ForEach-Object {$_.Message};exit 6};'V740_PARSE_ONLY_PASS'";
  const r=spawnSync("pwsh",["-NoProfile","-NonInteractive","-Command",cmd],{
    encoding:"utf8",timeout:15000,windowsHide:true,env:{...process.env,TATA_MOCK_SCRIPT:f}
  });
  assert.equal(r.status,0,(r.stdout||"")+(r.stderr||""));
  assert.match(r.stdout,/V740_PARSE_ONLY_PASS/);
});
console.log("THERMAL_CAIXA_THREE_MOCK_V740="+ok+"/"+ok+
" STATIC_AND_PARSE_ONLY NO_PRINT NO_SERVICE NO_PRODUCTION");
