<#
TATA Comandas V7.40 — Three *fictional* printed slips, Epson CAIXA only.
DEFAULT: read-only preflight, no print. Not a service, no SQL/iFood/Teknisa.
Production orders are explicitly forbidden. Physical print requires a NEW
explicit operator approval for *exactly three* mock slips; one previous
single-slip approval does NOT cover this three-slip pilot.
No auto-cut/driver/spooler configuration changes, no network or API.
#>
[CmdletBinding()]
param(
  [switch] $EmitThreeSyntheticSlips,
  [string] $Authorization = ''
)
$ErrorActionPreference = 'Stop'
$printerName = 'CAIXA'
$port = 'ESDPRT001'
$driver = 'EPSON TM-T20 ReceiptE4'
$tag = 'CESAR_AUTORIZOU_TRES_VIAS_FICTICIAS_CAIXA_20261013'
$date = '2026-10-13'
$sentinel = 'C:\ProgramData\TataComandaReader\state\mock-three-vias-caixa-20261013.once'
$now = Get-Date

# Always fail closed on unexpected device, time, queue, or pending jobs.
if ($now.ToString('yyyy-MM-dd') -ne $date -or $now.Hour -ge 11) {
  throw 'OUTSIDE_SPECIFIC_AUTHORIZED_TEST_DATE_OR_PRE_LUNCH_WINDOW'
}
if ([Environment]::MachineName -ne 'CAIXA_MOOCA') {
  throw 'NOT_ITAIM_AUTHORIZED_WINDOWS_HOST'
}
$p = Get-Printer -Name $printerName -ErrorAction Stop
if ($p.Name -cne $printerName -or $p.PortName -cne $port -or
    $p.DriverName -cne $driver -or
    $p.PrinterStatus -notin @('Normal','Idle')) {
  throw 'PRINTER_TARGET_MISMATCH_OR_NOT_READY'
}
if ((Get-Service Spooler).Status -ne 'Running') {
  throw 'SPOOLER_NOT_RUNNING'
}
if (@(Get-PrintJob -PrinterName $printerName -ErrorAction SilentlyContinue).Count -ne 0) {
  throw 'TARGET_QUEUE_NOT_EMPTY'
}
$jobs = @(
  [ordered]@{slot='PRODUCAO 1'; marker='FICTICIO A'; doc='TATA-TESTE-3V-P1'},
  [ordered]@{slot='PRODUCAO 2'; marker='FICTICIO B'; doc='TATA-TESTE-3V-P2'},
  [ordered]@{slot='CONFERENCIA'; marker='FICTICIO C'; doc='TATA-TESTE-3V-CF'}
)
if (-not $EmitThreeSyntheticSlips) {
  [ordered]@{
    schema='deliveryos.caixa-physical-3-mock-v740'
    status='READY_FOR_SEPARATE_HUMAN_APPROVAL_NOT_EXECUTED'
    mock_jobs=$jobs.Count
    destination='CAIXA'
    host='CAIXA_MOOCA'
    paper_confirmed=$false
    print_effect=$false
    service_changed=$false
    spooler_config_changed=$false
    iFood_or_Teknisa_changed=$false
    non_caixa_printers_tested=$false
  } | ConvertTo-Json -Compress
  return
}
if ($Authorization -cne $tag) { throw 'SEPARATE_EXPLICIT_AUTHORIZATION_REQUIRED' }
if (Test-Path -LiteralPath $sentinel) { throw 'THIS_MOCK_PILOT_ALREADY_ATTEMPTED' }
if (-not (Test-Path -LiteralPath (Split-Path $sentinel) -PathType Container)) {
  throw 'EXISTING_STATE_DIR_MISSING'
}
# Durable reservation BEFORE attempting any job. After partial failure,
# never retry automatically: operator must inspect paper and resolve.
$reservation = [IO.File]::Open($sentinel,
  [IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
try {
  $bytes = [Text.Encoding]::ASCII.GetBytes(
    'SINGLE_CONTROLLED_THREE_MOCK_PILOT_ATTEMPT'+[Environment]::NewLine)
  $reservation.Write($bytes,0,$bytes.Length)
  $reservation.Flush($true)
} finally { $reservation.Dispose() }
Add-Type -AssemblyName System.Drawing
$issued=0
foreach($ticket in $jobs) {
  # Allow bounded draining of the previous synthetic job. Never flush,
  # cancel or modify any job/queue; a timeout stops without retry.
  $deadline = (Get-Date).AddSeconds(10)
  while (@(Get-PrintJob -PrinterName $printerName -ErrorAction SilentlyContinue).Count -ne 0) {
    if ((Get-Date) -ge $deadline) {
      throw 'PREVIOUS_MOCK_JOB_STILL_IN_QUEUE_STOP_WITHOUT_RETRY'
    }
    Start-Sleep -Milliseconds 250
  }
  $d = New-Object System.Drawing.Printing.PrintDocument
  $d.PrinterSettings.PrinterName = $printerName
  if (-not $d.PrinterSettings.IsValid) { $d.Dispose(); throw 'PRINTER_SETTINGS_INVALID' }
  $d.PrinterSettings.Copies = [int16]1
  $d.PrintController = New-Object System.Drawing.Printing.StandardPrintController
  $d.DocumentName = $ticket.doc + '-' + (Get-Date).ToString('HHmmss')
  $slot = [string]$ticket.slot
  $marker = [string]$ticket.marker
  $draw = [System.Drawing.Printing.PrintPageEventHandler] {
    param($sender,$e)
    $big = New-Object System.Drawing.Font('Arial',15,[System.Drawing.FontStyle]::Bold)
    $std = New-Object System.Drawing.Font('Arial',10,[System.Drawing.FontStyle]::Bold)
    try {
      $black = [System.Drawing.Brushes]::Black
      $e.Graphics.DrawString('TESTE - NAO PRODUZIR',$big,$black,[single]10,[single]20)
      $e.Graphics.DrawString('TATA COMANDAS',$std,$black,[single]10,[single]63)
      $e.Graphics.DrawString($slot,$big,$black,[single]10,[single]90)
      $e.Graphics.DrawString($marker,$std,$black,[single]10,[single]128)
      $e.Graphics.DrawString('SEM PRODUTOS / SEM CLIENTE',$std,$black,[single]10,[single]160)
      $e.Graphics.DrawString('UMA VIA FICTICIA; NAO PREPARAR',$std,$black,[single]10,[single]188)
      $e.HasMorePages = $false
    } finally {
      $big.Dispose(); $std.Dispose()
    }
  }
  try {
    $d.add_PrintPage($draw)
    $d.Print()
    $issued++
    Write-Output ('MOCK_JOB_SUBMITTED='+$issued+' SLOT='+$slot)
  } finally {
    $d.remove_PrintPage($draw)
    $d.Dispose()
  }
}
Write-Output ('THREE_MOCK_JOBS_SUBMITTED='+$issued+' PAPER_CONFIRMED=FALSE')
Write-Output 'ONLY_CAIXA_TESTED=true;NO_PRODUCTION_ORDER_PRINTED=true'
