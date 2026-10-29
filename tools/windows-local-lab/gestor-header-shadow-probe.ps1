# Ensaio pontual de OCR local. Nao instala coletor nem alimenta pedidos.
[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
if ($env:COMPUTERNAME -ne 'CAIXA_MOOCA') { throw 'Este ensaio foi autorizado apenas para CAIXA_MOOCA.' }
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Media.Ocr.OcrEngine,Windows.Foundation,ContentType=WindowsRuntime]
$null = [Windows.Storage.StorageFile,Windows.Storage,ContentType=WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapDecoder,Windows.Foundation,ContentType=WindowsRuntime]
$engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
if ($null -eq $engine) { throw 'OCR local indisponivel.' }
$asyncMethod = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
 $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetGenericArguments().Count -eq 1 -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
} | Select-Object -First 1
function Await-Local($Operation, [Type]$ResultType) {
 $task = $asyncMethod.MakeGenericMethod($ResultType).Invoke($null,@($Operation))
 if (-not $task.Wait(10000)) { throw 'Tempo limite de OCR local.' }
 return $task.Result
}
Add-Type -TypeDefinition @'
using System; using System.Runtime.InteropServices;
public class GestorShadowWindow {
 [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
 [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left,Top,Right,Bottom; }
 [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h,out RECT r);
 [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h,IntPtr dc,uint f);
 [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
 [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr h,int c);
}
'@
[void][GestorShadowWindow]::SetProcessDPIAware()
$targets = @(Get-Process -Name 'Gestor de Pedidos' | Where-Object { $_.MainWindowHandle -ne 0 })
if ($targets.Count -ne 1) { throw 'Janela do Gestor ausente ou ambigua.' }
$handle = $targets[0].MainWindowHandle
$wasMinimized = [GestorShadowWindow]::IsIconic($handle)
$tempFile = Join-Path $env:TEMP ('deliveryos-header-' + [Guid]::NewGuid().ToString('N') + '.png')
$results = @()
try {
 if ($wasMinimized) {
  [void][GestorShadowWindow]::ShowWindowAsync($handle,9)
  Start-Sleep -Milliseconds 800
 }
 if ([GestorShadowWindow]::IsIconic($handle)) { throw 'Janela ainda minimizada.' }
 foreach ($sample in @('observed_1','observed_2','blank_negative_control')) {
  $watch = [Diagnostics.Stopwatch]::StartNew()
  $observedAt = (Get-Date).ToUniversalTime().ToString('o')
  $rect = New-Object GestorShadowWindow+RECT
  if (-not [GestorShadowWindow]::GetWindowRect($handle,[ref]$rect)) { throw 'Janela indisponivel.' }
  $width=$rect.Right-$rect.Left; $height=$rect.Bottom-$rect.Top
  # Geometria qualificada no ensaio: nao adivinhar regiao apos mudar layout/DPI.
  if ($width -ne 1920 -or $height -ne 1008) { throw 'Geometria diferente da observada; requalificar recorte.' }
  $bitmap = New-Object System.Drawing.Bitmap($width,$height)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  try {
   if ($sample -eq 'blank_negative_control') { $graphics.Clear([System.Drawing.Color]::White) }
   else {
    $dc=$graphics.GetHdc()
    try { $captured=[GestorShadowWindow]::PrintWindow($handle,$dc,2) } finally { $graphics.ReleaseHdc($dc) }
    if (-not $captured) { throw 'Falha de captura.' }
   }
   $crop=$bitmap.Clone([System.Drawing.Rectangle]::new(0,0,1920,240),$bitmap.PixelFormat)
   try { $crop.Save($tempFile,[System.Drawing.Imaging.ImageFormat]::Png) } finally { $crop.Dispose() }
  } finally { $graphics.Dispose(); $bitmap.Dispose() }
  $file = Await-Local ([Windows.Storage.StorageFile]::GetFileFromPathAsync($tempFile)) ([Windows.Storage.StorageFile])
  $stream = Await-Local ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
  try {
   $decoder=Await-Local ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
   $software=Await-Local ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
   try { $ocr=Await-Local ($engine.RecognizeAsync($software)) ([Windows.Media.Ocr.OcrResult]) } finally { $software.Dispose() }
  } finally { $stream.Dispose() }
  $text=$ocr.Text -replace '\s+',' '
  $open=$text -match '(?i)Loja aberta'; $closed=$text -match '(?i)Loja fechada'
  $storeState='unknown'; if($open -and -not $closed){$storeState='open'};if($closed -and -not $open){$storeState='closed'}
  $results += [pscustomobject]@{
   sample=$sample;observed_at=$observedAt;elapsed_ms=$watch.ElapsedMilliseconds
   source='gestor_header_ocr_probe';mode='shadow';unit_identity='unknown'
   store_state=$storeState;turbo_notice=$(if($text -match '(?i)Turbo foi desabilitada'){'disabled_notice_detected'}else{'unknown'})
   order_capture=$false;operational_ingestion=$false
  }
  $text=$null; $ocr=$null
 }
 $results | ConvertTo-Json -Depth 4
} finally {
 if(Test-Path -LiteralPath $tempFile){Remove-Item -LiteralPath $tempFile -Force}
 if($wasMinimized){[void][GestorShadowWindow]::ShowWindowAsync($handle,6)}
}
