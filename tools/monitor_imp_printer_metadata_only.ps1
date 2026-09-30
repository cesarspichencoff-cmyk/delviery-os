param(
  [string]$OdhenPerifericosRoot = "C:\TEKNISA\odhen-perifericos",
  [int]$PollMs = 1000
)

$ErrorActionPreference = "Stop"

# METADATA ONLY.
# Watches only filename, Length, LastWriteTimeUtc and CreationTimeUtc for today's
# per-printer IMP logs. It never opens file contents and never writes to Log\.

$logDir = Join-Path $OdhenPerifericosRoot ("Log\" + (Get-Date -Format "MMyyyy"))
$prefix = (Get-Date -Format "yyyy_MM_dd") + "_IMP_"

if (-not (Test-Path -LiteralPath $logDir -PathType Container)) {
  Write-Output ("SOURCE_MISSING " + $logDir)
  exit 2
}

$state = @{}

function Snapshot {
  param([string]$Dir, [string]$Prefix)
  $rows = Get-ChildItem -LiteralPath $Dir -File -Filter ($Prefix + "*.txt") -ErrorAction SilentlyContinue
  $out = @{}
  foreach ($row in $rows) {
    $out[$row.Name] = [pscustomobject]@{
      Length = [int64]$row.Length
      LastWriteTimeUtc = $row.LastWriteTimeUtc
      CreationTimeUtc = $row.CreationTimeUtc
    }
  }
  return $out
}

$state = Snapshot -Dir $logDir -Prefix $prefix
Write-Output ("INICIO " + (Get-Date -Format "HH:mm:ss.fff") + " FILES=" + $state.Count)

foreach ($name in ($state.Keys | Sort-Object)) {
  $v = $state[$name]
  Write-Output ("BASE " + $name + " LENGTH=" + $v.Length)
}

while ($true) {
  Start-Sleep -Milliseconds $PollMs
  $now = Snapshot -Dir $logDir -Prefix $prefix

  foreach ($name in ($now.Keys | Sort-Object)) {
    $v = $now[$name]
    if (-not $state.ContainsKey($name)) {
      Write-Output ("NOVO " + $name + " LENGTH=" + $v.Length + " " + (Get-Date -Format "HH:mm:ss.fff"))
      continue
    }

    $old = $state[$name]
    if ($v.CreationTimeUtc -ne $old.CreationTimeUtc) {
      Write-Output ("REPLACED " + $name + " " + (Get-Date -Format "HH:mm:ss.fff"))
    }
    elseif ($v.Length -ne $old.Length) {
      Write-Output ("MUDOU " + $name + " " + $old.Length + " -> " + $v.Length + " " + (Get-Date -Format "HH:mm:ss.fff"))
    }
  }

  foreach ($name in ($state.Keys | Sort-Object)) {
    if (-not $now.ContainsKey($name)) {
      Write-Output ("SUMIU " + $name + " " + (Get-Date -Format "HH:mm:ss.fff"))
    }
  }

  $state = $now
}
