<#
  Compatibilidade com o Windows PowerShell 5.1 da CAIXA, checada fora do
  Windows com PSScriptAnalyzer 1.23.0 (perfil 5.1.17763 / .NET Framework 4.x):
  sintaxe (5.1 e 7.0) e comandos/parametros.

  Controle positivo embutido: um trecho com operador '??', ternario e
  'Get-Content -AsByteStream' TEM que ser acusado. Se o analisador nao acusar
  o controle, a checagem e cega e o resultado e RED — zero achado em cima de
  um analisador cego nao prova nada.

  Limite declarado: o analisador NAO pega membro .NET inexistente chamado em
  variavel (ex.: Process.Kill($true)); esses membros foram conferidos a mao
  contra a API do .NET Framework 4.5 (documento de causa raiz, §7).

  Uso: pwsh -File ps51_compat_check.ps1 -ModulePath <dir do PSScriptAnalyzer.psd1>
#>
param([Parameter(Mandatory = $true)][string]$ModulePath)
$ErrorActionPreference = "Stop"
Import-Module $ModulePath
$root = [IO.Path]::GetFullPath([IO.Path]::Combine($PSScriptRoot, "..", ".."))
$profile51 = "win-48_x64_10.0.17763.0_5.1.17763.316_x64_4.0.30319.42000_framework"
$settings = @{
  Rules = @{
    PSUseCompatibleSyntax   = @{ Enable = $true; TargetVersions = @("5.1", "7.0") }
    PSUseCompatibleCommands = @{ Enable = $true; TargetProfiles = @($profile51) }
    PSUseCompatibleTypes    = @{ Enable = $true; TargetProfiles = @($profile51) }
  }
  IncludeRules = @("PSUseCompatibleSyntax", "PSUseCompatibleCommands", "PSUseCompatibleTypes")
}

$control = [IO.Path]::Combine([IO.Path]::GetTempPath(), "ps51-control-" + [Guid]::NewGuid().ToString("N") + ".ps1")
[IO.File]::WriteAllText($control, "`$a = `$null`n`$b = `$a ?? 'x'`n`$c = `$true ? 1 : 2`nGet-Content -Path x -AsByteStream`n")
$c = @(Invoke-ScriptAnalyzer -Path $control -Settings $settings)
Remove-Item -LiteralPath $control -Force
if ($c.Count -lt 3) { "CONTROLE_POSITIVO_FALHOU: analisador acusou $($c.Count)/3 — checagem cega"; "PS51_COMPAT_RED"; exit 1 }
"  ok  controle positivo: $($c.Count) incompatibilidades acusadas"

$alvos = @(
  "runtime/tata-reader/tata_reader_supervisor_v1.ps1",
  "runtime/tata-reader/tata_reader_supervisor_cutover_v1.ps1",
  "tests/tata-reader/fixtures/watcher_v1_installed_256dc42.ps1"
)
$total = 0
foreach ($rel in $alvos) {
  $r = @(Invoke-ScriptAnalyzer -Path ([IO.Path]::Combine($root, $rel)) -Settings $settings)
  $total += $r.Count
  if ($r.Count -eq 0) { "  ok  $rel" } else { "  XX  $rel"; foreach ($x in $r) { "      L$($x.Line) $($x.RuleName): $($x.Message)" } }
}
if ($total -gt 0) { "PS51_COMPAT_RED"; exit 1 }
"PS51_COMPAT_GREEN"
