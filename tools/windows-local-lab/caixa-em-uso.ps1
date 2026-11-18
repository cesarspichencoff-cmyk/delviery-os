<#
.SYNOPSIS
  SOMENTE LEITURA: o caixa esta sendo usado agora? Relata ha quantos segundos houve a ultima
  entrada de teclado ou mouse na sessao interativa (GetLastInputInfo), qual janela esta em
  primeiro plano (processo e classe, nunca o titulo: pode ter nome de cliente) e a hora local.
  Nao grava nada (salvo -Saida), nao move o mouse, nao toca janela nenhuma.

.DESCRIPTION
  -MinimoOciosoSeg N   o resultado traz "ocioso": true so se a ultima entrada for mais antiga
                       que N segundos (padrao 600).
  Codigo de saida: 0 ocioso, 4 em uso, 5 sem sessao interativa legivel (nunca vira ocioso).
#>
[CmdletBinding()]
param([int]$MinimoOciosoSeg = 600, [string]$Saida)
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System; using System.Runtime.InteropServices; using System.Text;
public static class Ocio {
  [StructLayout(LayoutKind.Sequential)] public struct LASTINPUTINFO { public uint cbSize; public uint dwTime; }
  [DllImport("user32.dll")] public static extern bool GetLastInputInfo(ref LASTINPUTINFO p);
  [DllImport("kernel32.dll")] public static extern ulong GetTickCount64();
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr h, StringBuilder s, int max);
  public static long OciosoMs() {
    LASTINPUTINFO i = new LASTINPUTINFO(); i.cbSize = (uint)Marshal.SizeOf(i);
    if (!GetLastInputInfo(ref i)) return -1;
    // dwTime e o GetTickCount de 32 bits da ultima entrada; compara pelos 32 bits baixos.
    uint agora = (uint)(GetTickCount64() & 0xFFFFFFFF);
    return (long)(uint)(agora - i.dwTime);
  }
}
'@
$ms = [Ocio]::OciosoMs()
$fg = [Ocio]::GetForegroundWindow()
$pidFg = [uint32]0; [void][Ocio]::GetWindowThreadProcessId($fg, [ref]$pidFg)
$cls = New-Object System.Text.StringBuilder 256; [void][Ocio]::GetClassName($fg, $cls, 256)
$proc = ''; try { $proc = (Get-Process -Id $pidFg -ErrorAction Stop).ProcessName } catch { $proc = 'UNKNOWN' }
$sessao = (Get-Process -Id $PID).SessionId
$out = [ordered]@{
  schema = 'deliveryos.caixa-em-uso.v1'; maquina = $env:COMPUTERNAME; horaLocal = (Get-Date).ToString('o'); sessao = $sessao
  ociosoSeg = $(if ($ms -ge 0) { [int]($ms / 1000) } else { $null }); minimoOciosoSeg = $MinimoOciosoSeg
  primeiroPlano = [ordered]@{ processo = $proc; classe = $cls.ToString() }
  ocioso = ($ms -ge 0 -and $sessao -ne 0 -and ($ms / 1000) -ge $MinimoOciosoSeg)
}
$json = $out | ConvertTo-Json -Depth 4
if ($Saida) { [System.IO.File]::AppendAllText($Saida, (($out | ConvertTo-Json -Compress -Depth 4) + "`n"), (New-Object System.Text.UTF8Encoding($false))) }
$json
if ($ms -lt 0 -or $sessao -eq 0) { exit 5 }
if (-not $out.ocioso) { exit 4 }
exit 0
