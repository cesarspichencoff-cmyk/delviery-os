<#
.SYNOPSIS
  Medidor LOCAL de janelas (Frente C / DeliveryOS). Roda no Foxxy, NUNCA no CAIXA_MOOCA.
  Registra, a cada ~15 ms, toda janela de nivel superior que FICA VISIVEL e toda mudanca
  de janela em primeiro plano, com processo, classe, titulo e horario (ms).

.DESCRIPTION
  Objetivo: medir se uma rota de execucao abre ou pisca janela no desktop. O medidor roda
  LOCALMENTE (Bash/PowerShell do Foxxy). Quem dispara a rota medida e outro canal (p.ex.
  o conector remoto apontando para o FOXXY). O medidor so observa; nao inicia a rota.

  Metodo:
    1. Captura uma BASELINE das janelas de nivel superior ja visiveis (owner==0) em t0.
    2. Em laco ate -DurationSeconds, a cada -IntervalMs:
       - qualquer HWND de nivel superior visivel que NAO estava na baseline e ainda nao
         foi registrado vira um evento NEW_WINDOW (hwnd, pid, processo, classe, titulo, rect);
       - se a janela em primeiro plano mudar, vira um evento FOREGROUND_CHANGE.
    3. Grava os eventos em JSONL em -LogPath e um resumo no fim.

  Controle positivo (-PositiveControl): ~2 s apos o inicio, o proprio medidor abre de
  proposito um `cmd.exe /c timeout` com janela VISIVEL (WindowStyle Normal) e prova que o
  laco o captura como NEW_WINDOW. Serve so para calibrar o detector; nao mede rota nenhuma.

  Recusa de ambiente: aborta em CAIXA_MOOCA.

.NOTES
  So P/Invoke de leitura (EnumWindows, IsWindowVisible, GetForegroundWindow,
  GetWindowThreadProcessId, GetClassName, GetWindowText, GetWindowRect, GetWindow).
  Nenhuma escrita no desktop, registro, tarefa ou pedido.
#>
[CmdletBinding()]
param(
  [double]$DurationSeconds = 20,
  [int]$IntervalMs = 15,
  [string]$LogPath = (Join-Path $env:TEMP ("medir-janelas-{0:yyyyMMdd-HHmmss}.jsonl" -f (Get-Date))),
  [switch]$PositiveControl,
  # So leitura de janelas. No caixa, so com esta chave e NUNCA com -PositiveControl
  # (o controle positivo abre uma janela de proposito). Autorizado pelo Cesar em 15/11/2026
  # para medir a preparacao do feed do Gestor.
  [switch]$PermitirCaixa
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

if ($env:COMPUTERNAME -eq 'CAIXA_MOOCA' -and -not $PermitirCaixa) { throw 'No CAIXA_MOOCA o medidor so roda com -PermitirCaixa.' }
if ($env:COMPUTERNAME -eq 'CAIXA_MOOCA' -and $PositiveControl) { throw 'No CAIXA_MOOCA o controle positivo (janela visivel de proposito) e proibido.' }

Add-Type -TypeDefinition @'
  using System;
  using System.Text;
  using System.Collections.Generic;
  using System.Runtime.InteropServices;

  public static class WinProbe {
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr hWnd, StringBuilder s, int max);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowTextW(IntPtr hWnd, StringBuilder s, int max);
  [DllImport("user32.dll")] public static extern IntPtr GetWindow(IntPtr hWnd, uint uCmd);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT r);
  const uint GW_OWNER = 4;

  // hwnd|pid|class|title|w|h  for every visible, un-owned, top-level window with area>0
  public static string[] Snapshot() {
    List<string> list = new List<string>();
    EnumWindows(delegate(IntPtr h, IntPtr p) {
      if (!IsWindowVisible(h)) return true;
      if (GetWindow(h, GW_OWNER) != IntPtr.Zero) return true; // owned => not top-level surface
      RECT r; if (!GetWindowRect(h, out r)) return true;
      int w = r.R - r.L, ht = r.B - r.T;
      if (w <= 0 || ht <= 0) return true;
      uint pid; GetWindowThreadProcessId(h, out pid);
      StringBuilder c = new StringBuilder(256); GetClassName(h, c, 256);
      StringBuilder t = new StringBuilder(512); GetWindowTextW(h, t, 512);
      list.Add(h.ToInt64() + "|" + pid + "|" + c.ToString() + "|" + t.ToString().Replace("|"," ").Replace("\r"," ").Replace("\n"," ") + "|" + w + "|" + ht);
      return true;
    }, IntPtr.Zero);
    return list.ToArray();
  }

  public static string Foreground() {
    IntPtr h = GetForegroundWindow();
    if (h == IntPtr.Zero) return "0|0||";
    uint pid; GetWindowThreadProcessId(h, out pid);
    StringBuilder c = new StringBuilder(256); GetClassName(h, c, 256);
    StringBuilder t = new StringBuilder(512); GetWindowTextW(h, t, 512);
    return h.ToInt64() + "|" + pid + "|" + c.ToString() + "|" + t.ToString().Replace("|"," ").Replace("\r"," ").Replace("\n"," ");
  }
  }
'@

$procCache = @{}
function Resolve-ProcName([int]$procId) {
  if ($procId -le 0) { return '' }
  if ($procCache.ContainsKey($procId)) { return $procCache[$procId] }
  $name = ''
  try { $name = (Get-Process -Id $procId -ErrorAction Stop).ProcessName } catch { $name = 'UNKNOWN' }
  $procCache[$procId] = $name
  return $name
}

function Write-Event($obj) {
  ($obj | ConvertTo-Json -Compress -Depth 4) | Add-Content -LiteralPath $LogPath -Encoding utf8
}

$startIso = (Get-Date).ToString('o')
Write-Event @{ ev = 'START'; at = $startIso; machine = $env:COMPUTERNAME; durationSeconds = $DurationSeconds; intervalMs = $IntervalMs; positiveControl = [bool]$PositiveControl }

# Baseline: janelas ja visiveis antes de qualquer rota medida.
$baseline = New-Object System.Collections.Generic.HashSet[string]
foreach ($s in [WinProbe]::Snapshot()) { [void]$baseline.Add(($s -split '\|')[0]) }
$seen = New-Object System.Collections.Generic.HashSet[string]
$lastFg = [WinProbe]::Foreground()
Write-Event @{ ev = 'BASELINE'; count = $baseline.Count; foregroundHwnd = ($lastFg -split '\|')[0]; foregroundClass = ($lastFg -split '\|')[2] }

$sw = [System.Diagnostics.Stopwatch]::StartNew()
$deadlineMs = [int]($DurationSeconds * 1000)
$pcFired = $false
$newCount = 0; $fgCount = 0

while ($sw.ElapsedMilliseconds -lt $deadlineMs) {
  if ($PositiveControl -and -not $pcFired -and $sw.ElapsedMilliseconds -ge 2000) {
    $pcFired = $true
    # Janela VISIVEL de proposito (controle positivo). Normal => aparece no desktop.
    Start-Process -FilePath 'cmd.exe' -ArgumentList '/c','timeout /t 1 >NUL' -WindowStyle Normal | Out-Null
    Write-Event @{ ev = 'POSITIVE_CONTROL_LAUNCHED'; tMs = [int]$sw.ElapsedMilliseconds }
  }

  foreach ($s in [WinProbe]::Snapshot()) {
    $parts = $s -split '\|'
    $hwnd = $parts[0]
    if ($baseline.Contains($hwnd)) { continue }
    if ($seen.Contains($hwnd)) { continue }
    [void]$seen.Add($hwnd)
    $newCount++
    Write-Event @{ ev = 'NEW_WINDOW'; tMs = [int]$sw.ElapsedMilliseconds; at = (Get-Date).ToString('o');
      hwnd = $hwnd; pid = [int]$parts[1]; process = (Resolve-ProcName ([int]$parts[1]));
      class = $parts[2]; title = $parts[3]; w = [int]$parts[4]; h = [int]$parts[5] }
  }

  $fg = [WinProbe]::Foreground()
  if ($fg -ne $lastFg) {
    $lastFg = $fg
    $fgCount++
    $fp = $fg -split '\|'
    Write-Event @{ ev = 'FOREGROUND_CHANGE'; tMs = [int]$sw.ElapsedMilliseconds; at = (Get-Date).ToString('o');
      hwnd = $fp[0]; pid = [int]$fp[1]; process = (Resolve-ProcName ([int]$fp[1])); class = $fp[2]; title = $fp[3] }
  }

  Start-Sleep -Milliseconds $IntervalMs
}
$sw.Stop()
Write-Event @{ ev = 'END'; at = (Get-Date).ToString('o'); newWindows = $newCount; foregroundChanges = $fgCount; samples = [int]($sw.Elapsed.TotalMilliseconds / [Math]::Max(1,$IntervalMs)) }
Write-Output ("LOG=$LogPath NEW_WINDOWS=$newCount FOREGROUND_CHANGES=$fgCount")
