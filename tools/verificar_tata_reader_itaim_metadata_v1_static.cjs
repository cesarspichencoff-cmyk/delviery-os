"use strict";
/* Static safety contract, executable in Linux/Windows CI without host access. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const script = fs.readFileSync(path.join(__dirname,
  "tata_reader_itaim_metadata_v1_readonly.ps1"),"utf8");
function safe(s) {
  const must = [
    /\[CmdletBinding\(\)\]/,
    /\$approvedHost='CAIXA_MOOCA'/,
    /\$root='C:\\ProgramData\\TataComandaReader'/,
    /heartbeat='state\\reader-heartbeat-v1\.json'/,
    /shadow_consumer='evidence\\shadow-consumer-status\.json'/,
    /reporting_projector='evidence\\reporting-projector-status\.json'/,
    /production_service='state\\production-service-state\.json'/,
    /OrdinalIgnoreCase/,
    /if\(\$out\.root_directory_safe\)/,
    /Get-Item -LiteralPath \$root -Force -ErrorAction Stop/,
    /Get-Item -LiteralPath \(Join-Path \$root \$dirName\) -Force -ErrorAction Stop/,
    /Get-Item -LiteralPath \(Join-Path \$root \$rel\) -Force -ErrorAction Stop/,
    /\[IO\.FileAttributes\]::ReparsePoint/g,
    /status='HOLD'/,
    /reader_service_running_proven=\$false/,
    /reader_content_valid_proven=\$false/,
    /native_first_dispatch_proven=\$false/,
    /physical_paper_proven=\$false/,
    /ready_for_operational_print=\$false/,
    /file_contents_read=\$false;file_write=\$false/,
    /spooler_read=\$false;spooler_write=\$false/,
    /sql_read=\$false;sql_write=\$false/,
    /ConvertTo-Json -Depth 5 -Compress/
  ];
  if(must.some(re=>!re.test(s)))return false;
  if((s.match(/logical_name=/g)||[]).length!==1)return false;
  if((s.match(/Get-Item -LiteralPath/g)||[]).length!==3)return false;
  const deny = [
    /\b(?:Get-Content|Set-Content|Add-Content|Out-File|Export-Csv|Import-Csv|Get-ChildItem|Copy-Item|Move-Item|New-Item|Remove-Item|Set-Item|Get-Acl|Set-Acl|Get-FileHash)\b/i,
    /\b(?:Get-Process|Start-Process|Stop-Process|Get-Service|Set-Service|Start-Service|Restart-Service|Stop-Service)\b/i,
    /\b(?:Get-Printer|Set-Printer|Add-Printer|Remove-Printer|Get-PrintJob|Remove-PrintJob|Get-WinEvent|Get-EventLog)\b/i,
    /\b(?:Invoke-WebRequest|Invoke-RestMethod|Invoke-Command|Invoke-Expression|Invoke-Sqlcmd|SqlCommand|sqlcmd)\b/i,
    /\b(?:StartDocPrinter|WritePrinter|Out-Printer|Start-Job|Register-ScheduledTask|schtasks)\b/i,
    /\b(?:ReadAllText|ReadAllBytes|ReadLines|FileStream|OpenRead|StreamReader)\b/i,
    /\b(?:Get-Credential|ConvertTo-SecureString|Export-Clixml|Start-Transcript)\b/i,
    /\b(?:password|access_token|refresh_token|secret|cookie)\s*=/i,
    /https?:\/\//i,
    /\\reader-events-v1\\/i,
    /\$out\.status='(?:OK|READY|SUCCESS|PROVEN)'/i,
  ];
  return !deny.some(re=>re.test(s));
}
let passed=0;
function test(label,fn){fn();passed++;console.log("PASS "+passed+" "+label);}
test("existing Reader metadata-only script passes read-only guard",()=>assert.equal(safe(script),true));
const changes = [
 ["wrong host",s=>s.replace("$approvedHost='CAIXA_MOOCA'","$approvedHost='OTHER'" )],
 ["changed heartbeat path",s=>s.replace("state\\reader-heartbeat-v1.json","state\\reader-events-v1.json")],
 ["changed source directory",s=>s.replace("$root='C:\\ProgramData\\TataComandaReader'","$root='C:\\Users\\Tata'")],
 ["bypass host gate",s=>s.replace("OrdinalIgnoreCase","InvariantCulture")],
 ["bypass root gate",s=>s.replace("if($out.root_directory_safe)","if($true)")],
 ["read order content",s=>s+"\nGet-Content $f\n"],
 ["list order files",s=>s+"\nGet-ChildItem C:\\ProgramData\n"],
 ["read printer queue",s=>s+"\nGet-PrintJob -PrinterName CAIXA\n"],
 ["run arbitrary network",s=>s+"\nInvoke-WebRequest https://example.org\n"],
 ["write to disk",s=>s+"\nOut-File C:\\temp\\export.txt\n"],
 ["read SQL",s=>s+"\nInvoke-Sqlcmd 'select 1'\n"],
 ["restart existing Reader",s=>s+"\nRestart-Service TataReader\n"],
 ["access service",s=>s+"\nGet-Service TataReader\n"],
 ["authorize printing",s=>s.replace("ready_for_operational_print=$false","ready_for_operational_print=$true")],
 ["claim Reader alive",s=>s.replace("reader_service_running_proven=$false","reader_service_running_proven=$true")],
 ["claim physical paper",s=>s.replace("physical_paper_proven=$false","physical_paper_proven=$true")],
 ["read JSON",s=>s.replace("file_contents_read=$false","file_contents_read=$true")],
 ["remove exact file probe",s=>s.replace("Get-Item -LiteralPath (Join-Path $root $rel)","Get-Fake -LiteralPath (Join-Path $root $rel)")],
];
for(const [label,change] of changes) test(label,()=>{
 const s=change(script);assert.notEqual(s,script);assert.equal(safe(s),false,label);
});
console.log("ITAIM_EXISTING_READER_METADATA_STATIC="+passed+"/"+passed+
 " NO_CONTENT NO_SQL NO_PRINT NO_HOST_EFFECTS");
