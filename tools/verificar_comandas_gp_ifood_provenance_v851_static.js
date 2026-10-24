"use strict";
/** V8.51: static, synthetic-only guard for the passive GP iFood Windows
 * print event inventory. This test never reads the real host or tickets.
 */
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const script=fs.readFileSync(path.join(__dirname,
  "comandas_gp_ifood_print_provenance_v851_readonly.ps1"),"utf8");
function check(s){
 const required=[
   /Windows PrintService\/Operational event 307/,
   /\.DocumentPrinted\.Param5/,
   /source_app\s*=\s*'UNKNOWN'/,
   /print_source_attribution_proven\s*=\s*\$false/,
   /gp_auto_print_setting_proven\s*=\s*\$false/,
   /physical_paper_proven\s*=\s*\$false/,
   /order_join_proven\s*=\s*\$false/,
   /observed_windows_print_events\s*=\s*\$false/,
   /printer_write\s*=\s*\$false/,
   /spooler_write\s*=\s*\$false/,
   /service_change\s*=\s*\$false/,
   /file_write\s*=\s*\$false/,
   /print\s*=\s*\$false/,
   /ifood_api\s*=\s*\$false/,
   /Get-CimInstance Win32_Process/,
   /Get-Printer/,
   /Get-WinEvent -FilterHashtable/,
   /MaxEvents\s*=\s*7500/,
   /ConvertTo-Json/,
   /Param4 is job owner/,
   /order-manager-printer\\logs\\main\.log/,
 ];
 for(const re of required)if(!re.test(s))return false;
 const banned=[
   /\.(?:DocumentPrinted\.)?Param[234](?!\w)/,
   /\b(?:Start-Process|Stop-Process|Restart-Service|Stop-Service|Start-Service)\b/i,
   /\b(?:Set-Printer|Add-Printer|Remove-Printer|Get-PrintJob|Restart-PrintJob|Remove-PrintJob|Add-PrinterPort|Set-PrinterPort)\b/i,
   /\b(?:Get-Content|Set-Content|Add-Content|Out-File|Export-Csv|New-Item|Remove-Item|Move-Item|Copy-Item)\b/i,
   /\b(?:Invoke-RestMethod|Invoke-WebRequest|Invoke-Expression|Invoke-Command|Enter-PSSession|New-PSSession)\b/i,
   /\b(?:SqlCommand|Invoke-Sqlcmd|sqlcmd\.exe|Start-Transcript)\b/i,
   /\b(?:Write-Printer|Write-PrintJob|RawPrinter|StartDocPrinter|WritePrinter)\b/i,
   /\b(?:cookie|access_token|refresh_token|password|secret)\s*=/i,
   /\b(?:Invoke-Item|Open-File|ShellExecute)\b/i
 ];
 for(const re of banned)if(re.test(s))return false;
 return true;
}
let count=0;
function test(name,fn){fn();count++;console.log("PASS "+count+" "+name);}
test("V8.51 passive source meets no-effect contract",()=>assert.equal(check(script),true));
const mutants=[
 ["wrong print field Param4",s=>s.replace("DocumentPrinted.Param5","DocumentPrinted.Param4")],
 ["incorrect paper proof",s=>s.replace("physical_paper_proven = $false","physical_paper_proven = $true")],
 ["claims originating app",s=>s.replace("source_app = 'UNKNOWN'","source_app = 'IFOOD_GP'")],
 ["claims exact source attribution",s=>s.replace("print_source_attribution_proven = $false","print_source_attribution_proven = $true")],
 ["claims printer settings",s=>s.replace("gp_auto_print_setting_proven = $false","gp_auto_print_setting_proven = $true")],
 ["claims order join",s=>s.replace("order_join_proven = $false","order_join_proven = $true")],
 ["allows printing",s=>s.replace("print = $false","print = $true")],
 ["allows spooler writes",s=>s.replace("spooler_write = $false","spooler_write = $true")],
 ["allows service restart",s=>s+"\nRestart-Service Spooler\n"],
 ["allows printer changes",s=>s+"\nSet-Printer -Name x\n"],
 ["allows reading raw GP logs",s=>s+"\nGet-Content -Path x\n"],
 ["allows reading live print jobs",s=>s+"\nGet-PrintJob -PrinterName x\n"],
 ["allows outbound network API",s=>s+"\nInvoke-RestMethod -Uri x\n"],
 ["allows writing files",s=>s+"\nOut-File x\n"],
 ["allows dynamic command execution",s=>s+"\nInvoke-Expression x\n"],
 ["allows raw document title",s=>s+"\n$doc=$xml.Event.UserData.DocumentPrinted.Param2\n"],
 ["allows account owner",s=>s+"\n$owner=$xml.Event.UserData.DocumentPrinted.Param4\n"],
 ["removes day bounded cap",s=>s.replace("MaxEvents = 7500","MaxEvents = 999999")],
 ["removes event source read",s=>s.replace("Get-WinEvent -FilterHashtable","Get-OtherEvent -FilterHashtable")],
 ["removes structured JSON",s=>s.replace("ConvertTo-Json -Depth 9 -Compress","ConvertTo-Text")],
 ["allows ifood call",s=>s.replace("ifood_api = $false","ifood_api = $true")],
 ["allows output persistence",s=>s.replace("file_write = $false","file_write = $true")],
];
for(const [label,mutate] of mutants)test(label,()=>{
 const altered=mutate(script);
 assert.notEqual(altered,script,"mutation must change script");
 assert.equal(check(altered),false);
});
console.log("COMANDAS_GP_IFOOD_V851_STATIC="+count+"/"+count+
 " REVIEW_ONLY PROVENANCE_UNATTRIBUTED NO_PRINT NO_REMOTE");
