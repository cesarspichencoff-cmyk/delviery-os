$ErrorActionPreference = 'Stop'

$os = Get-CimInstance Win32_OperatingSystem
$cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
$gpu = Get-CimInstance Win32_VideoController | Sort-Object AdapterRAM -Descending | Select-Object -First 1
$drive = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='C:'"
$power = (powercfg /getactivescheme 2>$null) -join ' '
$relevant = Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -match 'llama|ollama|deliveryos' } | Select-Object -ExpandProperty ProcessName -Unique

$vram = [int64]($gpu.AdapterRAM)
$nvidiaSmi = Get-Command nvidia-smi.exe -ErrorAction SilentlyContinue
$driver = $gpu.DriverVersion
$temperature = $null
if ($nvidiaSmi) {
  $query = & $nvidiaSmi.Source --query-gpu=memory.total,driver_version,temperature.gpu --format=csv,noheader,nounits 2>$null | Select-Object -First 1
  if ($query) {
    $parts = $query -split ',' | ForEach-Object { $_.Trim() }
    $vram = [int64]$parts[0] * 1MB
    $driver = $parts[1]
    $temperature = [double]$parts[2]
  }
}

[pscustomobject]@{
  platform = 'win32'
  release = $os.Version
  architecture = $env:PROCESSOR_ARCHITECTURE
  cpu = [pscustomobject]@{
    model = $cpu.Name
    cores = [int]$cpu.NumberOfCores
    threads = [int]$cpu.NumberOfLogicalProcessors
    instructions = @('windows_probe_only')
  }
  ram_total_bytes = [int64]$os.TotalVisibleMemorySize * 1KB
  ram_available_bytes = [int64]$os.FreePhysicalMemory * 1KB
  gpu = if ($gpu) {
    [pscustomobject]@{
      name = $gpu.Name
      vram_bytes = $vram
      driver = $driver
      acceleration = if ($nvidiaSmi) { 'nvidia' } else { 'unknown' }
    }
  } else { $null }
  disk_free_bytes = [int64]$drive.FreeSpace
  temperature_c = $temperature
  power_profile = $power
  relevant_processes = @($relevant)
  permission_status = if (([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { 'administrator' } else { 'standard_user' }
} | ConvertTo-Json -Depth 8 -Compress
