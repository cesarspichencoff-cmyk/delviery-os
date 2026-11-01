# Guarda do inventario do computador do ensaio: ele NAO pode escrever.
#
# 1. Pela arvore sintatica: todo comando chamado esta na lista de leitura;
#    nenhum redirecionamento para arquivo; todo Invoke-WebRequest e GET; as
#    chamadas por '&' sao so 'node --version', 'netbird status --json' e o bloco
#    interno de leitura da funcao Tentar.
# 2. Executando: numa pasta vazia, o script sai 0, imprime JSON somente_leitura
#    e a pasta continua vazia.
param([Parameter(Mandatory=$true)][string]$ScriptPath)
$ErrorActionPreference = 'Stop'
$tokens = $null; $errors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile($ScriptPath, [ref]$tokens, [ref]$errors)
if ($errors.Count) { throw 'INVENTORY_PARSE_FAILED' }

$permitidos = @('Get-CimInstance', 'Get-Command', 'Get-Content', 'Get-Item', 'Get-FileHash', 'Get-NetTCPConnection', 'Get-Process',
  'Get-NetAdapter', 'Get-NetIPAddress', 'Get-NetFirewallProfile', 'Get-NetFirewallRule', 'Get-ScheduledTask', 'Get-Service',
  'Get-Date', 'Test-Path', 'Join-Path', 'ConvertFrom-Json', 'ConvertTo-Json', 'Where-Object', 'ForEach-Object', 'Sort-Object',
  'Invoke-WebRequest', 'Tentar', 'Arquivo')
$comandos = @($ast.FindAll({ param($n) $n -is [Management.Automation.Language.CommandAst] }, $true))
foreach ($c in $comandos) {
  $nome = $c.GetCommandName()
  if ($null -eq $nome) {
    # Chamada por '&': so os dois executaveis de leitura, com os argumentos de leitura.
    $texto = $c.Extent.Text
    if ($texto -notmatch '^& \$n\.Source --version$' -and $texto -notmatch '^& \$nb status --json$' -and $texto -notmatch '^& \$Bloco$') {
      throw "INVENTORY_DYNAMIC_CALL_NOT_ALLOWED: $texto"
    }
    continue
  }
  if ($permitidos -notcontains $nome) { throw "INVENTORY_COMMAND_NOT_ALLOWED: $nome" }
  if ($nome -eq 'Invoke-WebRequest' -and $c.Extent.Text -notmatch '-Method Get') { throw 'INVENTORY_HTTP_NOT_GET' }
}
$redir = @($ast.FindAll({ param($n) $n -is [Management.Automation.Language.FileRedirectionAst] }, $true))
if ($redir.Count) { throw 'INVENTORY_FILE_REDIRECTION' }

$work = Join-Path ([IO.Path]::GetTempPath()) ('inventario-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $work | Out-Null
try {
  $saida = & powershell -NoProfile -ExecutionPolicy Bypass -File $ScriptPath -Root $work
  if ($LASTEXITCODE -ne 0) { throw "INVENTORY_EXIT_$LASTEXITCODE" }
  $json = ($saida -join "`n") | ConvertFrom-Json
  if ($json.schema -ne 'deliveryos.inventario-caixa.v1' -or $json.somente_leitura -ne $true) { throw 'INVENTORY_REPORT_SHAPE' }
  if ($json.arquivos.'private-local.json'.existe -ne $false) { throw 'INVENTORY_ABSENCE_NOT_DECLARED' }
  if (@(Get-ChildItem -LiteralPath $work -Force).Count -ne 0) { throw 'INVENTORY_WROTE_FILES' }
  "INVENTARIO_SOMENTE_LEITURA_PASS comandos=$($comandos.Count); sem_escrita; pasta_vazia_intacta"
} finally { Remove-Item -LiteralPath $work -Recurse -Force }
