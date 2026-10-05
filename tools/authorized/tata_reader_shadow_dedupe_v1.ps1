$ErrorActionPreference = "Stop"

$ExpectedIdentity = "NT SERVICE\TataComandaReader"
$InputPath = Join-Path $PSScriptRoot "shadow_route_input_v1.json"
$ExpectedInputSha256 = "956110A442164E380A7097CF3078B8C855C79EE79C8AEED97CB22099C86F6AC6"
$StatePath = "C:\ProgramData\TataComandaReader\evidence\shadow-dedupe-proof-state-v1.json"

$result = [ordered]@{
  schema = "deliveryos.tata-reader-shadow-dedupe-proof.v1"
  mode = "REPLAY_DEDUPE_PROOF_NO_PRINT"
  captured_at = (Get-Date).ToString("o")
  status = "STARTED"
  service_identity = $null
  input_sha256 = $null
  order_id = $null
  dedupe_key = $null
  previous_dedupe_key = $null
  state_existed_before = $false
  same_as_previous = $false
  effects = [ordered]@{
    local_input_read = $false
    dedupe_state_read = $false
    dedupe_state_write = $false
    database_read = $false
    database_write = $false
    permission_change = $false
    odhen_write = $false
    network_call = $false
    print = $false
    spooler_write = $false
    fiscal_action = $false
    sefaz_call = $false
    cutover = $false
  }
  error = $null
}

function Hash-File([string]$Path) {
  return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToUpperInvariant()
}

function Hash-Text([string]$Text) {
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try {
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($Text)
    return ([System.BitConverter]::ToString($sha.ComputeHash($bytes))).Replace("-","")
  }
  finally {
    $sha.Dispose()
  }
}

try {
  $identity = [System.Security.Principal.WindowsIdentity]::GetCurrent()
  $result.service_identity = if ($null -eq $identity) { $null } else { [string]$identity.Name }
  if (-not [string]::Equals($result.service_identity,$ExpectedIdentity,[System.StringComparison]::OrdinalIgnoreCase)) {
    throw ("UNEXPECTED_SERVICE_IDENTITY:" + $result.service_identity)
  }

  if (-not (Test-Path -LiteralPath $InputPath -PathType Leaf)) { throw "SHADOW_INPUT_MISSING" }
  $result.input_sha256 = Hash-File $InputPath
  if ($result.input_sha256 -ne $ExpectedInputSha256) { throw ("SHADOW_INPUT_HASH_MISMATCH:" + $result.input_sha256) }

  $input = Get-Content -LiteralPath $InputPath -Raw -Encoding UTF8 | ConvertFrom-Json
  $result.effects.local_input_read = $true

  if ($input.schema -ne "deliveryos.tata-reader-shadow-route-success.v1") { throw "SHADOW_INPUT_SCHEMA_MISMATCH" }
  if ($input.status -ne "PROVEN_REAL_ORDER_SHADOW_ROUTE") { throw "SHADOW_INPUT_STATUS_MISMATCH" }
  if (-not [bool]$input.ready) { throw "SHADOW_INPUT_NOT_READY" }
  if (@($input.blockers).Count -ne 0) { throw "SHADOW_INPUT_HAS_BLOCKERS" }
  if ([bool]$input.effects.print) { throw "SHADOW_INPUT_PRINT_EFFECT_TRUE" }
  if ([bool]$input.effects.database_write) { throw "SHADOW_INPUT_DATABASE_WRITE_TRUE" }

  $items = @(
    $input.items |
      Sort-Object { [string]$_.NRPRODCOMVEN } |
      ForEach-Object {
        [ordered]@{
          NRPRODCOMVEN = [string]$_.NRPRODCOMVEN
          CDPRODUTO = [string]$_.CDPRODUTO
          CDARVPROD = [string]$_.CDARVPROD
          retail_product_code = [string]$_.retail_product_code
          QTPRODCOMVEN = [string]$_.QTPRODCOMVEN
          IDSTPRCOMVEN = [string]$_.IDSTPRCOMVEN
          targets = @(
            $_.targets | ForEach-Object {
              [ordered]@{
                printer_code = [string]$_.printer_code
                printer_name = [string]$_.printer_name
                printer_ip = [string]$_.printer_ip
              }
            }
          )
        }
      }
  )

  $basis = [ordered]@{
    CDFILIAL = [string]$input.order.CDFILIAL
    CDLOJA = [string]$input.order.CDLOJA
    NRVENDAREST = [string]$input.order.NRVENDAREST
    NRCOMANDA = [string]$input.order.NRCOMANDA
    NRCOMANDAEXT = [string]$input.order.NRCOMANDAEXT
    IDORGCMDVENDA = [string]$input.order.IDORGCMDVENDA
    IDSTCOMANDA = [string]$input.order.IDSTCOMANDA
    items = $items
  }

  $basisJson = $basis | ConvertTo-Json -Depth 12 -Compress
  $result.order_id = [string]$basis.NRCOMANDA
  $result.dedupe_key = Hash-Text $basisJson

  if (Test-Path -LiteralPath $StatePath -PathType Leaf) {
    $result.state_existed_before = $true
    $state = Get-Content -LiteralPath $StatePath -Raw -Encoding UTF8 | ConvertFrom-Json
    $result.effects.dedupe_state_read = $true
    $result.previous_dedupe_key = [string]$state.last_dedupe_key

    if ([string]::Equals($result.previous_dedupe_key,$result.dedupe_key,[System.StringComparison]::OrdinalIgnoreCase)) {
      $result.same_as_previous = $true
      $result.status = "DUPLICATE_SHADOW_ORDER_NO_ACTION"
      $result | ConvertTo-Json -Depth 8
      exit 0
    }
  }

  $stateOut = [ordered]@{
    schema = "deliveryos.tata-reader-shadow-dedupe-state.v1"
    last_dedupe_key = $result.dedupe_key
    last_order_id = $result.order_id
    recorded_at = (Get-Date).ToString("o")
  }

  $tmp = $StatePath + ".tmp." + [string]$PID
  [System.IO.File]::WriteAllText(
    $tmp,
    ($stateOut | ConvertTo-Json -Depth 4),
    (New-Object System.Text.UTF8Encoding($false))
  )
  Move-Item -LiteralPath $tmp -Destination $StatePath -Force
  $result.effects.dedupe_state_write = $true
  $result.status = "NEW_SHADOW_ORDER_RECORDED"
  $result | ConvertTo-Json -Depth 8
  exit 0
}
catch {
  $result.status = "DEDUPE_PROOF_FAILED"
  $result.error = [string]$_.Exception.Message
  $result | ConvertTo-Json -Depth 8
  exit 6
}
