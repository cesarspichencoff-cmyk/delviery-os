# Diagnostico somente de metadados; nao le pedidos, cookies ou credenciais.
# Windows PowerShell 5.1+. Nao requer administrador nem altera aplicativos.
[CmdletBinding()]
param([string]$OutputPath = (Join-Path ([Environment]::GetFolderPath('Desktop')) ('deliveryos-gestor-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.json')))
$ErrorActionPreference = 'Stop'
$issues = New-Object System.Collections.Generic.List[string]
$apps = @()
$keys = @(
 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',
 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',
 'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*'
)
foreach ($key in $keys) {
 try {
  $apps += @(Get-ItemProperty -Path $key -ErrorAction Stop |
   Where-Object { $_.DisplayName -match '(?i)ifood|gestor.*pedido' } |
   Select-Object @{N='name';E={$_.DisplayName}}, @{N='version';E={$_.DisplayVersion}}, @{N='publisher';E={$_.Publisher}})
 } catch { $issues.Add('registro_indisponivel_' + $keys.IndexOf($key)) }
}
$running = @()
try {
 $running = @(Get-Process | Where-Object { $_.ProcessName -match '(?i)ifood|gestor' } |
  Select-Object -First 30 | ForEach-Object {
   $version = $null
   try { $version = $_.MainModule.FileVersionInfo.FileVersion } catch {}
   # Nunca exportar MainWindowTitle, caminho, argumentos ou conteudo da janela.
   [pscustomobject]@{ name=$_.ProcessName; version=$version; has_window=($_.MainWindowHandle -ne 0) }
  })
} catch { $issues.Add('processos_indisponiveis') }
$report = [ordered]@{
 schema='deliveryos.gestor-metadata.v1'
 observed_at=(Get-Date).ToUniversalTime().ToString('o')
 mode='metadata_only'
 store_identity='NOT_OBSERVED'
 order_capture='NOT_ATTEMPTED'
 real_integration='NOT_PROVEN'
 installed_apps=@($apps | Sort-Object name,version -Unique | Select-Object -First 30)
 matching_processes=$running
 limitations=@('Ausencia de processo nao exclui Gestor aberto no navegador.', 'Nenhuma aba, tela, pedido ou identificador de loja foi lido.', 'Versao do aplicativo nao prova que seus dados sejam acessiveis.')
 issues=@($issues)
}
# Unica escrita: novo relatorio escolhido pelo operador; nunca sobrescreve.
if (Test-Path -LiteralPath $OutputPath) { throw 'Arquivo ja existe; escolha outro caminho.' }
$json = $report | ConvertTo-Json -Depth 6
$stream = [System.IO.File]::Open($OutputPath, [System.IO.FileMode]::CreateNew)
try {
 $bytes = (New-Object System.Text.UTF8Encoding($false)).GetBytes($json)
 $stream.Write($bytes, 0, $bytes.Length)
} finally { $stream.Dispose() }
Write-Host ('Diagnostico salvo em: ' + $OutputPath)
Write-Host 'Nenhum pedido ou configuracao foi alterado. Envie apenas o arquivo JSON para analise.'
