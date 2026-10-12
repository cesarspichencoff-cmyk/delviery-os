# DeliveryOS V7.23: PASSIVE, READ-ONLY Windows service/source observation.
# Does not install, start, stop, restart, print, write files, access SQL,
# read order events/decisions/logs, or export source contents.
# JSON goes only to stdout for authorized LOCAL review.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$root = 'C:\ProgramData\TataComandaReader'
$artifacts = @(
    @{ label='watcher'; relative='bin\tata_reader_continuous_watch_candidate_v1.ps1' },
    @{ label='shadow_loop'; relative='shadow\live_shadow_consumer_loop_v1.cjs' },
    @{ label='installed_consumer_v2'; relative='shadow\live_shadow_consumer_v1.cjs' },
    @{ label='packaging_motor'; relative='shadow\packaging-current.js' },
    @{ label='academy_app_data'; relative='shadow\app-data.json' },
    @{ label='routing'; relative='shadow\routing.json' },
    @{ label='printer_map'; relative='shadow\printer-map.json' },
    @{ label='non_production'; relative='shadow\non-production.json' },
    @{ label='product_identity_cache'; relative='shadow\product-identity-cache-v1.json' },
    @{ label='product_aliases'; relative='shadow\product-aliases-v1.json' },
    @{ label='human_overrides'; relative='shadow\human-order-overrides-v1.json' }
)
function HexBytes([byte[]]$bytes) {
    return (-join ($bytes | ForEach-Object { $_.ToString('x2') }))
}
function ReadFingerprint([hashtable]$entry) {
    $name = $entry.label
    $file = Join-Path $root $entry.relative
    $out = [ordered]@{ label=$name; state='UNKNOWN'; bytes=$null; sha256=$null; git_blob_sha1=$null }
    try {
        if (-not [System.IO.File]::Exists($file)) {
            $out.state = 'MISSING'
            return $out
        }
        $before = Get-Item -LiteralPath $file -Force
        if (($before.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
            $out.state = 'REPARSE_POINT_REJECTED'
            return $out
        }
        if ($before.Length -gt 1048576) {
            $out.state = 'SIZE_LIMIT_EXCEEDED'
            return $out
        }
        $bytes = [System.IO.File]::ReadAllBytes($file)
        $after = Get-Item -LiteralPath $file -Force
        if ($before.Length -ne $after.Length -or
            $before.LastWriteTimeUtc.Ticks -ne $after.LastWriteTimeUtc.Ticks) {
            $out.state = 'CHANGED_DURING_READ'
            return $out
        }
        $sha = [System.Security.Cryptography.SHA256]::Create()
        $git = [System.Security.Cryptography.SHA1]::Create()
        try {
            $shaBytes = $sha.ComputeHash($bytes)
            $header = [System.Text.Encoding]::ASCII.GetBytes(('blob ' + $bytes.Length + [char]0))
            $joined = New-Object byte[] ($header.Length + $bytes.Length)
            [System.Array]::Copy($header, 0, $joined, 0, $header.Length)
            [System.Array]::Copy($bytes, 0, $joined, $header.Length, $bytes.Length)
            $blobBytes = $git.ComputeHash($joined)
            $out.state = 'HASHED_PASSIVELY'
            $out.bytes = $bytes.Length
            $out.sha256 = HexBytes $shaBytes
            $out.git_blob_sha1 = HexBytes $blobBytes
        } finally {
            $sha.Dispose()
            $git.Dispose()
        }
    } catch {
        $out.state = 'UNREADABLE'
    }
    return $out
}
$service = [ordered]@{
    found=$false; state='UNKNOWN'; start_mode='UNKNOWN';
    pid_present=$false; path_mentions_reader=$false
}
try {
    $s = Get-CimInstance -ClassName Win32_Service -Filter "Name='TataComandaReader'"
    if ($null -ne $s) {
        $service.found = $true
        $service.state = [string]$s.State
        $service.start_mode = [string]$s.StartMode
        $service.pid_present = ([int64]$s.ProcessId -gt 0)
        $service.path_mentions_reader = ([string]$s.PathName -match 'TataComandaReader')
    }
} catch {
    # Absence of permission/tooling remains UNKNOWN; never certify service.
}
$checks = @($artifacts | ForEach-Object { ReadFingerprint $_ })
$consumer = @($checks | Where-Object { $_.label -eq 'installed_consumer_v2' })[0]
$motor = @($checks | Where-Object { $_.label -eq 'packaging_motor' })[0]
$expectedConsumer = '22e3bdcbbed1cf245088f32679dd29ffb50766c9'
$expectedMotor = '1e4cf2475edb586d5dae88388d2adc7cf02013b00ec93c0371e3edb80f81342e'
$observations = [ordered]@{
    consumer_matches_last_audited_v2=(
        $consumer.state -eq 'HASHED_PASSIVELY' -and
        $consumer.git_blob_sha1 -eq $expectedConsumer
    )
    packaging_motor_matches_pinned=(
        $motor.state -eq 'HASHED_PASSIVELY' -and
        $motor.sha256 -eq $expectedMotor
    )
    windows_mandatory_v68_gate='UNKNOWN_NOT_PROVEN_BY_CHECKSUM'
    shift_current='UNKNOWN_NOT_INSPECTED'
    real_order_pair_coverage='UNKNOWN_NOT_INSPECTED'
    printer_acceptance='UNKNOWN_NOT_INSPECTED'
}
$result = [ordered]@{
    schema='deliveryos.windows-service-passive-observation.v723'
    scope='LOCAL_READ_ONLY_NO_ORDER_PAYLOAD'
    status='OBSERVATION_NOT_INSTALLATION_PROOF'
    observed_utc=[DateTime]::UtcNow.ToString('o')
    service=$service
    files=$checks
    observations=$observations
    effects=[ordered]@{
        service_start=$false;service_stop=$false;service_restart=$false
        file_write=$false;database_write=$false;printer=$false
        spooler_write=$false;sequence_write=$false;deploy=$false
    }
    authorizes_cutover=$false
}
$result | ConvertTo-Json -Depth 6 -Compress
