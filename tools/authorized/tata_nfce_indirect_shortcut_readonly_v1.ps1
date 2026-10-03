param(
  [string]$AuthorizationId = "CESAR-2026-10-03-TATA-NFCE-INDIRECT-READONLY-V1",
  [string]$TeknisaRoot = "C:\TEKNISA"
)

$ErrorActionPreference = "Stop"

$ExpectedAuthorizationId = "CESAR-2026-10-03-TATA-NFCE-INDIRECT-READONLY-V1"
$RepoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$AuthorizationFile = Join-Path $RepoRoot "data\tata_nfce_indirect_readonly_authorization_v1.json"

function Hash([string]$Path) {
  return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToUpperInvariant()
}

function Sanitize([string]$Line) {
  if ($null -eq $Line) { return "" }
  $s = $Line
  if ($s -match '(?i)(senha|password|passwd|pwd|secret|token|csc|private[_ -]?key|chave[_ -]?privada|client[_ -]?secret|api[_ -]?key)\s*[:=]') {
    return "[REDACTED_SENSITIVE_ASSIGNMENT]"
  }
  if ($s -match '(?i)<\s*(senha|password|passwd|pwd|secret|token|csc|privatekey|chaveprivada|clientsecret|apikey)\b[^>]*>') {
    return "[REDACTED_SENSITIVE_XML]"
  }
  if ($s -match '(?i)"(senha|password|passwd|pwd|secret|token|csc|privateKey|chavePrivada|clientSecret|apiKey)"\s*:') {
    return "[REDACTED_SENSITIVE_JSON]"
  }
  if ($s -match '(?i)(https?|ftp)://[^/\s:@]+:[^@\s/]+@') {
    return "[REDACTED_URI_CREDENTIALS]"
  }
  if ($s -match '[A-Za-z0-9+/=]{96,}') {
    return "[REDACTED_LONG_SECRET_LIKE_VALUE]"
  }
  return $s
}

function Context {
  param([string[]]$Lines,[int]$LineNumber,[int]$Radius=2)
  $ctx=@()
  $lo=[Math]::Max(1,$LineNumber-$Radius)
  $hi=[Math]::Min($Lines.Count,$LineNumber+$Radius)
  for($j=$lo;$j -le $hi;$j++){
    $ctx += [ordered]@{ line=$j; text=Sanitize ([string]$Lines[$j-1]) }
  }
  return @($ctx)
}

function Is-CommentLike([string]$Line) {
  $t=$Line.TrimStart()
  return ($t -match '^(//|#|/\*|\*|<!--|;)')
}

if ($AuthorizationId -ne $ExpectedAuthorizationId) { throw "AUTHORIZATION_ID_MISMATCH" }
if (-not (Test-Path -LiteralPath $AuthorizationFile -PathType Leaf)) { throw "INDIRECT_AUTHORIZATION_FILE_MISSING" }

$auth=Get-Content -LiteralPath $AuthorizationFile -Raw -Encoding UTF8 | ConvertFrom-Json
if (-not [bool]$auth.human_authorized) { throw "INDIRECT_HUMAN_AUTHORIZATION_FALSE" }
if ($auth.authorization_id -ne $ExpectedAuthorizationId) { throw "INDIRECT_AUTHORIZATION_ID_FILE_MISMATCH" }
if ((Hash $PSCommandPath) -ne [string]$auth.discovery_script_sha256) { throw "INDIRECT_SCRIPT_HASH_MISMATCH" }

$odhenPos=Join-Path $TeknisaRoot "odhenPOS"
$odhenPerif=Join-Path $TeknisaRoot "odhen-perifericos"
$roots=@($odhenPos,$odhenPerif)
$textExtensions=@(
  ".js",".ts",".jsx",".tsx",".php",".json",".html",".htm",".xml",".txt",".css",".map",
  ".ini",".conf",".cfg",".properties",".yaml",".yml",".vue",".java",".cs"
)
$binaryExtensions=@(".exe",".dll",".asar",".pak")
$packageExtensions=@(".jar",".zip",".phar",".asar",".pak")
$keyboardRegex='(?i)(\bF(?:[1-9]|1[0-2])\b|VK_F7|Keys\.F7|Key\.F7|0x76\b|keyCode|KeyboardEvent|keydown|keyup|keypress|hotkey|shortcut|accelerator|atalho|tecla|function.?key|keymap|onkey)'
$fiscalRegex='(?i)(NFCe|NFC-e|DANFE|nota\s+fiscal|fiscal|QRCode|QR\s*Code|certificado|conting|transmiss|emiss[aã]o|impress|Delivery|Payment|pagamento)'
$highFiscalRegex='(?i)(NFCe|NFC-e|DANFE|SEFAZ|QRCode|QR\s*Code|nota\s+fiscal|certificado|conting|transmiss|emiss[aã]o|impress)'
$definitionRegex='(?i)\bfunction\s+(?<name>[A-Za-z_][A-Za-z0-9_]*)\s*\('
$commonSymbols=@("index","create","update","delete","execute","process","handle","render","request","response","service","controller","payment","delivery")

$result=[ordered]@{
  schema="deliveryos.tata-nfce-indirect-shortcut-readonly.v1"
  mode="READ_ONLY_INDIRECT_SHORTCUT_AND_FISCAL_SOURCE_DISCOVERY"
  captured_at=(Get-Date).ToString("o")
  status="STARTED"
  roots=@()
  top_level_inventory=@()
  text_files_scanned=0
  extension_counts=@()
  shortcut_findings=@()
  shortcut_file_count=0
  cross_signal_files=@()
  cross_signal_file_count=0
  ui_fiscal_findings=@()
  targeted_sources=@()
  target_file_count=0
  target_findings_count=0
  extracted_symbols=@()
  symbol_references=@()
  symbol_reference_count=0
  binary_candidates_scanned=0
  binary_string_findings=@()
  binary_keyboard_file_count=0
  binary_keyboard_and_fiscal_file_count=0
  binary_skipped_large=0
  binary_skipped_large_samples=@()
  package_candidate_count=0
  package_candidates=@()
  interpretation=[ordered]@{
    literal_or_indirect_keyboard_signal="UNKNOWN"
    keyboard_and_fiscal_same_file="UNKNOWN"
    targeted_fiscal_source_context="UNKNOWN"
    compiled_binary_keyboard_signal="UNKNOWN"
  }
  effects=[ordered]@{
    order_read=$false
    database_query=$false
    database_write=$false
    odhen_write=$false
    config_write=$false
    process_start=$false
    service_change=$false
    printer_change=$false
    print=$false
    http=$false
    sefaz_call=$false
    fiscal_action=$false
    danfe_print=$false
    cutover=$false
  }
  error=$null
}

try {
  foreach($root in $roots){
    if(Test-Path -LiteralPath $root -PathType Container){
      $result.roots += $root
      $dirs=Get-ChildItem -LiteralPath $root -Directory -ErrorAction SilentlyContinue | Sort-Object Name
      foreach($d in $dirs){
        if($result.top_level_inventory.Count -lt 120){
          $result.top_level_inventory += [ordered]@{ root=$root; name=$d.Name; path=$d.FullName }
        }
      }
    }
  }
  if($result.roots.Count -lt 1){ throw "NO_TEKINSA_SOURCE_ROOT_FOUND" }

  $allFiles=@()
  foreach($root in $result.roots){
    $allFiles += Get-ChildItem -LiteralPath $root -Recurse -File -ErrorAction SilentlyContinue |
      Where-Object {
        $_.FullName -notmatch '\\(Log|Logs|Temp|cache|node_modules|vendor)(\\|$)'
      }
  }
  $allFiles=@($allFiles | Sort-Object FullName -Unique)
  if($allFiles.Count -lt 1){ throw "NO_FILES_ENUMERATED" }

  $textFiles=@($allFiles | Where-Object { $textExtensions -contains $_.Extension.ToLowerInvariant() })
  $result.text_files_scanned=$textFiles.Count
  if($textFiles.Count -lt 1){ throw "NO_TEXT_FILES_SCANNED" }

  $extCounts=$textFiles | Group-Object { $_.Extension.ToLowerInvariant() } | Sort-Object Count -Descending
  foreach($g in $extCounts){
    $result.extension_counts += [ordered]@{ extension=[string]$g.Name; count=[int]$g.Count }
  }

  $shortcutFiles=New-Object System.Collections.Generic.HashSet[string]
  foreach($file in $textFiles){
    $lines=Get-Content -LiteralPath $file.FullName -ErrorAction SilentlyContinue
    if($null -eq $lines){ continue }

    $keyboardLines=@()
    $fiscalLines=@()
    for($i=0;$i -lt $lines.Count;$i++){
      $line=[string]$lines[$i]
      if((-not (Is-CommentLike $line)) -and $line -match $keyboardRegex){
        $keyboardLines += ($i+1)
        [void]$shortcutFiles.Add($file.FullName)
        if($result.shortcut_findings.Count -lt 120){
          $result.shortcut_findings += [ordered]@{
            path=$file.FullName
            matched_line=($i+1)
            context=(Context -Lines $lines -LineNumber ($i+1) -Radius 2)
          }
        }
      }
      if($line -match $fiscalRegex){
        $fiscalLines += ($i+1)
        if($result.ui_fiscal_findings.Count -lt 100 -and $file.FullName -match '(?i)(mobile|front|public|view|template|html|js|ts|vue|jsx|tsx)'){
          $result.ui_fiscal_findings += [ordered]@{
            path=$file.FullName
            matched_line=($i+1)
            context=(Context -Lines $lines -LineNumber ($i+1) -Radius 2)
          }
        }
      }
    }

    if($keyboardLines.Count -gt 0 -and $fiscalLines.Count -gt 0 -and $result.cross_signal_files.Count -lt 50){
      $result.cross_signal_files += [ordered]@{
        path=$file.FullName
        sha256=Hash $file.FullName
        keyboard_lines=@($keyboardLines | Select-Object -First 12)
        fiscal_lines=@($fiscalLines | Select-Object -First 12)
      }
    }
  }
  $result.shortcut_file_count=$shortcutFiles.Count
  $result.cross_signal_file_count=$result.cross_signal_files.Count

  $backend=Join-Path $odhenPos "backend_74000"
  $targets=@(
    (Join-Path $backend "environment.xml"),
    (Join-Path $backend "services.xml"),
    (Join-Path $backend "routes.json"),
    (Join-Path $backend "src\Controller\Delivery.php"),
    (Join-Path $backend "src\Controller\Payment.php"),
    (Join-Path $backend "src\Controller\FiscalFunctions.php"),
    (Join-Path $backend "src\Service\FiscalFunctions.php"),
    (Join-Path $backend "src\Service\GeneralFunctions.php"),
    (Join-Path $backend "src\Service\Operator.php")
  )

  $symbols=New-Object System.Collections.Generic.HashSet[string]
  foreach($path in $targets){
    $entry=[ordered]@{ path=$path; exists=$false; sha256=$null; findings=@() }
    if(Test-Path -LiteralPath $path -PathType Leaf){
      $entry.exists=$true
      $entry.sha256=Hash $path
      $result.target_file_count++
      $lines=Get-Content -LiteralPath $path -ErrorAction SilentlyContinue
      if($null -ne $lines){
        $perFile=0
        for($i=0;$i -lt $lines.Count;$i++){
          $line=[string]$lines[$i]
          if($line -match $highFiscalRegex){
            if($perFile -lt 14 -and $result.target_findings_count -lt 110){
              $lineNumber=$i+1
              $entry.findings += [ordered]@{
                matched_line=$lineNumber
                context=(Context -Lines $lines -LineNumber $lineNumber -Radius 3)
              }
              $result.target_findings_count++
              $perFile++

              $lo=[Math]::Max(0,$i-18)
              for($j=$i;$j -ge $lo;$j--){
                $m=[regex]::Match([string]$lines[$j],$definitionRegex)
                if($m.Success){
                  $name=[string]$m.Groups["name"].Value
                  if($name.Length -ge 5 -and $commonSymbols -notcontains $name.ToLowerInvariant()){
                    [void]$symbols.Add($name)
                  }
                  break
                }
              }
            }
          }
        }
      }
    }
    $result.targeted_sources += $entry
  }
  if($result.target_file_count -lt 9){ throw "TARGET_FILE_SET_INCOMPLETE" }
  if($result.target_findings_count -lt 1){ throw "NO_TARGETED_FISCAL_FINDINGS" }

  $result.extracted_symbols=@($symbols | Sort-Object | Select-Object -First 35)

  if($result.extracted_symbols.Count -gt 0){
    foreach($file in $textFiles){
      if($result.symbol_references.Count -ge 90){ break }
      $lines=Get-Content -LiteralPath $file.FullName -ErrorAction SilentlyContinue
      if($null -eq $lines){ continue }
      for($i=0;$i -lt $lines.Count;$i++){
        if($result.symbol_references.Count -ge 90){ break }
        $line=[string]$lines[$i]
        if(Is-CommentLike $line){ continue }
        foreach($sym in $result.extracted_symbols){
          if($line.IndexOf([string]$sym,[System.StringComparison]::OrdinalIgnoreCase) -ge 0){
            $result.symbol_references += [ordered]@{
              symbol=[string]$sym
              path=$file.FullName
              matched_line=($i+1)
              context=(Context -Lines $lines -LineNumber ($i+1) -Radius 2)
            }
            break
          }
        }
      }
    }
  }
  $result.symbol_reference_count=$result.symbol_references.Count

  $packageCandidates=@(
    $allFiles |
      Where-Object {
        ($packageExtensions -contains $_.Extension.ToLowerInvariant()) -and
        $_.FullName -match '(?i)(odhen|teknisa|pos|delivery|interface|perifer|fiscal|payment)'
      } |
      Sort-Object Length
  )
  $result.package_candidate_count=$packageCandidates.Count
  foreach($file in @($packageCandidates | Select-Object -First 30)){
    $result.package_candidates += [ordered]@{
      path=$file.FullName
      extension=$file.Extension.ToLowerInvariant()
      size_bytes=[int64]$file.Length
    }
  }

  $largeBinaryCandidates=@(
    $allFiles |
      Where-Object {
        ($binaryExtensions -contains $_.Extension.ToLowerInvariant()) -and
        $_.Length -gt 12582912 -and
        $_.FullName -match '(?i)(odhen|teknisa|pos|delivery|interface|perifer|fiscal|payment)'
      } |
      Sort-Object Length
  )
  $result.binary_skipped_large=$largeBinaryCandidates.Count
  foreach($file in @($largeBinaryCandidates | Select-Object -First 20)){
    $result.binary_skipped_large_samples += [ordered]@{
      path=$file.FullName
      extension=$file.Extension.ToLowerInvariant()
      size_bytes=[int64]$file.Length
    }
  }

  $binaryCandidates=@(
    $allFiles |
      Where-Object {
        ($binaryExtensions -contains $_.Extension.ToLowerInvariant()) -and
        $_.Length -le 12582912 -and
        $_.FullName -match '(?i)(odhen|teknisa|pos|delivery|interface|perifer|fiscal|payment)'
      } |
      Sort-Object Length
  )
  if($binaryCandidates.Count -gt 40){
    $binaryCandidates=@($binaryCandidates | Select-Object -First 40)
  }

  $binaryKeyboardTerms=@("VK_F7","Keys.F7","Key.F7","keyCode","KeyboardEvent","keydown","keyup","keypress","shortcut","hotkey")
  $binaryFiscalTerms=@("NFCe","NFC-e","DANFE","SEFAZ","fiscal")
  foreach($file in $binaryCandidates){
    try{
      $bytes=[IO.File]::ReadAllBytes($file.FullName)
      $ascii=[Text.Encoding]::ASCII.GetString($bytes)
      $unicode=[Text.Encoding]::Unicode.GetString($bytes)
      $keyboardHits=@()
      $fiscalHits=@()
      foreach($term in $binaryKeyboardTerms){
        if($ascii.IndexOf($term,[System.StringComparison]::OrdinalIgnoreCase) -ge 0 -or
           $unicode.IndexOf($term,[System.StringComparison]::OrdinalIgnoreCase) -ge 0){
          $keyboardHits += $term
        }
      }
      foreach($term in $binaryFiscalTerms){
        if($ascii.IndexOf($term,[System.StringComparison]::OrdinalIgnoreCase) -ge 0 -or
           $unicode.IndexOf($term,[System.StringComparison]::OrdinalIgnoreCase) -ge 0){
          $fiscalHits += $term
        }
      }
      $result.binary_candidates_scanned++
      if($keyboardHits.Count -gt 0){ $result.binary_keyboard_file_count++ }
      if($keyboardHits.Count -gt 0 -and $fiscalHits.Count -gt 0){ $result.binary_keyboard_and_fiscal_file_count++ }
      if(($keyboardHits.Count -gt 0 -or $fiscalHits.Count -gt 0) -and $result.binary_string_findings.Count -lt 60){
        $result.binary_string_findings += [ordered]@{
          path=$file.FullName
          size_bytes=[int64]$file.Length
          sha256=Hash $file.FullName
          keyboard_terms=@($keyboardHits | Sort-Object -Unique)
          fiscal_terms=@($fiscalHits | Sort-Object -Unique)
        }
      }
    } catch {}
  }

  $result.interpretation.literal_or_indirect_keyboard_signal = if($result.shortcut_file_count -gt 0){"FOUND"}else{"NOT_FOUND"}
  $result.interpretation.keyboard_and_fiscal_same_file = if($result.cross_signal_file_count -gt 0){"FOUND"}else{"NOT_FOUND"}
  $result.interpretation.targeted_fiscal_source_context = if($result.target_findings_count -gt 0){"FOUND"}else{"NOT_FOUND"}
  $result.interpretation.compiled_binary_keyboard_signal = if($result.binary_keyboard_file_count -gt 0){"FOUND"}else{"NOT_FOUND"}

  $result.status="PROVEN_INDIRECT_SHORTCUT_AND_FISCAL_SOURCE_DISCOVERY"
}
catch {
  $result.status="INDIRECT_SHORTCUT_DISCOVERY_FAILED"
  $result.error=[string]$_.Exception.Message
}

$result | ConvertTo-Json -Depth 14
if($result.status -eq "PROVEN_INDIRECT_SHORTCUT_AND_FISCAL_SOURCE_DISCOVERY"){ exit 0 }
exit 4
