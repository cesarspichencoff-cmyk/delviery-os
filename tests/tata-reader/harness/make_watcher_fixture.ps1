<#
  Cria a copia de HARNESS de um watcher auditado. As UNICAS diferencas sao de
  encanamento — identidade Windows (NT SERVICE) e SSPI nao existem no Linux:
    identidade do servico  -> login SQL do harness
    servidor SQL           -> instancia do harness
    autenticacao SSPI      -> usuario/senha do login de leitura
    estado do turno        -> caminho temporario
  Cada ancora tem que existir EXATAMENTE uma vez: se o watcher mudar, o
  harness falha em voz alta em vez de testar outra coisa. O laco de leitura,
  o tratamento de erro, o checkpoint e a emissao de eventos ficam intactos.
#>
param(
  [Parameter(Mandatory = $true)][string]$Source,
  [Parameter(Mandatory = $true)][string]$Target,
  [Parameter(Mandatory = $true)][string]$Server,
  [Parameter(Mandatory = $true)][string]$ReaderPassword,
  [Parameter(Mandatory = $true)][string]$ServiceStatePath
)
$ErrorActionPreference = "Stop"
$text = [IO.File]::ReadAllText($Source)
$repl = @(
  @('$ExpectedLogin = "NT SERVICE\TataComandaReader"', '$ExpectedLogin = "tata_reader_harness"'),
  @('$SqlServer = "(local)\SQLEXPRESS"', ('$SqlServer = "' + $Server + '"')),
  @('$identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name', '$identity = $ExpectedLogin'),
  @('"Server=$SqlServer;Database=$Database;Integrated Security=SSPI;"', ('"Server=$SqlServer;Database=$Database;User ID=tata_reader_harness;Password=' + $ReaderPassword + ';"')),
  @('$ServiceStatePath = "C:\ProgramData\TataComandaReader\state\production-service-state.json"', ('$ServiceStatePath = "' + $ServiceStatePath + '"'))
)
foreach ($r in $repl) {
  $n = ([regex]::Matches($text, [regex]::Escape($r[0]))).Count
  if ($n -ne 1) { throw ("FIXTURE_ANCHOR_COUNT_" + $n + ":" + $r[0]) }
  $text = $text.Replace($r[0], $r[1])
}
[IO.File]::WriteAllText($Target, $text, (New-Object Text.UTF8Encoding($false)))
"FIXTURE_OK"
