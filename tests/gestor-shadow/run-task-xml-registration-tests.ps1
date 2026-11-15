<#
.SYNOPSIS
  Contrato REAL da tarefa agendada do executor do Gestor, medido no Agendador do Windows,
  nao numa expressao regular.

.DESCRIPTION
  Fato que este teste fixa: o esquema XML do Agendador (task 1.4) nao tem o valor
  ServiceAccount para <LogonType>. Quem escolhe a conta de servico e o SID: com
  <UserId>S-1-5-18</UserId> (SYSTEM) e SEM <LogonType>, o Agendador registra a tarefa
  com LogonType=ServiceAccount (sessao 0, nao interativa: nenhuma janela no desktop).
  Com <LogonType>ServiceAccount</LogonType> no XML o registro e RECUSADO (medido no
  Foxxy em 15/11). Com a declaracao encoding="UTF-8" passada como texto, tambem
  (medido no CAIXA_MOOCA em 15/11).

  Modo padrao (fora do CAIXA_MOOCA, exige administrador; sem ele sai PULADO em voz alta
  e com codigo 3, nunca verde): registra tarefas DESATIVADAS em \DeliveryOS-CI\ com nome
  aleatorio, le de volta o que o Agendador gravou e as remove no fim, inclusive em falha.
    P1  XML publicado (declaracao retirada como faz o preparar-feed-do-gestor.ps1):
        registra; UserId SYSTEM, LogonType ServiceAccount, RunLevel Highest, desativada,
        nunca rodou, sem inicio sob demanda.
    N1  o mesmo XML com <LogonType>ServiceAccount</LogonType>: registro recusado.
    N2  o mesmo XML com a declaracao encoding="UTF-8": registro recusado.
    N3  o mesmo XML com <LogonType>InteractiveToken</LogonType> e usuario comum no lugar
        de SYSTEM: registra, mas NAO como ServiceAccount (controle: o teste distingue).

  -SomenteLeitura (o unico modo aceito no CAIXA_MOOCA): nao registra nada; le a tarefa de
  producao ja registrada e confere o mesmo contrato.
#>
[CmdletBinding()]
param(
  [switch]$SomenteLeitura,
  [string]$Xml
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
# PowerShell 5.1: $PSScriptRoot ainda e vazio no valor padrao de parametro.
if (-not $Xml) { $Xml = Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) '..\..\docs\operations\DeliveryOS-Itaim-Gestor-Demand-Feed.xml' }
$pasta = '\DeliveryOS-CI\'
$ok = 0; $falhas = New-Object System.Collections.Generic.List[string]
function Caso([string]$nome, [bool]$passou, [string]$detalhe) {
  if ($passou) { $script:ok++; Write-Output "PASS $nome" } else { $script:falhas.Add($nome); Write-Output "FAIL $nome :: $detalhe" }
}
function Contrato($t, [string]$rotulo) {
  $i = $t | Get-ScheduledTaskInfo
  # Pelo SID, nunca pelo nome: no Windows em portugues a conta se chama SISTEMA (medido no Foxxy).
  $sid = ''; try { $sid = (New-Object Security.Principal.NTAccount($t.Principal.UserId)).Translate([Security.Principal.SecurityIdentifier]).Value } catch { }
  Caso "$rotulo principal SYSTEM (S-1-5-18)" ($sid -eq 'S-1-5-18') "UserId=$($t.Principal.UserId) SID=$sid"
  Caso "$rotulo LogonType ServiceAccount (derivado do SID)" ([string]$t.Principal.LogonType -eq 'ServiceAccount') "LogonType=$($t.Principal.LogonType)"
  Caso "$rotulo RunLevel Highest" ([string]$t.Principal.RunLevel -eq 'Highest') "RunLevel=$($t.Principal.RunLevel)"
  Caso "$rotulo desativada" (-not $t.Settings.Enabled -and [string]$t.State -eq 'Disabled') "Enabled=$($t.Settings.Enabled) State=$($t.State)"
  Caso "$rotulo sem inicio sob demanda" (-not $t.Settings.AllowDemandStart) "AllowDemandStart=$($t.Settings.AllowDemandStart)"
  Caso "$rotulo nunca rodou" ($i.LastRunTime -lt [datetime]'2000-01-01') "LastRunTime=$($i.LastRunTime)"
  Caso "$rotulo uma acao, node direto" ((@($t.Actions).Count -eq 1) -and ($t.Actions[0].Execute -eq 'C:\Program Files\nodejs\node.exe')) "Execute=$($t.Actions[0].Execute)"
}

$bruto = [System.IO.File]::ReadAllText((Resolve-Path $Xml)).TrimStart([char]0xFEFF)
$semDeclaracao = $bruto -replace '^\s*<\?xml[^>]*\?>\s*', ''
$doc = [xml]$semDeclaracao
$pr = $doc.Task.Principals.Principal
Caso 'S1 XML: UserId S-1-5-18' ($pr.UserId -eq 'S-1-5-18') "UserId=$($pr.UserId)"
Caso 'S2 XML: sem elemento LogonType' ($null -eq $pr.SelectSingleNode('*[local-name()="LogonType"]')) 'LogonType presente'
Caso 'S3 XML: Settings Enabled=false' ($doc.Task.Settings.Enabled -eq 'false') "Enabled=$($doc.Task.Settings.Enabled)"

if ($SomenteLeitura) {
  $t = Get-ScheduledTask -TaskName 'DeliveryOS-Itaim-Gestor-Demand-Feed' -ErrorAction SilentlyContinue
  Caso 'R0 tarefa de producao registrada' ($null -ne $t) 'ausente'
  if ($t) { Contrato $t 'R' }
} else {
  if ($env:COMPUTERNAME -eq 'CAIXA_MOOCA') { throw 'No CAIXA_MOOCA este teste so roda com -SomenteLeitura: ele nao registra tarefa no caixa.' }
  $admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
  if (-not $admin) { Write-Output 'PULADO: registrar tarefa SYSTEM exige administrador. Nada foi medido (nao e verde).'; exit 3 }
  $criadas = New-Object System.Collections.Generic.List[string]
  function Registrar([string]$texto) {
    $nome = 'gestor-feed-' + [guid]::NewGuid().ToString('N').Substring(0, 10)
    $criadas.Add($nome)
    Register-ScheduledTask -TaskName $nome -TaskPath $pasta -Xml $texto | Out-Null
    return (Get-ScheduledTask -TaskName $nome -TaskPath $pasta)
  }
  try {
    $t = Registrar $semDeclaracao
    Contrato $t 'P1'
    $n1 = $semDeclaracao -replace '<UserId>S-1-5-18</UserId>', '<UserId>S-1-5-18</UserId><LogonType>ServiceAccount</LogonType>'
    $recusou = $false; try { [void](Registrar $n1) } catch { $recusou = $true }
    Caso 'N1 LogonType ServiceAccount no XML e recusado pelo Agendador' $recusou 'registrou'
    $n2 = '<?xml version="1.0" encoding="UTF-8"?>' + "`r`n" + $semDeclaracao
    $recusou = $false; try { [void](Registrar $n2) } catch { $recusou = $true }
    Caso 'N2 declaracao encoding UTF-8 como texto e recusada' $recusou 'registrou'
    $usuario = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    $n3 = $semDeclaracao -replace '<UserId>S-1-5-18</UserId>', "<UserId>$usuario</UserId><LogonType>InteractiveToken</LogonType>"
    $t3 = $null; try { $t3 = Registrar $n3 } catch { }
    Caso 'N3 controle: usuario interativo NAO vira ServiceAccount' ($null -ne $t3 -and [string]$t3.Principal.LogonType -ne 'ServiceAccount') "t3=$($null -ne $t3) LogonType=$(if ($t3) { $t3.Principal.LogonType })"
  } finally {
    foreach ($n in $criadas) { Unregister-ScheduledTask -TaskName $n -TaskPath $pasta -Confirm:$false -ErrorAction SilentlyContinue }
    $sobra = @(Get-ScheduledTask -TaskPath $pasta -ErrorAction SilentlyContinue)
    Caso 'L1 limpeza: nenhuma tarefa de teste sobrou' ($sobra.Count -eq 0) "sobraram $($sobra.Count)"
  }
}
Write-Output ("TOTAL ok={0} falhas={1}" -f $ok, $falhas.Count)
if ($falhas.Count) { exit 1 }
