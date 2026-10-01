param(
  [string]$OutputPath = ".\production-printer-preflight.json",
  [switch]$ProbeTcp9100
)

$ErrorActionPreference = "Stop"

$expected = @(
  @{ code = "00002"; name = "COZINHA"; ip = "192.168.0.116"; alias = "LPT3" },
  @{ code = "00003"; name = "DELIVERY SUSHI 1"; ip = "192.168.0.153"; alias = $null },
  @{ code = "00004"; name = "DELIVERY SUSHI 2"; ip = "192.168.0.4"; alias = $null },
  @{ code = "00006"; name = "BALCAOSUSHI2"; ip = "192.168.0.110"; alias = "LPT5" },
  @{ code = "00007"; name = "BAR"; ip = "192.168.0.232"; alias = "LPT6" },
  @{ code = "00009"; name = "BALCAOSUSHI1"; ip = "192.168.0.142"; alias = "LPT4" }
)

function Safe-GetPrintConfiguration([string]$PrinterName) {
  try {
    $c = Get-PrintConfiguration -PrinterName $PrinterName -ErrorAction Stop
    return @{
      paper_size = [string]$c.PaperSize
      paper_size_raw_kind = [string]$c.PaperSize.RawKind
      color = [bool]$c.Color
      duplexing_mode = [string]$c.DuplexingMode
    }
  } catch {
    return @{
      error = $_.Exception.Message
    }
  }
}

$printers = @(Get-Printer -ErrorAction Stop)
$ports = @(Get-PrinterPort -ErrorAction Stop)
$cimPrinters = @()
try { $cimPrinters = @(Get-CimInstance Win32_Printer -ErrorAction Stop) } catch {}

$queueRows = foreach ($printer in $printers) {
  $port = $ports | Where-Object { $_.Name -eq $printer.PortName } | Select-Object -First 1
  $cim = $cimPrinters | Where-Object { $_.Name -eq $printer.Name } | Select-Object -First 1

  [ordered]@{
    printer_name = [string]$printer.Name
    driver_name = [string]$printer.DriverName
    port_name = [string]$printer.PortName
    shared = [bool]$printer.Shared
    share_name = [string]$printer.ShareName
    published = [bool]$printer.Published
    printer_status = [string]$printer.PrinterStatus
    job_count = [int]$printer.JobCount
    port = if ($port) {
      [ordered]@{
        name = [string]$port.Name
        description = [string]$port.Description
        printer_host_address = [string]$port.PrinterHostAddress
        port_number = if ($null -ne $port.PortNumber) { [int]$port.PortNumber } else { $null }
        snmp_enabled = if ($null -ne $port.SNMPEnabled) { [bool]$port.SNMPEnabled } else { $null }
      }
    } else { $null }
    cim = if ($cim) {
      [ordered]@{
        work_offline = [bool]$cim.WorkOffline
        detected_error_state = [string]$cim.DetectedErrorState
        extended_printer_status = [string]$cim.ExtendedPrinterStatus
        printer_state = [string]$cim.PrinterState
        printer_status = [string]$cim.PrinterStatus
      }
    } else { $null }
    configuration = Safe-GetPrintConfiguration -PrinterName $printer.Name
  }
}

$expectedRows = foreach ($e in $expected) {
  $matchingPorts = @($ports | Where-Object {
    ([string]$_.PrinterHostAddress -eq [string]$e.ip) -or
    ($e.alias -and ([string]$_.Name -eq [string]$e.alias))
  })

  $matchingQueues = @($printers | Where-Object {
    $pn = [string]$_.PortName
    ($matchingPorts | Where-Object { [string]$_.Name -eq $pn }).Count -gt 0 -or
    ([string]$_.Name -eq [string]$e.name)
  })

  $tcp = $null
  if ($ProbeTcp9100) {
    try {
      $test = Test-NetConnection -ComputerName $e.ip -Port 9100 -WarningAction SilentlyContinue
      $tcp = [ordered]@{
        port = 9100
        tcp_test_succeeded = [bool]$test.TcpTestSucceeded
      }
    } catch {
      $tcp = [ordered]@{
        port = 9100
        tcp_test_succeeded = $false
        error = $_.Exception.Message
      }
    }
  }

  [ordered]@{
    printer_code = $e.code
    configured_name = $e.name
    configured_ip = $e.ip
    configured_port_alias = $e.alias
    matching_windows_ports = @($matchingPorts | ForEach-Object { [string]$_.Name })
    matching_windows_queues = @($matchingQueues | ForEach-Object { [string]$_.Name })
    tcp_9100_probe = $tcp
  }
}

$result = [ordered]@{
  schema = "deliveryos.production-printer-preflight-readonly.v1"
  captured_at = (Get-Date).ToString("o")
  computer_name = $env:COMPUTERNAME
  probe_tcp_9100_requested = [bool]$ProbeTcp9100
  effect_boundary = [ordered]@{
    print_attempted = $false
    spooler_job_created = $false
    printer_configuration_changed = $false
    network_payload_sent_to_printer = $false
  }
  expected = $expectedRows
  windows_queues = $queueRows
  notes = @(
    "Get-Printer/Get-PrinterPort/Get-PrintConfiguration/Win32_Printer only.",
    "Optional Test-NetConnection checks TCP handshake only and is disabled by default.",
    "This probe does not establish physical-paper proof."
  )
}

$json = $result | ConvertTo-Json -Depth 12
$json | Set-Content -LiteralPath $OutputPath -Encoding UTF8
Write-Output $json
