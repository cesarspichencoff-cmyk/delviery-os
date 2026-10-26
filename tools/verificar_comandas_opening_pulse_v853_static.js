"use strict";
/**
 * V8.53 anti-regression gate: the read-only delivery opening pulse cannot
 * mutate the already-open store or claim receipt/paper/order loss.
 */
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const original=fs.readFileSync(
 path.join(__dirname,"comandas_opening_pulse_v853_readonly.ps1"),"utf8");
function check(s){
 const must=[
  /schema='deliveryos\.comandas\.opening-pulse\.v853\.readonly'/,
  /Get-Process -ErrorAction Stop/,
  /Get-Service -Name Spooler -ErrorAction Stop/,
  /Get-WinEvent -ListLog 'Microsoft-Windows-PrintService\/Operational'/,
  /Get-WinEvent -FilterHashtable/,
  /-MaxEvents \$EventLimit/,
  /\[ValidateRange\(1,120\)\]/,
  /\[ValidateRange\(1,2000\)\]/,
  /\.AddMinutes\(-\$WindowMinutes\)/,
  /Get-ChildItem -LiteralPath \$root -File -Filter '\*\.json'/,
  /NO_NEW_PRINT_EVENTS_NOT_PROOF_OF_MISSING_ORDERS/,
  /STALE_READER_NOT_PROOF_OF_IFOOD_DOWN/,
  /spooler_status='UNKNOWN'/,
  /application_live_processes_proven=\$false/,
  /ifood_orders_received_proven=\$false/,
  /teknisa_parity_proven=\$false/,
  /gp_auto_print_setting_proven=\$false/,
  /print_origin_gp_proven=\$false/,
  /paper_exited_proven=\$false/,
  /orders_missing_proven=\$false/,
  /print=\$false/,
  /spooler_change=\$false/,
  /service_change=\$false/,
  /file_write=\$false/,
  /api=\$false/,
  /ack=\$false/,
  /config_change=\$false/,
  /deploy=\$false/,
  /ConvertTo-Json -Depth 6 -Compress/
 ];
 if(must.some(re=>!re.test(s)))return false;
 const forbidden=[
  /\b(?:Stop-Service|Start-Service|Restart-Service|Set-Service)\b/i,
  /\b(?:Set-Printer|Add-Printer|Remove-Printer|Add-PrinterPort|Set-PrinterPort)\b/i,
  /\b(?:Get-PrintJob|Remove-PrintJob|Restart-PrintJob)\b/i,
  /\b(?:Set-Content|Add-Content|Out-File|Export-Csv|New-Item|Move-Item|Remove-Item|Copy-Item)\b/i,
  /\b(?:Invoke-RestMethod|Invoke-WebRequest|Invoke-Expression|Invoke-Command|Start-Process|Stop-Process)\b/i,
  /\b(?:Invoke-Sqlcmd|SqlCommand|sqlcmd(?:\.exe)?)\b/i,
  /\b(?:Get-Content|ReadAllText|ReadAllBytes)\b/i,
  /\b(?:Get-Credential|ConvertTo-SecureString|Export-Clixml|Start-Transcript)\b/i,
  /\b(?:WritePrinter|StartDocPrinter|Write-Printer|Start-Job|Register-ScheduledTask)\b/i,
  /\.DocumentPrinted\.Param[12345678]/,
  /\b(?:password|access_token|refresh_token|cookie|secret)\s*=/i,
 ];
 return !forbidden.some(re=>re.test(s));
}
let pass=0;
function test(name,fn){fn();pass++;console.log("PASS "+pass+" "+name);}
test("opening pulse is bounded, blind to orders, and without effects",
 ()=>assert.equal(check(original),true));
const mutants=[
 ["falsifies receipt",s=>s.replace("ifood_orders_received_proven=$false","ifood_orders_received_proven=$true")],
 ["falsifies order loss",s=>s.replace("orders_missing_proven=$false","orders_missing_proven=$true")],
 ["falsifies paper",s=>s.replace("paper_exited_proven=$false","paper_exited_proven=$true")],
 ["falsifies GP origin",s=>s.replace("print_origin_gp_proven=$false","print_origin_gp_proven=$true")],
 ["falsifies Gestor printer configuration",s=>s.replace("gp_auto_print_setting_proven=$false","gp_auto_print_setting_proven=$true")],
 ["falsifies Teknisa parity",s=>s.replace("teknisa_parity_proven=$false","teknisa_parity_proven=$true")],
 ["prints after running",s=>s+"\nStartDocPrinter\n"],
 ["restarts spooler",s=>s+"\nRestart-Service Spooler\n"],
 ["changes printer route",s=>s+"\nSet-Printer -Name x\n"],
 ["reads order job content",s=>s+"\nGet-PrintJob -PrinterName x\n"],
 ["reads log content",s=>s+"\nGet-Content x\n"],
 ["queries external API",s=>s+"\nInvoke-RestMethod -Uri x\n"],
 ["writes observation file",s=>s+"\nOut-File x\n"],
 ["runs SQL",s=>s+"\nInvoke-Sqlcmd -Query 'SELECT 1'\n"],
 ["reads print account/title",s=>s+"\n$x=$xml.Event.UserData.DocumentPrinted.Param2\n"],
 ["disables event scan bound",s=>s.replace("-MaxEvents $EventLimit","-MaxEvents 999999")],
 ["disables time bound",s=>s.replace(".AddMinutes(-$WindowMinutes)",".AddDays(-365)")],
 ["disables live process query",s=>s.replace("Get-Process -ErrorAction Stop","Get-FakeProcess")],
 ["disables spooler check",s=>s.replace("Get-Service -Name Spooler -ErrorAction Stop","Get-FakeService")],
 ["enables file writes in manifest",s=>s.replace("file_write=$false","file_write=$true")],
 ["enables acknowledgements in manifest",s=>s.replace("ack=$false","ack=$true")],
 ["removes unknown order alert limitation",s=>s.replace("'NO_NEW_PRINT_EVENTS_NOT_PROOF_OF_MISSING_ORDERS'","'NO_PRINT_EVENTS_MEAN_LOST_ORDERS'")],
];
for(const [name,mutation] of mutants)test(name,()=>{
 const x=mutation(original);
 assert.notEqual(x,original,"mutation must be material");
 assert.equal(check(x),false);
});
console.log("COMANDAS_OPENING_PULSE_V853_STATIC="+pass+"/"+pass+
 " READONLY NO_API NO_PRINT NO_ACK NO_ORDER_LOSS_INFERENCE");
