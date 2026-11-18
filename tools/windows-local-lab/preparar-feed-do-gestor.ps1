<#
.SYNOPSIS
  Preparacao controlada do executor do Gestor no CAIXA_MOOCA: copia tres arquivos
  conferidos e registra UMA tarefa agendada DESATIVADA. Nao inicia nada.

.DESCRIPTION
  O que faz (-Mode Stage):
    1. baixa os tres arquivos do executor e o XML da tarefa do repositorio publico,
       no commit fixado abaixo, e confere cada um pelo identificador de blob do Git
       (sha1 de "blob <tamanho>\0<bytes>"); arquivo que nao bate nao e gravado;
    2. grava os tres arquivos em C:\ProgramData\DeliveryOS-Itaim-Observer\ — nunca
       por cima de um arquivo diferente que ja exista;
    3. registra a tarefa \DeliveryOS-Itaim-Gestor-Demand-Feed a partir do XML e
       confere que ela ficou DESATIVADA e nunca rodou;
    4. escreve um recibo com hashes, horario e estado.
  O que NAO faz: nao habilita nem dispara a tarefa, nao inicia processo, nao toca
  no Edge, no Gestor, no Reader, em pedido, em impressao, em rede ou em firewall.

  -Mode Verify   so le: confere arquivos, tarefa e recibo.
  -Mode Rollback remove a tarefa (so se estiver desativada) e os tres arquivos (so
                 se ainda forem os que este script gravou). A pasta de saida do
                 executor (gestor-demand-v1) nao existe antes de habilitar.

  Fora do CAIXA_MOOCA o script recusa, a nao ser com -LabRoot <pasta>: ai so
  ensaia a copia conferida nessa pasta, sem tarefa.

  Habilitar a tarefa e outro ato, com autorizacao propria.
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][ValidateSet('Stage', 'Verify', 'Rollback')][string]$Mode,
  [string]$LabRoot
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$Commit = '0103ad23ac9e2a67b526b387a9735a694fbac2c3'
$Repo = 'cesarspichencoff-cmyk/delviery-os'
$TaskName = 'DeliveryOS-Itaim-Gestor-Demand-Feed'
$Files = @(
  @{ Path = 'runtime/reporting/gestor_mounted_demand_feed_v1.cjs'; Blob = 'cecf0b8352f82cb637dcf69c8637ef7476e519f7' },
  @{ Path = 'runtime/reporting/gestor_mounted_window_differential_v1.cjs'; Blob = '75e5275513d53ccc35d0b29fcb9873075fdc8464' },
  @{ Path = 'runtime/reporting/gestor_v3_visible_sensor.js'; Blob = '106e9a77e7e34ebb5f0f5fff9f54069110fdcb87' }
)
$TaskXml = @{ Path = 'docs/operations/DeliveryOS-Itaim-Gestor-Demand-Feed.xml'; Blob = '862ebb45656c834b33f67bcd1ed89b95991e08ac' }

$lab = -not [string]::IsNullOrEmpty($LabRoot)
if ($lab) {
  if ($env:COMPUTERNAME -eq 'CAIXA_MOOCA') { throw 'LabRoot nao e aceito no CAIXA_MOOCA.' }
  if (-not [System.IO.Path]::IsPathRooted($LabRoot)) { throw 'LabRoot precisa ser caminho absoluto.' }
  $Root = $LabRoot
} else {
  if ($env:COMPUTERNAME -ne 'CAIXA_MOOCA') { throw "Este script so prepara o CAIXA_MOOCA. Maquina atual: $($env:COMPUTERNAME)." }
  $Root = 'C:\ProgramData\DeliveryOS-Itaim-Observer'
}
$Receipt = Join-Path $Root 'gestor-demand-feed-stage-receipt.json'

function Get-GitBlobId([byte[]]$Bytes) {
  $header = [System.Text.Encoding]::ASCII.GetBytes("blob $($Bytes.Length)`0")
  $sha = [System.Security.Cryptography.SHA1]::Create()
  try {
    [void]$sha.TransformBlock($header, 0, $header.Length, $null, 0)
    [void]$sha.TransformFinalBlock($Bytes, 0, $Bytes.Length)
    return -join ($sha.Hash | ForEach-Object { $_.ToString('x2') })
  } finally { $sha.Dispose() }
}
function Get-Sha256([byte[]]$Bytes) {
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try { return -join ($sha.ComputeHash($Bytes) | ForEach-Object { $_.ToString('x2') }) } finally { $sha.Dispose() }
}
function Get-Pinned($Item) {
  $url = "https://raw.githubusercontent.com/$Repo/$Commit/$($Item.Path)"
  $client = New-Object System.Net.WebClient
  try { $bytes = $client.DownloadData($url) } finally { $client.Dispose() }
  $blob = Get-GitBlobId $bytes
  if ($blob -ne $Item.Blob) { throw "Conteudo nao confere para $($Item.Path): blob $blob, esperado $($Item.Blob). Nada foi gravado deste arquivo." }
  return $bytes
}
function Get-TaskState {
  if ($lab) { return $null }
  $t = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  if (-not $t) { return @{ present = $false } }
  $i = $t | Get-ScheduledTaskInfo
  return @{ present = $true; state = [string]$t.State; enabled = [bool]$t.Settings.Enabled; lastRunTime = [string]$i.LastRunTime; lastTaskResult = $i.LastTaskResult }
}
function Get-FileStates {
  return @($Files | ForEach-Object {
      $dest = Join-Path $Root ([System.IO.Path]::GetFileName($_.Path))
      if (Test-Path -LiteralPath $dest) {
        $bytes = [System.IO.File]::ReadAllBytes($dest)
        @{ file = [System.IO.Path]::GetFileName($_.Path); present = $true; blob = (Get-GitBlobId $bytes); matches = ((Get-GitBlobId $bytes) -eq $_.Blob); sha256 = (Get-Sha256 $bytes); bytes = $bytes.Length }
      } else { @{ file = [System.IO.Path]::GetFileName($_.Path); present = $false; matches = $false } }
    })
}

if ($Mode -eq 'Verify') {
  $out = @{ mode = 'Verify'; machine = $env:COMPUTERNAME; root = $Root; commit = $Commit; files = (Get-FileStates); task = (Get-TaskState); receiptPresent = (Test-Path -LiteralPath $Receipt) }
  $out | ConvertTo-Json -Depth 6
  return
}

if ($Mode -eq 'Rollback') {
  $task = Get-TaskState
  if ($task -and $task.present) {
    if ($task.enabled) { throw 'A tarefa esta HABILITADA. Este script nao desfaz uma tarefa em uso: desabilite e encerre por decisao propria antes.' }
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
  }
  $removed = @()
  foreach ($f in $Files) {
    $dest = Join-Path $Root ([System.IO.Path]::GetFileName($f.Path))
    if (Test-Path -LiteralPath $dest) {
      if ((Get-GitBlobId ([System.IO.File]::ReadAllBytes($dest))) -ne $f.Blob) { throw "$dest nao e o arquivo que este script grava. Nao foi removido." }
      Remove-Item -LiteralPath $dest -Force
      $removed += [System.IO.Path]::GetFileName($f.Path)
    }
  }
  if (Test-Path -LiteralPath $Receipt) { Remove-Item -LiteralPath $Receipt -Force }
  @{ mode = 'Rollback'; machine = $env:COMPUTERNAME; removed = $removed; task = (Get-TaskState) } | ConvertTo-Json -Depth 6
  return
}

# ---- Stage ----
[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12
if (-not (Test-Path -LiteralPath $Root)) {
  if (-not $lab) { throw "$Root nao existe. Este script nao cria a pasta do observador." }
  New-Item -ItemType Directory -Path $Root | Out-Null
}
# Tudo e baixado e conferido ANTES de qualquer gravacao.
$payload = @($Files | ForEach-Object { @{ Item = $_; Bytes = (Get-Pinned $_) } })
$xmlBytes = Get-Pinned $TaskXml
foreach ($p in $payload) {
  $dest = Join-Path $Root ([System.IO.Path]::GetFileName($p.Item.Path))
  if (Test-Path -LiteralPath $dest) {
    if ((Get-GitBlobId ([System.IO.File]::ReadAllBytes($dest))) -ne $p.Item.Blob) { throw "$dest ja existe com outro conteudo. Nada foi sobrescrito." }
  }
}
foreach ($p in $payload) {
  $dest = Join-Path $Root ([System.IO.Path]::GetFileName($p.Item.Path))
  if (-not (Test-Path -LiteralPath $dest)) { [System.IO.File]::WriteAllBytes($dest, $p.Bytes) }
}
if (-not $lab) {
  $existing = Get-TaskState
  if ($existing.present -and $existing.enabled) { throw 'A tarefa ja existe e esta HABILITADA. Nada foi alterado nela.' }
  if (-not $existing.present) {
    $xml = [System.Text.Encoding]::UTF8.GetString($xmlBytes).TrimStart([char]0xFEFF)
    if ($xml -notmatch '<Settings>[\s\S]*<Enabled>false</Enabled>[\s\S]*</Settings>') { throw 'O XML da tarefa nao esta desativado. Tarefa nao registrada.' }
    # O Agendador recebe a tarefa como TEXTO em memoria (UTF-16) e recusa a declaracao
    # encoding="UTF-8" ("nao e possivel alternar codificacao", medido no caixa em 15/11).
    # A declaracao sai; o conteudo, conferido pelo blob acima, nao muda.
    $xml = $xml -replace '^\s*<\?xml[^>]*\?>\s*', ''
    Register-ScheduledTask -TaskName $TaskName -Xml $xml | Out-Null
  }
  $after = Get-TaskState
  if (-not $after.present -or $after.enabled) { throw 'A tarefa nao ficou registrada e desativada como esperado.' }
}
$result = @{
  schema = 'deliveryos.gestor-demand-feed-stage-receipt.v1'; mode = 'Stage'; machine = $env:COMPUTERNAME; lab = $lab
  stagedAtUtc = [DateTime]::UtcNow.ToString('o'); commit = $Commit; root = $Root
  files = (Get-FileStates); task = (Get-TaskState); processesStarted = 0; taskEnabled = $false
}
[System.IO.File]::WriteAllText($Receipt, ($result | ConvertTo-Json -Depth 6), (New-Object System.Text.UTF8Encoding($false)))
$result | ConvertTo-Json -Depth 6
