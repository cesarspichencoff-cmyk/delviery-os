param(
  [string]$AuthorizationId = "CESAR-2026-10-03-TATA-NFCE-F7-TRACE-V1",
  [string]$TeknisaRoot = "C:\TEKNISA"
)

$ErrorActionPreference = "Stop"

$ExpectedAuthorizationId = "CESAR-2026-10-03-TATA-NFCE-F7-TRACE-V1"
$RepoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$AuthorizationFile = Join-Path $RepoRoot "data\tata_nfce_f7_trace_authorization_v1.json"

function Hash([string]$Path) {
  return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToUpperInvariant()
}

function Sanitize([string]$Text) {
  if ($null -eq $Text) { return "" }
  $s=[string]$Text
  if ($s.Length -gt 600) { $s=$s.Substring(0,600) + "[TRUNCATED]" }
  if ($s -match '(?i)(senha|password|passwd|pwd|secret|token|csc|private[_ -]?key|chave[_ -]?privada)\s*[:=]') {
    return "[REDACTED_SENSITIVE_ASSIGNMENT]"
  }
  if ($s -match '(?i)<\s*(senha|password|passwd|pwd|secret|token|csc|privatekey|chaveprivada)\b[^>]*>') {
    return "[REDACTED_SENSITIVE_XML]"
  }
  if ($s -match '(?i)"(senha|password|passwd|pwd|secret|token|csc|privateKey|chavePrivada)"\s*:') {
    return "[REDACTED_SENSITIVE_JSON]"
  }
  if ($s -match '[A-Za-z0-9+/=]{96,}') {
    return "[REDACTED_LONG_SECRET_LIKE_VALUE]"
  }
  return $s
}

if ($AuthorizationId -ne $ExpectedAuthorizationId) { throw "AUTHORIZATION_ID_MISMATCH" }
if (-not (Test-Path -LiteralPath $AuthorizationFile -PathType Leaf)) { throw "F7_TRACE_AUTHORIZATION_FILE_MISSING" }

$auth=Get-Content -LiteralPath $AuthorizationFile -Raw -Encoding UTF8 | ConvertFrom-Json
if (-not [bool]$auth.human_authorized) { throw "F7_TRACE_HUMAN_AUTHORIZATION_FALSE" }
if ($auth.authorization_id -ne $ExpectedAuthorizationId) { throw "F7_TRACE_AUTHORIZATION_ID_FILE_MISMATCH" }
if ((Hash $PSCommandPath) -ne [string]$auth.trace_script_sha256) { throw "F7_TRACE_SCRIPT_HASH_MISMATCH" }

$odhenPos=Join-Path $TeknisaRoot "odhenPOS"
$odhenPerif=Join-Path $TeknisaRoot "odhen-perifericos"
$roots=@(
  (Join-Path $odhenPos "mobile"),
  (Join-Path $odhenPos "backend_74000"),
  (Join-Path $odhenPerif "src"),
  (Join-Path $odhenPerif "routes")
)
$extensions=@(".js",".ts",".php",".json",".html",".htm",".xml",".txt")
$primaryRegex='(?i)(case\s+(?:118\b|["'']F7["''])|["'']?(?:keyCode|which)["'']?\s*(?:===?|==?|:)\s*118\b|["'']?(?:key|code)["'']?\s*(?:===?|==?|:)\s*["'']F7["'']|(?:keyCode|which)[^\r\n]{0,40}\b118\b|\b118\b[^\r\n]{0,40}(?:keyCode|which))'
$fiscalRegex='(?i)(NFCe|NFC-e|DANFE|fiscal|Fiscal|impress|Impress|Delivery|delivery|Payment|pagamento)'
$highSignalFiscalRegex='(?i)(NFCe|NFC-e|DANFE|SEFAZ|QRCode|QR\s*Code|fiscal|certificado|impress(?:ao|ão|ora|or)?)'
$targetPathRegex='(?i)(environment\.xml$|services\.xml$|routes\.json$|\\src\\Controller\\Delivery\.php$|\\src\\Controller\\Payment\.php$|\\src\\Controller\\FiscalFunctions\.php$|\\src\\Service\\FiscalFunctions\.php$|\\src\\Service\\GeneralFunctions\.php$|\\src\\Service\\Operator\.php$)'
$callRegex='(?<call>[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*){0,3})\s*\('
$stringRegex='["''](?<str>[^"'']{3,120})["'']'
$ignoredTerms=@("if","for","foreach","while","switch","function","return","isset","empty","array","count","log","console.log","preventdefault","stoppropagation","parseint","parsefloat","json.stringify","json.parse","math.max","math.min","addeventlistener","document.addeventlistener","getelementbyid","queryselector","settimeout","setinterval","then","catch","ajax")

$result=[ordered]@{
  schema="deliveryos.tata-nfce-f7-trace-readonly.v1"
  mode="READ_ONLY_F7_TO_FISCAL_TRACE_DISCOVERY"
  captured_at=(Get-Date).ToString("o")
  status="STARTED"
  roots=@()
  files_scanned=0
  primary_matches=@()
  primary_match_count=0
  candidate_files=@()
  handler_terms=@()
  related_matches=@()
  related_match_count=0
  targeted_fiscal_matches=@()
  targeted_fiscal_match_count=0
  chain_context_status="NOT_EVALUATED"
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
  $files=@()
  foreach($root in $roots){
    if(Test-Path -LiteralPath $root -PathType Container){
      $result.roots += $root
      $files += Get-ChildItem -LiteralPath $root -Recurse -File -ErrorAction SilentlyContinue |
        Where-Object {
          $extensions -contains $_.Extension.ToLowerInvariant() -and
          $_.FullName -notmatch "\\Log(\\|$)" -and
          $_.FullName -notmatch "\\Logs(\\|$)" -and
          $_.FullName -notmatch "\\Temp(\\|$)" -and
          $_.FullName -notmatch "\\cache(\\|$)" -and
          $_.FullName -notmatch "\\node_modules(\\|$)"
        }
    }
  }

  $files=@($files|Sort-Object FullName -Unique)
  $result.files_scanned=$files.Count

  foreach($file in $files){
    $lines=Get-Content -LiteralPath $file.FullName -ErrorAction SilentlyContinue
    if($null -eq $lines){ continue }

    $filePrimary=@()
    for($i=0;$i -lt $lines.Count;$i++){
      $line=[string]$lines[$i]
      $trimmed=$line.TrimStart()
      if($trimmed -match '^(//|#|/\*|\*|<!--)'){ continue }
      if($line -match $primaryRegex){
        $filePrimary += ($i+1)
      }
    }

    if($filePrimary.Count -gt 0){
      $candidate=[ordered]@{
        path=$file.FullName
        sha256=Hash $file.FullName
        primary_lines=@($filePrimary)
        fiscal_related_lines=@()
      }

      for($i=0;$i -lt $lines.Count;$i++){
        if(([string]$lines[$i]) -match $fiscalRegex){
          $candidate.fiscal_related_lines += ($i+1)
          if($candidate.fiscal_related_lines.Count -ge 80){ break }
        }
      }
      $result.candidate_files += $candidate

      foreach($lineNumber in $filePrimary){
        if($result.primary_matches.Count -ge 80){ break }
        $lo=[Math]::Max(1,$lineNumber-6)
        $hi=[Math]::Min($lines.Count,$lineNumber+6)
        $context=@()
        $rawContext=@()
        for($j=$lo;$j -le $hi;$j++){
          $rawLine=[string]$lines[$j-1]
          $rawContext += $rawLine
          $context += [ordered]@{
            line=$j
            text=Sanitize $rawLine
          }
        }
        foreach($rawLine in $rawContext){
          foreach($m in [regex]::Matches($rawLine,$callRegex)){
            $call=[string]$m.Groups["call"].Value
            $leaf=[string](($call -split "\.")[-1])
            foreach($term in @($call,$leaf)){
              $lower=$term.ToLowerInvariant()
              if($term.Length -ge 4 -and $ignoredTerms -notcontains $lower){
                $result.handler_terms += $term
              }
            }
          }
          foreach($m in [regex]::Matches($rawLine,$stringRegex)){
            $str=[string]$m.Groups["str"].Value
            if($str.StartsWith("/") -or $str -match '(?i)(nfce|danfe|fiscal|payment|delivery|print|impress|nota|cupom|api|route)'){
              $result.handler_terms += $str
            }
          }
        }
        $result.primary_matches += [ordered]@{
          path=$file.FullName
          matched_line=$lineNumber
          context=$context
        }
      }
    }
    if($result.primary_matches.Count -ge 80){ break }
  }

  $result.primary_match_count=$result.primary_matches.Count
  if($result.roots.Count -lt 1){ throw "NO_ODHEN_SOURCE_ROOT_FOUND" }
  if($result.files_scanned -lt 1){ throw "NO_SOURCE_FILES_SCANNED" }
  if($result.primary_match_count -lt 1){ throw "NO_F7_OR_KEY118_HANDLER_FOUND" }
  if($result.candidate_files.Count -lt 1){ throw "NO_F7_CANDIDATE_FILES_CAPTURED" }

  $result.handler_terms=@($result.handler_terms | Where-Object { $_ -and $_.Length -ge 4 } | Sort-Object -Unique | Select-Object -First 30)

  foreach($file in $files){
    if($result.related_matches.Count -ge 40 -and $result.targeted_fiscal_matches.Count -ge 45){ break }
    $lines=Get-Content -LiteralPath $file.FullName -ErrorAction SilentlyContinue
    if($null -eq $lines){ continue }
    $isTarget=($file.FullName -match $targetPathRegex)
    $targetFileMatches=0

    for($i=0;$i -lt $lines.Count;$i++){
      $line=[string]$lines[$i]

      if($isTarget -and $targetFileMatches -lt 5 -and $result.targeted_fiscal_matches.Count -lt 45 -and $line -match $highSignalFiscalRegex){
        $lo=[Math]::Max(1,($i+1)-2)
        $hi=[Math]::Min($lines.Count,($i+1)+2)
        $context=@()
        for($j=$lo;$j -le $hi;$j++){
          $context += [ordered]@{ line=$j; text=Sanitize ([string]$lines[$j-1]) }
        }
        $result.targeted_fiscal_matches += [ordered]@{
          path=$file.FullName
          matched_line=($i+1)
          context=$context
        }
        $targetFileMatches++
      }

      if($result.related_matches.Count -lt 40 -and $result.handler_terms.Count -gt 0){
        $trimmed=$line.TrimStart()
        if($trimmed -notmatch '^(//|#|/\*|\*|<!--)'){
          foreach($term in $result.handler_terms){
            if($line.IndexOf([string]$term,[System.StringComparison]::OrdinalIgnoreCase) -ge 0){
              $lo=[Math]::Max(1,($i+1)-3)
              $hi=[Math]::Min($lines.Count,($i+1)+3)
              $context=@()
              for($j=$lo;$j -le $hi;$j++){
                $context += [ordered]@{ line=$j; text=Sanitize ([string]$lines[$j-1]) }
              }
              $result.related_matches += [ordered]@{
                path=$file.FullName
                matched_line=($i+1)
                matched_term=[string]$term
                context=$context
              }
              break
            }
          }
        }
      }
    }
  }

  $result.related_match_count=$result.related_matches.Count
  $result.targeted_fiscal_match_count=$result.targeted_fiscal_matches.Count
  if($result.related_match_count -gt 0 -and $result.targeted_fiscal_match_count -gt 0){
    $result.chain_context_status="HANDLER_RELATED_AND_TARGETED_FISCAL_CONTEXT"
  } elseif($result.related_match_count -gt 0){
    $result.chain_context_status="HANDLER_RELATED_CONTEXT_ONLY"
  } elseif($result.targeted_fiscal_match_count -gt 0){
    $result.chain_context_status="HANDLER_PLUS_TARGETED_FISCAL_CONTEXT"
  } else {
    $result.chain_context_status="HANDLER_ONLY"
  }

  $result.status="PROVEN_F7_HANDLER_DISCOVERY"
}
catch {
  $result.status="F7_TRACE_DISCOVERY_FAILED"
  $result.error=[string]$_.Exception.Message
}

$result|ConvertTo-Json -Depth 12
if($result.status -eq "PROVEN_F7_HANDLER_DISCOVERY"){ exit 0 }
exit 4
