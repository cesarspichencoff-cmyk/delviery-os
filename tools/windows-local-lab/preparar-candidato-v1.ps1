<#
.SYNOPSIS
  Passo 1 da instalacao do candidato V1 no CAIXA_MOOCA: baixa o codigo num commit
  fixado, confere ARQUIVO POR ARQUIVO contra a arvore do Git, instala dependencias e
  compila numa pasta NOVA. Nao para, nao inicia e nao altera nenhum processo, porta,
  regra de firewall, tarefa ou banco.

.DESCRIPTION
  -Mode Prepare (padrao)  exige -Commit e -Tree (sha da arvore do commit, tirado de um
                          clone confiavel: git rev-parse <commit>^{tree}).
  -Mode Verify            so le: confere recibo, cada arquivo-fonte pelo blob do Git e
                          cada arquivo de dist/ pelo SHA-256 gravado na preparacao.
  -Mode Remove            apaga a pasta de destino, so se ela tiver recibo deste script
                          e nenhum processo estiver rodando de dentro dela.

  Integridade: o sha da arvore informado tem de ser o do commit na API do GitHub; a
  listagem dessa arvore (nao truncada) e a referencia; cada arquivo extraido do zip e
  conferido pelo blob id (sha1 de "blob <n>\0<bytes>"); arquivo a mais, a menos ou
  diferente reprova. Depois do build a fonte e conferida de novo (o build nao pode
  ter alterado fonte). dist/ ganha um manifesto SHA-256.

  Tudo ou nada: o trabalho acontece em <Destino>.parcial-<id>, com marcador proprio;
  so no fim, com recibo gravado, a pasta e RENOMEADA para <Destino>. Falha em qualquer
  passo apaga a pasta parcial e guarda o log em %TEMP%. Uma pasta parcial antiga (de
  execucao interrompida) com o marcador e limpa na proxima execucao.

  Para nao atrapalhar o caixa: prioridade BelowNormal (os filhos herdam), todo filho
  com CreateNoWindow e saida redirecionada, tempo maximo por passo com encerramento da
  arvore do processo, uma execucao por vez (mutex), espaco livre conferido antes.

  O que NAO faz: nao toca a pasta ativa (-Ativa), nao le segredos, nao abre porta, nao
  para processo alheio, nao muda firewall nem NetBird, nao registra tarefa.
#>
[CmdletBinding()]
param(
  [ValidateSet('Prepare', 'Verify', 'Remove')][string]$Mode = 'Prepare',
  [ValidatePattern('^[0-9a-f]{40}$')][string]$Commit,
  [ValidatePattern('^[0-9a-f]{40}$')][string]$Tree,
  [string]$Destino = 'C:\Users\Tata\DeliveryOS-Ensaio-V1',
  [string]$Ativa = 'C:\Users\Tata\DeliveryOS-Ensaio',
  [string]$Repo = 'cesarspichencoff-cmyk/delviery-os',
  [int]$NodeMajorMinimo = 22,
  [long]$EspacoMinimoMB = 2048,
  [ValidateRange(1, 7200)][int]$TempoMaxNpmSeg = 1800
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$schema = 'deliveryos.candidato-v1-preparacao.v2'
$utf8 = New-Object System.Text.UTF8Encoding($false)

function Normalizar([string]$p) {
  if (-not [System.IO.Path]::IsPathRooted($p)) { throw "caminho precisa ser absoluto: $p" }
  return ([System.IO.Path]::GetFullPath($p)).TrimEnd('\')
}
function Dentro([string]$filho, [string]$pai) {
  return $filho.StartsWith($pai + '\', [System.StringComparison]::OrdinalIgnoreCase)
}
$Destino = Normalizar $Destino
$Ativa = Normalizar $Ativa
if ($Destino.Length -le 3) { throw 'Destino nao pode ser a raiz de um disco.' }
if ($Destino -ieq $Ativa -or (Dentro $Destino $Ativa) -or (Dentro $Ativa $Destino)) {
  throw "Destino '$Destino' coincide com a pasta ativa '$Ativa' ou a contem. Nada foi alterado."
}
$pai = Split-Path -Parent $Destino
if (-not (Test-Path -LiteralPath $pai -PathType Container)) { throw "pasta-mae nao existe: $pai" }
$folha = Split-Path -Leaf $Destino
$recibo = Join-Path $Destino 'preparacao-candidato.json'
$marcador = '.deliveryos-candidato-parcial'

function Get-GitBlobId([byte[]]$Bytes) {
  $header = [System.Text.Encoding]::ASCII.GetBytes("blob $($Bytes.Length)`0")
  $sha = [System.Security.Cryptography.SHA1]::Create()
  try {
    [void]$sha.TransformBlock($header, 0, $header.Length, $null, 0)
    [void]$sha.TransformFinalBlock($Bytes, 0, $Bytes.Length)
    return -join ($sha.Hash | ForEach-Object { $_.ToString('x2') })
  } finally { $sha.Dispose() }
}
function Get-Sha256Bytes([byte[]]$Bytes) {
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try { return -join ($sha.ComputeHash($Bytes) | ForEach-Object { $_.ToString('x2') }) } finally { $sha.Dispose() }
}
function Get-Sha256File([string]$p) { return (Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToLowerInvariant() }
function Relativos([string]$base) {
  $n = $base.Length + 1
  return @(Get-ChildItem -LiteralPath $base -Recurse -File -Force | ForEach-Object { $_.FullName.Substring($n).Replace('\', '/') })
}

$node = (Get-Command node.exe -ErrorAction Stop).Source
$npm = Join-Path (Split-Path $node) 'npm.cmd'

# Roda um filho sem janela, com saida no log e tempo maximo; no estouro encerra a arvore.
function Rodar([string]$exe, [string[]]$argumentos, [string]$pasta, [string]$log, [int]$maxSeg, [hashtable]$amb) {
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = $exe
  $psi.Arguments = ($argumentos | ForEach-Object { if ($_ -match '[\s"]') { '"' + ($_ -replace '"', '\"') + '"' } else { $_ } }) -join ' '
  $psi.WorkingDirectory = $pasta
  $psi.UseShellExecute = $false
  $psi.CreateNoWindow = $true
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $psi.EnvironmentVariables['NO_UPDATE_NOTIFIER'] = '1'
  $psi.EnvironmentVariables['npm_config_update_notifier'] = 'false'
  $psi.EnvironmentVariables['npm_config_fund'] = 'false'
  $psi.EnvironmentVariables['npm_config_audit'] = 'false'
  if ($amb) { foreach ($k in $amb.Keys) { $psi.EnvironmentVariables[$k] = [string]$amb[$k] } }
  $t0 = [DateTime]::UtcNow
  $p = [System.Diagnostics.Process]::Start($psi)
  $out = $p.StandardOutput.ReadToEndAsync(); $err = $p.StandardError.ReadToEndAsync()
  if (-not $p.WaitForExit($maxSeg * 1000)) {
    $k = New-Object System.Diagnostics.ProcessStartInfo
    $k.FileName = Join-Path $env:SystemRoot 'System32\taskkill.exe'
    $k.Arguments = "/PID $($p.Id) /T /F"
    $k.UseShellExecute = $false; $k.CreateNoWindow = $true; $k.RedirectStandardOutput = $true; $k.RedirectStandardError = $true
    $kp = [System.Diagnostics.Process]::Start($k); [void]$kp.WaitForExit(30000)
    throw "tempo esgotado ($maxSeg s): $exe $($psi.Arguments)"
  }
  $p.WaitForExit()
  if ($log) { [System.IO.File]::AppendAllText($log, "`n== $exe $($psi.Arguments)`n" + $out.Result + $err.Result, $utf8) }
  if ($p.ExitCode -ne 0) { throw "falhou ($($p.ExitCode)): $exe $($psi.Arguments)" }
  return [int]([DateTime]::UtcNow - $t0).TotalSeconds
}
# Remocao que aguenta caminho longo de node_modules (Remove-Item do PS 5.1 nao aguenta).
function Apagar([string]$p) {
  if (-not (Test-Path -LiteralPath $p)) { return }
  [void](Rodar $node @('-e', 'require("fs").rmSync(process.argv[1],{recursive:true,force:true,maxRetries:5})', $p) $pai $null 600 $null)
  if (Test-Path -LiteralPath $p) { throw "nao consegui apagar $p" }
}

function Verificar([string]$base) {
  if (-not (Test-Path -LiteralPath (Join-Path $base 'preparacao-candidato.json'))) { throw "sem recibo em $base" }
  $r = Get-Content -LiteralPath (Join-Path $base 'preparacao-candidato.json') -Raw | ConvertFrom-Json
  if ($r.schema -ne $schema) { throw "recibo de outro formato: $($r.schema)" }
  if ($Commit -and $r.commit -ne $Commit) { throw "recibo e do commit $($r.commit), nao $Commit" }
  $app = Join-Path $base 'app'
  $mf = Join-Path $base 'manifesto-fonte.txt'; $md = Join-Path $base 'manifesto-dist.txt'
  if ((Get-Sha256File $mf) -ne $r.manifestoFonteSha256) { throw 'manifesto da fonte foi alterado' }
  if ((Get-Sha256File $md) -ne $r.manifestoDistSha256) { throw 'manifesto de dist foi alterado' }
  $ruins = New-Object System.Collections.Generic.List[string]
  $nf = 0
  foreach ($l in [System.IO.File]::ReadAllLines($mf)) {
    $c = $l.Split(' ', 3); $nf++
    $f = Join-Path $app $c[2]
    if (-not (Test-Path -LiteralPath $f -PathType Leaf)) { $ruins.Add("ausente $($c[2])"); continue }
    if ((Get-GitBlobId ([System.IO.File]::ReadAllBytes($f))) -ne $c[0]) { $ruins.Add("diferente $($c[2])") }
  }
  $esperadosDist = New-Object System.Collections.Generic.HashSet[string]
  $nd = 0
  foreach ($l in [System.IO.File]::ReadAllLines($md)) {
    $c = $l.Split(' ', 2); $nd++; [void]$esperadosDist.Add($c[1])
    $f = Join-Path $app ('dist/' + $c[1])
    if (-not (Test-Path -LiteralPath $f -PathType Leaf)) { $ruins.Add("ausente dist/$($c[1])"); continue }
    if ((Get-Sha256File $f) -ne $c[0]) { $ruins.Add("diferente dist/$($c[1])") }
  }
  foreach ($x in (Relativos (Join-Path $app 'dist'))) { if (-not $esperadosDist.Contains($x)) { $ruins.Add("a mais dist/$x") } }
  if ($ruins.Count) { throw ("conferencia reprovada ({0}): {1}" -f $ruins.Count, (($ruins | Select-Object -First 10) -join '; ')) }
  return [ordered]@{ commit = $r.commit; tree = $r.tree; arquivosFonte = $nf; arquivosDist = $nd; conferido = $true }
}

$mutex = New-Object System.Threading.Mutex($false, 'Local\DeliveryOS-Candidato-V1')
$temMutex = $false
try { $temMutex = $mutex.WaitOne(0) } catch [System.Threading.AbandonedMutexException] { $temMutex = $true }
if (-not $temMutex) { $mutex.Dispose(); throw 'Outra execucao deste script esta em andamento. Nada foi alterado.' }
try {
  [System.Diagnostics.Process]::GetCurrentProcess().PriorityClass = [System.Diagnostics.ProcessPriorityClass]::BelowNormal

  if ($Mode -eq 'Verify') {
    $v = Verificar $Destino
    $v['mode'] = 'Verify'; $v['machine'] = $env:COMPUTERNAME; $v['destino'] = $Destino
    $v | ConvertTo-Json
    return
  }

  if ($Mode -eq 'Remove') {
    if (-not (Test-Path -LiteralPath $recibo)) { throw "$Destino nao tem recibo deste script. Nao foi removido." }
    $r = Get-Content -LiteralPath $recibo -Raw | ConvertFrom-Json
    if ($r.schema -ne $schema) { throw "recibo de outro formato em $Destino. Nao foi removido." }
    $emUso = @(Get-CimInstance Win32_Process | Where-Object {
        ($_.ExecutablePath -and (Dentro $_.ExecutablePath $Destino)) -or
        ($_.Name -ieq 'node.exe' -and $_.CommandLine -and $_.CommandLine.IndexOf($Destino, [System.StringComparison]::OrdinalIgnoreCase) -ge 0) })
    if ($emUso.Count) { throw "Ha $($emUso.Count) processo(s) rodando de $Destino (pid $(($emUso | ForEach-Object { $_.ProcessId }) -join ',')). Nao foi removido." }
    # Renomeia antes de apagar: uma remocao interrompida nunca deixa uma pasta que parece valida.
    $lixo = "$Destino.removendo-" + [guid]::NewGuid().ToString('N').Substring(0, 8)
    Rename-Item -LiteralPath $Destino -NewName (Split-Path -Leaf $lixo)
    Apagar $lixo
    [ordered]@{ mode = 'Remove'; machine = $env:COMPUTERNAME; destino = $Destino; commit = $r.commit; removido = $true } | ConvertTo-Json
    return
  }

  # ---- Prepare ----
  if (-not $Commit -or -not $Tree) { throw 'Prepare exige -Commit e -Tree.' }
  if (Test-Path -LiteralPath $Destino) {
    # Idempotente: a mesma preparacao ja feita e so reconferida; qualquer outra coisa e recusada.
    $v = Verificar $Destino
    if ($v.tree -ne $Tree) { throw "$Destino ja tem o commit certo mas outra arvore ($($v.tree)). Nada foi alterado." }
    $v['mode'] = 'Prepare'; $v['jaPreparado'] = $true; $v['machine'] = $env:COMPUTERNAME
    $v | ConvertTo-Json
    return
  }

  $nodeVersao = (& $node -p 'process.versions.node' 2>$null)
  if (-not $nodeVersao -or [int]($nodeVersao.Split('.')[0]) -lt $NodeMajorMinimo) { throw "Node $nodeVersao abaixo do minimo $NodeMajorMinimo." }
  if (-not (Test-Path -LiteralPath $npm)) { throw "npm.cmd nao encontrado ao lado de $node" }
  foreach ($disco in @((Split-Path -Qualifier $Destino), (Split-Path -Qualifier ([System.IO.Path]::GetTempPath())))) {
    $livreMB = [long]((New-Object System.IO.DriveInfo($disco)).AvailableFreeSpace / 1MB)
    if ($livreMB -lt $EspacoMinimoMB) { throw "espaco livre em $disco e $livreMB MB, minimo $EspacoMinimoMB MB." }
  }

  # Restos de execucao interrompida: so pastas com o marcador deste script.
  foreach ($velha in @(Get-ChildItem -LiteralPath $pai -Directory -Force | Where-Object { $_.Name -like "$folha.parcial-*" -or $_.Name -like "$folha.removendo-*" })) {
    if ((Test-Path -LiteralPath (Join-Path $velha.FullName $marcador)) -or $velha.Name -like "$folha.removendo-*") { Apagar $velha.FullName }
  }

  $id = [guid]::NewGuid().ToString('N').Substring(0, 8)
  $parcial = "$Destino.parcial-$id"
  $tmp = Join-Path ([System.IO.Path]::GetTempPath()) "deliveryos-candidato-$id"
  $log = Join-Path $tmp 'preparacao-candidato.log'
  $tempos = [ordered]@{}
  $renomeado = $false
  New-Item -ItemType Directory -Path $tmp | Out-Null
  try {
    [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12
    $wc = New-Object System.Net.WebClient
    $wc.Encoding = [System.Text.Encoding]::UTF8
    $wc.Headers['User-Agent'] = 'deliveryos-candidato'
    $wc.Headers['Accept'] = 'application/vnd.github+json'
    $t0 = [DateTime]::UtcNow
    $treeDoCommit = ($wc.DownloadString("https://api.github.com/repos/$Repo/git/commits/$Commit") | ConvertFrom-Json).tree.sha
    if ($treeDoCommit -ne $Tree) { throw "a arvore do commit na origem e $treeDoCommit, nao a informada $Tree." }
    $wc.Headers['User-Agent'] = 'deliveryos-candidato'
    $wc.Headers['Accept'] = 'application/vnd.github+json'
    $listagem = $wc.DownloadString("https://api.github.com/repos/$Repo/git/trees/$Tree`?recursive=1") | ConvertFrom-Json
    if ($listagem.sha -ne $Tree -or $listagem.truncated) { throw 'listagem da arvore truncada ou de outra arvore.' }
    $esperado = New-Object System.Collections.Hashtable([System.StringComparer]::Ordinal)
    $modos = New-Object System.Collections.Hashtable([System.StringComparer]::Ordinal)
    foreach ($e in $listagem.tree) {
      if ($e.type -eq 'blob') {
        if ($e.mode -ne '100644' -and $e.mode -ne '100755') { throw "modo nao suportado ($($e.mode)): $($e.path)" }
        $esperado[$e.path] = [string]$e.sha; $modos[$e.path] = [string]$e.mode
      } elseif ($e.type -ne 'tree') { throw "entrada nao suportada ($($e.type)): $($e.path)" }
    }
    $zip = Join-Path $tmp 'source.zip'
    $wc.Headers['User-Agent'] = 'deliveryos-candidato'
    $wc.DownloadFile("https://codeload.github.com/$Repo/zip/$Commit", $zip)
    $tempos['download'] = [int]([DateTime]::UtcNow - $t0).TotalSeconds
    $zipSha = Get-Sha256File $zip

    $t0 = [DateTime]::UtcNow
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $raizEsperada = ($Repo.Split('/')[1]) + '-' + $Commit + '/'
    $z = [System.IO.Compression.ZipFile]::OpenRead($zip)
    try {
      foreach ($en in $z.Entries) {
        $n = $en.FullName
        if (-not $n.StartsWith($raizEsperada) -or $n.Contains('..') -or $n.Contains(':') -or $n.Contains('\')) { throw "entrada inesperada no zip: $n" }
      }
    } finally { $z.Dispose() }
    $ext = Join-Path $tmp 'x'
    [System.IO.Compression.ZipFile]::ExtractToDirectory($zip, $ext)
    $fonte = Join-Path $ext $raizEsperada.TrimEnd('/')
    $achados = Relativos $fonte
    $ruins = New-Object System.Collections.Generic.List[string]
    $vistos = New-Object System.Collections.Generic.HashSet[string]
    foreach ($rel in $achados) {
      [void]$vistos.Add($rel)
      if (-not $esperado.ContainsKey($rel)) { $ruins.Add("a mais $rel"); continue }
      if ((Get-GitBlobId ([System.IO.File]::ReadAllBytes((Join-Path $fonte $rel)))) -ne $esperado[$rel]) { $ruins.Add("diferente $rel") }
    }
    foreach ($k in $esperado.Keys) { if (-not $vistos.Contains($k)) { $ruins.Add("ausente $k") } }
    if ($ruins.Count) { throw ("fonte nao confere com a arvore {0} ({1}): {2}" -f $Tree, $ruins.Count, (($ruins | Select-Object -First 10) -join '; ')) }
    $linhas = @($esperado.Keys | Sort-Object { $_ } -CaseSensitive | ForEach-Object { "$($esperado[$_]) $($modos[$_]) $_" })
    $tempos['conferencia'] = [int]([DateTime]::UtcNow - $t0).TotalSeconds

    New-Item -ItemType Directory -Path $parcial | Out-Null
    [System.IO.File]::WriteAllText((Join-Path $parcial $marcador), "$Commit`n", $utf8)
    $app = Join-Path $parcial 'app'
    Move-Item -LiteralPath $fonte -Destination $app
    $mf = Join-Path $parcial 'manifesto-fonte.txt'
    [System.IO.File]::WriteAllLines($mf, [string[]]$linhas, $utf8)

    $tempos['npm_ci'] = Rodar $npm @('ci', '--ignore-scripts', '--no-audit', '--no-fund') $app $log $TempoMaxNpmSeg $null
    $tempos['tsc'] = Rodar $node @('node_modules/typescript/bin/tsc') $app $log 900 $null
    foreach ($s in 'tools/copiar_migrations.js', 'tools/copiar_conference_brain.js', 'tools/copiar_contratos.js') { [void](Rodar $node @($s) $app $log 300 $null) }
    # O zip nao traz .git: o carimbo recebe o commit pelo ambiente que ele ja aceita (so neste filho).
    [void](Rodar $node @('tools/carimbar_build.js') $app $log 300 @{ DELIVERYOS_COMMIT = $Commit })
    $stamp = Get-Content -LiteralPath (Join-Path $app 'dist/build-stamp.json') -Raw | ConvertFrom-Json
    if (-not ([string]$stamp.commit).StartsWith($Commit.Substring(0, 10))) { throw "carimbo do build aponta '$($stamp.commit)', nao $Commit" }
    $binarios = @('dist/src/platform/bin/critical.js', 'dist/src/platform/bin/async-runtime.js', 'dist/src/platform/bin/portao-de-campo.js',
      'dist/tools/entregas_pilot_server.js', 'dist/src/entregas/foundation/trip-capture-grant.js')
    $faltando = @($binarios | Where-Object { -not (Test-Path -LiteralPath (Join-Path $app $_)) })
    if ($faltando.Count) { throw "binarios ausentes: $($faltando -join ', ')" }
    # Sintaxe dos binarios sem executa-los (node --check nao roda o modulo).
    foreach ($b in $binarios) { [void](Rodar $node @('--check', $b) $app $log 120 $null) }

    $distBase = Join-Path $app 'dist'
    $md = Join-Path $parcial 'manifesto-dist.txt'
    $linhasDist = @(Relativos $distBase | Sort-Object { $_ } -CaseSensitive | ForEach-Object { (Get-Sha256File (Join-Path $distBase $_)) + ' ' + $_ })
    [System.IO.File]::WriteAllLines($md, [string[]]$linhasDist, $utf8)

    $npmVersao = ''
    try { $npmVersao = (Get-Content -LiteralPath (Join-Path (Split-Path $node) 'node_modules/npm/package.json') -Raw | ConvertFrom-Json).version } catch { $npmVersao = 'UNKNOWN' }
    $resultado = [ordered]@{
      schema = $schema; machine = $env:COMPUTERNAME; commit = $Commit; tree = $Tree
      arquivosFonte = $linhas.Count; arquivosDist = $linhasDist.Count
      manifestoFonteSha256 = (Get-Sha256File $mf); manifestoDistSha256 = (Get-Sha256File $md)
      zipSha256 = $zipSha; packageLockSha256 = (Get-Sha256File (Join-Path $app 'package-lock.json'))
      stampCommit = [string]$stamp.commit; buildStampSha256 = (Get-Sha256File (Join-Path $app 'dist/build-stamp.json'))
      node = $nodeVersao; npm = $npmVersao; temposSeg = $tempos
      preparadoEmUtc = [DateTime]::UtcNow.ToString('o'); destino = $Destino
      processosAlterados = 0; portasAbertas = 0; firewallAlterado = $false; tarefasRegistradas = 0
    }
    Copy-Item -LiteralPath $log -Destination (Join-Path $parcial 'preparacao-candidato.log')
    [System.IO.File]::WriteAllText((Join-Path $parcial 'preparacao-candidato.json'), ($resultado | ConvertTo-Json), $utf8)
    Remove-Item -LiteralPath (Join-Path $parcial $marcador) -Force
    # O ato final e um rename no mesmo disco: a pasta de destino aparece inteira ou nao aparece.
    Rename-Item -LiteralPath $parcial -NewName $folha
    $renomeado = $true
    $v = Verificar $Destino
    $resultado['verificacaoPosRename'] = $v.conferido
    $resultado | ConvertTo-Json
  } catch {
    $falha = $_
    $guardado = Join-Path ([System.IO.Path]::GetTempPath()) ("deliveryos-candidato-falha-{0:yyyyMMdd-HHmmss}.log" -f (Get-Date))
    try { if (Test-Path -LiteralPath $log) { Copy-Item -LiteralPath $log -Destination $guardado } } catch { }
    try { Apagar $parcial } catch { }
    if ($renomeado) {
      # Falha DEPOIS do rename (verificacao pos-rename): a pasta foi criada por esta execucao.
      try { Apagar $Destino } catch { }
    }
    throw "preparacao falhou, nada ficou instalado (log: $guardado): $falha"
  } finally {
    try { Apagar $tmp } catch { }
  }
} finally {
  $mutex.ReleaseMutex(); $mutex.Dispose()
}
