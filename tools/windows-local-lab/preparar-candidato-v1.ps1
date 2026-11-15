<#
.SYNOPSIS
  Passo 1 da instalacao do candidato V1 no CAIXA_MOOCA: baixa o codigo num commit
  fixado, confere, instala as dependencias e compila numa pasta NOVA. Nao para,
  nao inicia e nao altera nenhum processo, porta, regra de firewall ou banco.

.DESCRIPTION
  -Commit <sha completo>   commit publicado da branch da PR #137.
  -Destino <pasta>         padrao C:\Users\Tata\DeliveryOS-Ensaio-V1 (precisa nao existir,
                           ou existir so com um recibo deste script para o MESMO commit).

  O que faz: baixa o zip do commit (codeload do GitHub), confere que a pasta raiz do
  zip e exatamente <repo>-<sha>, extrai, roda `npm ci --ignore-scripts` e a compilacao
  da plataforma (tsc + copia de migracoes, contratos e carimbo), confere que o carimbo
  do build aponta o MESMO commit e que os binarios esperados existem, e grava um recibo.
  Tudo com processos filhos sem janela (CreateNoWindow).

  O que NAO faz: nao toca a pasta atual do ensaio, nao le segredos, nao abre porta, nao
  para processo, nao muda firewall nem NetBird. Reverter = apagar a pasta de destino.
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][ValidatePattern('^[0-9a-f]{40}$')][string]$Commit,
  [string]$Destino = 'C:\Users\Tata\DeliveryOS-Ensaio-V1',
  [string]$Repo = 'cesarspichencoff-cmyk/delviery-os'
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$recibo = Join-Path $Destino 'preparacao-candidato.json'
if (Test-Path -LiteralPath $Destino) {
  $ok = $false
  if (Test-Path -LiteralPath $recibo) { $ok = ((Get-Content -LiteralPath $recibo -Raw | ConvertFrom-Json).commit -eq $Commit) }
  if (-not $ok) { throw "$Destino ja existe e nao e uma preparacao deste commit. Nada foi alterado." }
  Get-Content -LiteralPath $recibo -Raw
  return
}

$node = (Get-Command node.exe -ErrorAction Stop).Source
$npm = Join-Path (Split-Path $node) 'npm.cmd'
if (-not (Test-Path -LiteralPath $npm)) { throw "npm.cmd nao encontrado ao lado de $node" }

function Rodar([string]$exe, [string[]]$argumentos, [string]$pasta, [string]$log) {
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = $exe
  $psi.Arguments = ($argumentos | ForEach-Object { if ($_ -match '[\s"]') { '"' + ($_ -replace '"', '\"') + '"' } else { $_ } }) -join ' '
  $psi.WorkingDirectory = $pasta
  $psi.UseShellExecute = $false
  $psi.CreateNoWindow = $true
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $p = [System.Diagnostics.Process]::Start($psi)
  $out = $p.StandardOutput.ReadToEndAsync(); $err = $p.StandardError.ReadToEndAsync()
  $p.WaitForExit()
  [System.IO.File]::AppendAllText($log, "`n== $exe $($psi.Arguments)`n" + $out.Result + $err.Result)
  if ($p.ExitCode -ne 0) { throw "falhou ($($p.ExitCode)): $exe $($psi.Arguments) - ver $log" }
}

$tmp = Join-Path ([System.IO.Path]::GetTempPath()) ('deliveryos-candidato-' + [guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory -Path $tmp | Out-Null
try {
  [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12
  $zip = Join-Path $tmp 'source.zip'
  (New-Object System.Net.WebClient).DownloadFile("https://codeload.github.com/$Repo/zip/$Commit", $zip)
  $sha256 = (Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash.ToLowerInvariant()
  Expand-Archive -LiteralPath $zip -DestinationPath $tmp
  $raiz = @(Get-ChildItem -LiteralPath $tmp -Directory)
  $esperado = ($Repo.Split('/')[1]) + '-' + $Commit
  if ($raiz.Count -ne 1 -or $raiz[0].Name -ne $esperado) { throw "zip inesperado: raiz '$($raiz.Name -join ',')', esperado '$esperado'" }
  New-Item -ItemType Directory -Path $Destino | Out-Null
  $app = Join-Path $Destino 'app'
  Move-Item -LiteralPath $raiz[0].FullName -Destination $app
  $log = Join-Path $Destino 'preparacao-candidato.log'
  Rodar $npm @('ci', '--ignore-scripts', '--no-audit', '--no-fund') $app $log
  Rodar $node @('node_modules/typescript/bin/tsc') $app $log
  foreach ($s in 'tools/copiar_migrations.js', 'tools/copiar_conference_brain.js', 'tools/copiar_contratos.js') { Rodar $node @($s) $app $log }
  # O zip nao traz .git: o carimbo recebe o commit pelo ambiente que ele ja aceita.
  $env:DELIVERYOS_COMMIT = $Commit
  Rodar $node @('tools/carimbar_build.js') $app $log
  $stamp = Get-Content -LiteralPath (Join-Path $app 'dist/build-stamp.json') -Raw | ConvertFrom-Json
  $faltando = @('dist/src/platform/bin/critical.js', 'dist/src/platform/bin/async-runtime.js', 'dist/src/platform/bin/portao-de-campo.js',
    'dist/tools/entregas_pilot_server.js', 'dist/src/entregas/foundation/trip-capture-grant.js') | Where-Object { -not (Test-Path -LiteralPath (Join-Path $app $_)) }
  if ($faltando) { throw "binarios ausentes: $($faltando -join ', ')" }
  $resultado = [ordered]@{
    schema = 'deliveryos.candidato-v1-preparacao.v1'; machine = $env:COMPUTERNAME; commit = $Commit
    zipSha256 = $sha256; stampCommit = [string]$stamp.commit; preparadoEmUtc = [DateTime]::UtcNow.ToString('o')
    destino = $Destino; processosAlterados = 0; portasAbertas = 0; firewallAlterado = $false
  }
  if (-not ([string]$stamp.commit).StartsWith($Commit.Substring(0, 10))) { throw "carimbo do build aponta '$($stamp.commit)', nao $Commit" }
  [System.IO.File]::WriteAllText($recibo, ($resultado | ConvertTo-Json), (New-Object System.Text.UTF8Encoding($false)))
  $resultado | ConvertTo-Json
} catch {
  # Falha no meio: a pasta de destino nao fica pela metade.
  if (Test-Path -LiteralPath $Destino) { Remove-Item -LiteralPath $Destino -Recurse -Force -ErrorAction SilentlyContinue }
  throw
} finally {
  Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
}
