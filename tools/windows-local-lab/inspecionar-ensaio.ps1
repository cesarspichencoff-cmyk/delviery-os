<#
.SYNOPSIS
  Inspecao SOMENTE LEITURA do ensaio DeliveryOS no CAIXA_MOOCA (ou numa bancada).
  Nao para, nao inicia, nao grava (salvo o proprio JSON de saida, se -Saida for dado).

.DESCRIPTION
  Relata: contexto (usuario, administrador, ultimo boot), processos node.exe e
  postgres.exe (pid, pai, criacao e SO o script/arquivo executado - nunca ambiente nem
  argumentos com segredo), quem escuta em 8080, 5193 e 55436, o registro runtime-pids.json
  da pasta ativa contra os vivos, o estado do diretorio de dados do PostgreSQL do ensaio
  (postmaster.pid presente = desligamento sujo) e as tarefas agendadas DeliveryOS.
#>
[CmdletBinding()]
param(
  [string]$Ativa = 'C:\Users\Tata\DeliveryOS-Ensaio',
  [string]$Saida
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$id = [Security.Principal.WindowsIdentity]::GetCurrent()
$admin = ([Security.Principal.WindowsPrincipal]$id).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
function Script([string]$cmd) {
  if (-not $cmd) { return '(ilegivel neste contexto)' }
  # So os tokens que sao arquivo de script (e o -D do PostgreSQL); nunca o resto da linha.
  $tokens = @([regex]::Matches($cmd, '"[^"]*"|\S+') | ForEach-Object { $_.Value.Trim('"') })
  $achados = @($tokens | Where-Object { $_ -match '(?i)\.(c?js|mjs|ts)$' })
  $i = [array]::IndexOf($tokens, '-D'); if ($i -ge 0 -and $i + 1 -lt $tokens.Count) { $achados += ('-D ' + $tokens[$i + 1]) }
  if ($achados.Count) { return ($achados -join ' ') } else { return '(sem caminho de script)' }
}
$procs = @(Get-CimInstance Win32_Process | Where-Object { $_.Name -in @('node.exe', 'postgres.exe', 'pg_ctl.exe') } | ForEach-Object {
    [ordered]@{ pid = [int]$_.ProcessId; pai = [int]$_.ParentProcessId; nome = $_.Name; criado = $_.CreationDate.ToString('o');
      executavel = $(if ($_.ExecutablePath) { $_.ExecutablePath } else { '(ilegivel neste contexto)' }); script = (Script $_.CommandLine) } })
$escutas = @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.LocalPort -in @(8080, 5193, 55436) } |
  ForEach-Object { [ordered]@{ porta = [int]$_.LocalPort; endereco = $_.LocalAddress; pid = [int]$_.OwningProcess } })
$registro = $null
$f = Join-Path $Ativa 'runtime-pids.json'
if (Test-Path -LiteralPath $f) {
  $r = Get-Content -LiteralPath $f -Raw | ConvertFrom-Json
  $registro = [ordered]@{ arquivo = $f; gravadoEm = (Get-Item -LiteralPath $f).LastWriteTime.ToString('o') }
  foreach ($k in 'critical', 'async', 'pilot') { $p = [int]$r.$k; $registro[$k] = [ordered]@{ pid = $p; vivo = [bool](Get-Process -Id $p -ErrorAction SilentlyContinue) } }
}
$pgdata = Join-Path $Ativa 'pgdata'
$pg = [ordered]@{ pasta = $pgdata; existe = (Test-Path -LiteralPath $pgdata) }
if ($pg.existe) {
  $pg.postmasterPid = Test-Path -LiteralPath (Join-Path $pgdata 'postmaster.pid')
  $pg.versao = $(if (Test-Path -LiteralPath (Join-Path $pgdata 'PG_VERSION')) { (Get-Content -LiteralPath (Join-Path $pgdata 'PG_VERSION') -Raw).Trim() } else { $null })
}
$tarefas = @(Get-ScheduledTask -ErrorAction SilentlyContinue | Where-Object { $_.TaskName -like '*DeliveryOS*' -or $_.TaskPath -like '*DeliveryOS*' } | ForEach-Object {
    $i = $_ | Get-ScheduledTaskInfo
    [ordered]@{ nome = $_.TaskPath + $_.TaskName; estado = [string]$_.State; logon = [string]$_.Principal.LogonType; ultimaExecucao = $i.LastRunTime.ToString('o'); resultado = $i.LastTaskResult } })
$os = Get-CimInstance Win32_OperatingSystem
$out = [ordered]@{
  schema = 'deliveryos.inspecao-ensaio.v1'; maquina = $env:COMPUTERNAME; em = (Get-Date).ToString('o')
  contexto = [ordered]@{ usuario = $id.Name; administrador = $admin; ultimoBoot = $os.LastBootUpTime.ToString('o') }
  processos = $procs; escutas = $escutas; registro = $registro; postgresDoEnsaio = $pg; tarefas = $tarefas
}
$json = $out | ConvertTo-Json -Depth 6
if ($Saida) { [System.IO.File]::WriteAllText($Saida, $json, (New-Object System.Text.UTF8Encoding($false))) }
$json
