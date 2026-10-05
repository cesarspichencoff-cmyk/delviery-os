param(
  [Parameter(Mandatory=$true)]
  [string]$StatePath,

  [Parameter(Mandatory=$true)]
  [string]$StoreId,

  [Parameter(Mandatory=$true)]
  [ValidatePattern('^\d{4}-\d{2}-\d{2}$')]
  [string]$OperationalDate,

  [Parameter(Mandatory=$true)]
  [string]$TeknisaOrderId,

  [Parameter(Mandatory=$true)]
  [ValidatePattern('^[A-Fa-f0-9]{64}$')]
  [string]$ExpectedStateSha256,

  [switch]$Commit,

  [string]$AuthorizationId = ""
)

$ErrorActionPreference = "Stop"

function Get-Sha256([string]$Path) {
  return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToUpperInvariant()
}

function Clean([string]$Value) {
  return ([string]$Value).Trim()
}

function Assert-Policy($State) {
  if ($null -eq $State) { throw "STATE_NULL" }
  if ([string]$State.schema -ne "deliveryos.tata-sequence-state.v1") { throw "STATE_SCHEMA_MISMATCH" }
  if ([int]$State.policy.width -ne 3) { throw "STATE_WIDTH_MISMATCH" }
  if ([int]$State.policy.min_value -ne 1) { throw "STATE_MIN_MISMATCH" }
  if ([int]$State.policy.max_value -ne 999) { throw "STATE_MAX_MISMATCH" }
  if ($null -eq $State.bindings) { throw "STATE_BINDINGS_MISSING" }
}

function Assert-LocalDate([string]$DateText) {
  $parsed = [datetime]::MinValue
  $ok = [datetime]::TryParseExact(
    $DateText,
    "yyyy-MM-dd",
    [Globalization.CultureInfo]::InvariantCulture,
    [Globalization.DateTimeStyles]::None,
    [ref]$parsed
  )
  if (-not $ok) { throw "INVALID_OPERATIONAL_DATE" }
}

function Load-State([string]$Path) {
  return (Get-Content -LiteralPath $Path -Raw -Encoding UTF8 | ConvertFrom-Json)
}

function Write-AtomicJson([string]$Path, $Object) {
  $dir = [IO.Path]::GetDirectoryName($Path)
  if (-not (Test-Path -LiteralPath $dir -PathType Container)) { throw "STATE_DIR_MISSING" }

  $tmp = $Path + ".tmp." + $PID + "." + [Guid]::NewGuid().ToString("N")
  $bak = $Path + ".bak"
  $json = $Object | ConvertTo-Json -Depth 30
  $bytes = (New-Object Text.UTF8Encoding($false)).GetBytes($json)

  $fs = [IO.File]::Open(
    $tmp,
    [IO.FileMode]::CreateNew,
    [IO.FileAccess]::Write,
    [IO.FileShare]::None
  )
  try {
    $fs.Write($bytes,0,$bytes.Length)
    $fs.Flush($true)
  } finally {
    $fs.Dispose()
  }

  if (Test-Path -LiteralPath $Path -PathType Leaf) {
    if (Test-Path -LiteralPath $bak) { Remove-Item -LiteralPath $bak -Force }
    [IO.File]::Replace($tmp,$Path,$bak,$true)
    if (Test-Path -LiteralPath $bak) { Remove-Item -LiteralPath $bak -Force }
  } else {
    [IO.File]::Move($tmp,$Path)
  }
}

function Clone-State($State) {
  return ($State | ConvertTo-Json -Depth 30 | ConvertFrom-Json)
}

function Build-Plan($State,[string]$Scope,[string]$OrderId) {
  $blocking = New-Object Collections.Generic.List[string]
  $scopeBindings = @($State.bindings | Where-Object {
    (Clean ([string]$_.scope_id)) -eq $Scope
  })

  $bySequence = @{}
  $byOrder = @{}

  foreach ($binding in $scopeBindings) {
    $bScope = Clean ([string]$binding.scope_id)
    $bOrder = Clean ([string]$binding.teknisa_order_id)
    $bSeq = Clean ([string]$binding.tata_sequence)

    if (-not $bScope -or -not $bOrder -or -not $bSeq) {
      $blocking.Add("INVALID_EXISTING_SEQUENCE_BINDING")
      continue
    }
    if ($bSeq -notmatch '^\d{3}$') {
      $blocking.Add("INVALID_EXISTING_TATA_SEQUENCE_FORMAT:" + $bSeq)
      continue
    }
    $num = [int]$bSeq
    if ($num -lt 1 -or $num -gt 999) {
      $blocking.Add("INVALID_EXISTING_TATA_SEQUENCE_RANGE:" + $bSeq)
    }

    if ($bySequence.ContainsKey($bSeq) -and [string]$bySequence[$bSeq] -ne $bOrder) {
      $blocking.Add("EXISTING_TATA_SEQUENCE_COLLISION:" + $bSeq)
    } else {
      $bySequence[$bSeq] = $bOrder
    }

    if ($byOrder.ContainsKey($bOrder) -and [string]$byOrder[$bOrder] -ne $bSeq) {
      $blocking.Add("ORDER_BOUND_TO_MULTIPLE_TATA_SEQUENCES:" + $bOrder)
    } else {
      $byOrder[$bOrder] = $bSeq
    }
  }

  $existing = @($scopeBindings | Where-Object {
    (Clean ([string]$_.teknisa_order_id)) -eq $OrderId
  })

  if ($existing.Count -gt 1) {
    $unique = @($existing | ForEach-Object { Clean ([string]$_.tata_sequence) } | Select-Object -Unique)
    if ($unique.Count -gt 1) {
      $blocking.Add("ORDER_BOUND_TO_MULTIPLE_TATA_SEQUENCES:" + $OrderId)
    }
  }

  if ($blocking.Count -gt 0) {
    return [ordered]@{
      ready = $false
      reused_existing = $false
      assignment = $null
      next_state = $null
      blocking_reasons = @($blocking | Sort-Object -Unique)
    }
  }

  if ($existing.Count -ge 1) {
    return [ordered]@{
      ready = $true
      reused_existing = $true
      assignment = [ordered]@{
        scope_id = $Scope
        teknisa_order_id = $OrderId
        tata_sequence = Clean ([string]$existing[0].tata_sequence)
      }
      next_state = Clone-State $State
      blocking_reasons = @()
    }
  }

  $numbers = @($scopeBindings | ForEach-Object {
    $seq = Clean ([string]$_.tata_sequence)
    if ($seq -match '^\d{3}$') { [int]$seq }
  })

  $candidateValue = if ($numbers.Count -eq 0) { 1 } else { ([Linq.Enumerable]::Max([int[]]$numbers)) + 1 }
  if ($candidateValue -gt 999) {
    return [ordered]@{
      ready = $false
      reused_existing = $false
      assignment = $null
      next_state = $null
      blocking_reasons = @("TATA_SEQUENCE_OUT_OF_RANGE")
    }
  }

  $candidate = $candidateValue.ToString("D3")
  if ($bySequence.ContainsKey($candidate)) {
    return [ordered]@{
      ready = $false
      reused_existing = $false
      assignment = $null
      next_state = $null
      blocking_reasons = @("TATA_SEQUENCE_COLLISION")
    }
  }

  $assignment = [ordered]@{
    scope_id = $Scope
    teknisa_order_id = $OrderId
    tata_sequence = $candidate
  }

  $next = Clone-State $State
  $next.bindings = @($next.bindings) + @([pscustomobject]$assignment)
  $next.next_value = $candidateValue + 1

  return [ordered]@{
    ready = $true
    reused_existing = $false
    assignment = $assignment
    next_state = $next
    blocking_reasons = @()
  }
}

$result = [ordered]@{
  schema = "deliveryos.tata-sequence-atomic-bind-result.v1"
  mode = if ($Commit) { "COMMIT" } else { "DRY_RUN" }
  state_path = $StatePath
  store_id = Clean $StoreId
  operational_date = $OperationalDate
  teknisa_order_id = Clean $TeknisaOrderId
  expected_state_sha256 = $ExpectedStateSha256.ToUpperInvariant()
  state_sha256_before = $null
  state_sha256_after = $null
  scope_id = $null
  ready = $false
  reused_existing = $false
  assignment = $null
  blocking_reasons = @()
  write_performed = $false
  verification = $null
  effects = [ordered]@{
    local_state_read = $false
    local_state_write = $false
    production_binding_write = $false
    database_read = $false
    database_write = $false
    print = $false
    spooler_write = $false
    odhen_write = $false
    fiscal_action = $false
    sefaz_call = $false
  }
  status = "STARTED"
  error = $null
}

$lock = $null
try {
  Assert-LocalDate $OperationalDate

  if (-not (Test-Path -LiteralPath $StatePath -PathType Leaf)) { throw "STATE_FILE_MISSING" }
  if (-not $result.store_id) { throw "STORE_ID_REQUIRED" }
  if (-not $result.teknisa_order_id) { throw "TEKNISA_ORDER_ID_REQUIRED" }

  if ($Commit -and [string]::IsNullOrWhiteSpace($AuthorizationId)) {
    throw "COMMIT_AUTHORIZATION_ID_REQUIRED"
  }

  $lockPath = $StatePath + ".lock"
  $lock = [IO.File]::Open(
    $lockPath,
    [IO.FileMode]::OpenOrCreate,
    [IO.FileAccess]::ReadWrite,
    [IO.FileShare]::None
  )

  $beforeSha = Get-Sha256 $StatePath
  $result.state_sha256_before = $beforeSha
  $result.effects.local_state_read = $true

  if ($beforeSha -ne $ExpectedStateSha256.ToUpperInvariant()) {
    throw ("STATE_SHA256_CHANGED:" + $beforeSha)
  }

  $state = Load-State $StatePath
  Assert-Policy $state

  $scope = "STORE:" + $result.store_id + "|DATE:" + $OperationalDate
  $result.scope_id = $scope
  $plan = Build-Plan $state $scope $result.teknisa_order_id

  $result.ready = [bool]$plan.ready
  $result.reused_existing = [bool]$plan.reused_existing
  $result.assignment = $plan.assignment
  $result.blocking_reasons = @($plan.blocking_reasons)

  if (-not $plan.ready) {
    $result.status = "BLOCKED_NO_WRITE"
  } elseif (-not $Commit) {
    $result.status = if ($plan.reused_existing) { "DRY_RUN_REUSE_READY_NO_WRITE" } else { "DRY_RUN_NEW_BINDING_READY_NO_WRITE" }
  } elseif ($plan.reused_existing) {
    $result.status = "COMMIT_IDEMPOTENT_REUSE_NO_WRITE"
  } else {
    # Optimistic concurrency check immediately before durable replacement.
    $preWriteSha = Get-Sha256 $StatePath
    if ($preWriteSha -ne $beforeSha) { throw ("STATE_CHANGED_BEFORE_WRITE:" + $preWriteSha) }

    Write-AtomicJson $StatePath $plan.next_state
    $result.write_performed = $true
    $result.effects.local_state_write = $true
    $result.effects.production_binding_write = $true

    $readback = Load-State $StatePath
    Assert-Policy $readback
    $matched = @($readback.bindings | Where-Object {
      (Clean ([string]$_.scope_id)) -eq $scope -and
      (Clean ([string]$_.teknisa_order_id)) -eq $result.teknisa_order_id -and
      (Clean ([string]$_.tata_sequence)) -eq [string]$plan.assignment.tata_sequence
    })

    if ($matched.Count -ne 1) { throw "POST_WRITE_BINDING_VERIFICATION_FAILED" }

    $result.state_sha256_after = Get-Sha256 $StatePath
    $result.verification = [ordered]@{
      matched_binding_count = $matched.Count
      state_schema = [string]$readback.schema
      policy_width = [int]$readback.policy.width
      policy_min = [int]$readback.policy.min_value
      policy_max = [int]$readback.policy.max_value
    }
    $result.status = "COMMIT_NEW_BINDING_PROVEN"
  }

  if (-not $result.write_performed) {
    $result.state_sha256_after = Get-Sha256 $StatePath
    if ($result.state_sha256_after -ne $beforeSha) { throw "STATE_CHANGED_DURING_NO_WRITE_RUN" }
  }
}
catch {
  $result.error = [string]$_.Exception.Message
  $result.status = "FAILED"
}
finally {
  if ($null -ne $lock) { try { $lock.Dispose() } catch {} }
}

$result | ConvertTo-Json -Depth 30
if ($result.status -eq "FAILED") { exit 9 }
if ($result.status -eq "BLOCKED_NO_WRITE") { exit 7 }
exit 0
