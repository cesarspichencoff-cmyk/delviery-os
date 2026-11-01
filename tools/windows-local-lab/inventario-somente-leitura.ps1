<#
  Inventario SOMENTE LEITURA do computador do ensaio (CAIXA_MOOCA).

  Nao altera nada: so le estado (Get-*, `netbird status`, GET local de saude).
  Nao abre arquivo privado (tokens, senhas, termo): so diz se existe, o tamanho e
  a data. Nao grava arquivo nenhum: o relatorio sai so no console, em JSON;
  quem roda decide se redireciona. Nenhum segredo, endereco de cliente ou
  coordenada entra no relatorio.

  Uso (PowerShell 5.1, na pasta do ensaio):
    & 'C:\Users\Tata\DeliveryOS-Ensaio\inventario-somente-leitura.ps1'
    & '.\inventario-somente-leitura.ps1' -Root 'C:\caminho\do\ensaio'

  A guarda do CI reprova este arquivo se ele ganhar qualquer comando de escrita.
#>
param([string]$Root = $PSScriptRoot)
$ErrorActionPreference = 'Continue'

function Tentar([scriptblock]$Bloco) {
  try { & $Bloco } catch { [pscustomobject]@{ erro = $_.Exception.GetType().Name } }
}

function Arquivo([string]$Caminho) {
  if (Test-Path -LiteralPath $Caminho) {
    $i = Get-Item -LiteralPath $Caminho
    [pscustomobject]@{ existe = $true; bytes = $i.Length; alterado_em = $i.LastWriteTimeUtc.ToString('o') }
  } else {
    [pscustomobject]@{ existe = $false }
  }
}

$app = Join-Path $Root 'app'
$relatorio = [ordered]@{
  schema = 'deliveryos.inventario-caixa.v1'
  gerado_em = (Get-Date).ToUniversalTime().ToString('o')
  somente_leitura = $true
  maquina = $env:COMPUTERNAME
  raiz = $Root
}

# Sistema e runtime
$relatorio.windows = Tentar { $o = Get-CimInstance Win32_OperatingSystem; [pscustomobject]@{ caption = $o.Caption; versao = $o.Version; ultimo_boot = $o.LastBootUpTime.ToUniversalTime().ToString('o') } }
$relatorio.node = Tentar { $n = Get-Command node.exe -ErrorAction Stop; [pscustomobject]@{ caminho = $n.Source; versao = (& $n.Source --version) } }
$relatorio.wsl_presente = [bool](Get-Command wsl.exe -ErrorAction SilentlyContinue)
# Ferramenta do certificado de laboratorio do ensaio fisico: so a presenca
$relatorio.openssl = [ordered]@{
  no_path = [bool](Get-Command openssl.exe -ErrorAction SilentlyContinue)
  do_git = [bool](Test-Path -LiteralPath 'C:\Program Files\Git\usr\bin\openssl.exe')
}

# Instalacao do app: build carimbado e arquivos esperados (sem abrir os privados)
$relatorio.build = Tentar {
  $carimbo = Join-Path $app 'dist\build-stamp.json'
  if (Test-Path -LiteralPath $carimbo) { Get-Content -LiteralPath $carimbo -Raw | ConvertFrom-Json } else { [pscustomobject]@{ existe = $false } }
}
$relatorio.arquivos = [ordered]@{}
foreach ($nome in @('private-local.json', 'pilot-local.json', 'pilot-storage.json', 'gps-disabled.json', 'papeis_minimos.sql',
                    'pg-password.txt', 'runtime-pids.json', 'local-smoke.json', 'netbird-guard-state.json', 'netbird-guard-committed.json')) {
  $relatorio.arquivos[$nome] = Arquivo (Join-Path $Root $nome)
}
$relatorio.binarios = [ordered]@{}
foreach ($rel in @('dist\tools\entregas_pilot_server.js', 'dist\src\platform\bin\critical.js', 'dist\src\platform\bin\async-runtime.js',
                   'dist\src\platform\bin\entregas-source-ingest.js', 'dist\tools\product_system_server.js')) {
  $p = Join-Path $app $rel
  $relatorio.binarios[$rel] = if (Test-Path -LiteralPath $p) { (Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToLower() } else { $null }
}

# Processos e escutas: porta, endereco e dono (nunca a linha de comando, que pode ter segredo)
$relatorio.escutas = Tentar {
  @(Get-NetTCPConnection -State Listen -ErrorAction Stop | Where-Object { $_.LocalPort -in @(5193, 5290, 8080, 8443, 5443, 55436) } |
    ForEach-Object {
      $dono = Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue
      [pscustomobject]@{ porta = $_.LocalPort; endereco = $_.LocalAddress; processo = if ($dono) { $dono.ProcessName } else { $null }; pid = $_.OwningProcess }
    } | Sort-Object porta, endereco)
}
$relatorio.processos_node = Tentar { @(Get-Process -Name node -ErrorAction SilentlyContinue | ForEach-Object { [pscustomobject]@{ pid = $_.Id; inicio = $_.StartTime.ToUniversalTime().ToString('o') } }) }

# Rede: adaptadores, NetBird (estado e peers, sem chaves) e firewall do ensaio
$relatorio.adaptadores = Tentar { @(Get-NetAdapter -ErrorAction Stop | ForEach-Object { [pscustomobject]@{ nome = $_.Name; descricao = $_.InterfaceDescription; estado = [string]$_.Status } }) }
$relatorio.endereco_wt0 = Tentar { (Get-NetIPAddress -InterfaceAlias wt0 -AddressFamily IPv4 -ErrorAction Stop).IPAddress }
$nb = 'C:\Program Files\NetBird\netbird.exe'
$relatorio.netbird = if (Test-Path -LiteralPath $nb) {
  Tentar {
    $s = & $nb status --json | ConvertFrom-Json
    [pscustomobject]@{
      versao = $s.cliVersion; gerenciamento_conectado = [bool]$s.management.connected
      peers = @($s.peers.details | Where-Object { $_ } | ForEach-Object { [pscustomobject]@{ fqdn = $_.fqdn; ip = $_.netbirdIp; estado = $_.status } })
    }
  }
} else { [pscustomobject]@{ instalado = $false } }
$relatorio.firewall_perfis = Tentar { @(Get-NetFirewallProfile -ErrorAction Stop | ForEach-Object { [pscustomobject]@{ nome = $_.Name; ligado = [string]$_.Enabled; interfaces_excluidas = @($_.DisabledInterfaceAliases) } }) }
$relatorio.firewall_regras_do_ensaio = Tentar {
  @(Get-NetFirewallRule -ErrorAction Stop | Where-Object { $_.Name -like 'DeliveryOS-*' } | ForEach-Object {
    [pscustomobject]@{ nome = $_.Name; grupo = $_.Group; ligada = [string]$_.Enabled; acao = [string]$_.Action; direcao = [string]$_.Direction }
  } | Sort-Object nome)
}

# Tarefas agendadas e servicos do ensaio
$relatorio.tarefas = Tentar { @(Get-ScheduledTask -ErrorAction Stop | Where-Object { $_.TaskName -like 'DeliveryOS*' -or $_.TaskName -like 'TATA*' } | ForEach-Object { [pscustomobject]@{ nome = $_.TaskName; estado = [string]$_.State } }) }
$relatorio.servicos = Tentar { @(Get-Service -ErrorAction Stop | Where-Object { $_.Name -like 'postgresql*' -or $_.Name -like 'netbird*' -or $_.DisplayName -like '*DeliveryOS*' } | ForEach-Object { [pscustomobject]@{ nome = $_.Name; estado = [string]$_.Status; inicio = [string]$_.StartType } }) }

# Saude local, so GET e sem credencial
$relatorio.saude = [ordered]@{}
foreach ($u in @('http://127.0.0.1:8080/ready', 'http://127.0.0.1:5290/api/health')) {
  $relatorio.saude[$u] = Tentar { (Invoke-WebRequest -Uri $u -Method Get -UseBasicParsing -TimeoutSec 3).StatusCode }
}
if ($relatorio.endereco_wt0 -is [string]) {
  $u = "http://$($relatorio.endereco_wt0):5193/api/health"
  $relatorio.saude[$u] = Tentar { (Invoke-WebRequest -Uri $u -Method Get -UseBasicParsing -TimeoutSec 3).StatusCode }
}

$relatorio | ConvertTo-Json -Depth 6
