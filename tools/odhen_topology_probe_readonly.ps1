param(
  [string]$OdhenRoot = "C:\TEKNISA\odhen-perifericos",
  [int]$MaxDepth = 4,
  [string]$OutputPath = ".\odhen-topology-readonly.json"
)

$ErrorActionPreference = "Stop"

# DIRECTORY/METADATA-ONLY DISCOVERY.
# No file contents, no database, no network, no process start, no printing.
# Intentional write: one evidence JSON at $OutputPath.

$excludedNames = @("log","logs","temp","cache","node_modules")
$codeExtensions = @(".js",".ts",".json",".config",".sql",".xml",".yml",".yaml",".php",".ini",".properties")
$candidateNames = @("src","routes","mobile","backend_74000","perifericos","odhenpos","repository","repositories","services","controllers")

$result = [ordered]@{
  schema = "deliveryos.odhen-topology-probe.v1"
  mode = "READ_ONLY_DIRECTORY_METADATA_ONLY"
  captured_at = (Get-Date).ToString("o")
  computer_name = $env:COMPUTERNAME
  root = $OdhenRoot
  root_exists = $false
  max_depth = $MaxDepth
  excluded_directory_names = $excludedNames
  directories = @()
  candidate_roots = @()
  errors = @()
  evidence_activity = [ordered]@{
    directory_metadata_read = $false
    file_metadata_read = $false
    file_content_read = $false
    evidence_file_write = $true
  }
  effect_boundary = [ordered]@{
    order_row_read = $false
    database_query = $false
    database_write = $false
    odhen_write = $false
    process_start = $false
    http = $false
    fiscal_action = $false
    sefaz_call = $false
    print = $false
    spooler_write = $false
    printer_configuration_change = $false
    network_payload_sent_to_printer = $false
    cutover = $false
  }
}

if (-not (Test-Path -LiteralPath $OdhenRoot -PathType Container)) {
  $result.errors += "ODHEN_ROOT_NOT_FOUND"
  $json = $result | ConvertTo-Json -Depth 10
  $json | Set-Content -LiteralPath $OutputPath -Encoding UTF8
  Write-Output $json
  exit 2
}

$result.root_exists = $true
$queue = New-Object System.Collections.Queue
$queue.Enqueue([ordered]@{ path = $OdhenRoot; depth = 0 })

while ($queue.Count -gt 0) {
  $node = $queue.Dequeue()
  $path = [string]$node.path
  $depth = [int]$node.depth

  try {
    $children = @(Get-ChildItem -LiteralPath $path -Directory -Force -ErrorAction Stop)
    $result.evidence_activity.directory_metadata_read = $true
  } catch {
    $result.errors += ("DIR_READ_ERROR:" + $path)
    continue
  }

  foreach ($dir in $children) {
    $nameLower = $dir.Name.ToLowerInvariant()
    if ($excludedNames -contains $nameLower) { continue }

    $fileCount = 0
    $extensionCounts = [ordered]@{}
    try {
      $files = @(Get-ChildItem -LiteralPath $dir.FullName -File -Force -ErrorAction Stop)
      if ($files.Count -gt 0) { $result.evidence_activity.file_metadata_read = $true }
      foreach ($file in $files) {
        $ext = $file.Extension.ToLowerInvariant()
        if ($codeExtensions -contains $ext) {
          $fileCount++
          if (-not $extensionCounts.Contains($ext)) { $extensionCounts[$ext] = 0 }
          $extensionCounts[$ext]++
        }
      }
    } catch {
      $result.errors += ("FILE_METADATA_READ_ERROR:" + $dir.FullName)
    }

    $relative = $dir.FullName.Substring($OdhenRoot.Length).TrimStart("\")
    $entry = [ordered]@{
      relative_path = $relative
      depth = ($depth + 1)
      directory_name = $dir.Name
      code_config_file_count = $fileCount
      extension_counts = $extensionCounts
      candidate_name_match = ($candidateNames -contains $nameLower)
    }
    $result.directories += $entry

    if ($entry.candidate_name_match -or $fileCount -gt 0) {
      $result.candidate_roots += [ordered]@{
        relative_path = $relative
        depth = ($depth + 1)
        directory_name = $dir.Name
        code_config_file_count = $fileCount
        candidate_name_match = $entry.candidate_name_match
      }
    }

    if (($depth + 1) -lt $MaxDepth) {
      $queue.Enqueue([ordered]@{ path = $dir.FullName; depth = ($depth + 1) })
    }
  }
}

$json = $result | ConvertTo-Json -Depth 10
$json | Set-Content -LiteralPath $OutputPath -Encoding UTF8
Write-Output $json

if ($result.candidate_roots.Count -eq 0) { exit 4 }
exit 0