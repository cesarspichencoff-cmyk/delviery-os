$ErrorActionPreference='Stop'
if($env:COMPUTERNAME -eq 'CAIXA_MOOCA'){throw 'ISOLATED_WINDOWS_ONLY'}
$repo=(Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
foreach($name in @('sql-source.ps1')){
 $tokens=$null;$parseErrors=$null
 [void][Management.Automation.Language.Parser]::ParseFile((Join-Path $repo ('runtime/reader-v3/'+$name)),[ref]$tokens,[ref]$parseErrors)
 if($parseErrors.Count -gt 0){throw 'POWERSHELL_51_PARSE_FAILED'}
}
# Reuse the already inspected native window detector, without executing its loop.
$monitor=[IO.File]::ReadAllText((Join-Path $repo 'tools/windows-local-lab/medir-janelas.ps1'))
$type=[regex]::Match($monitor,"(?s)Add-Type -TypeDefinition @'\r?\n(.*?)\r?\n'@").Groups[1].Value
if(-not $type){throw 'WINDOW_DETECTOR_MISSING'};Add-Type -TypeDefinition $type
# Positive detector control exists only on the isolated CI desktop.
Add-Type -AssemblyName System.Windows.Forms
$form=New-Object Windows.Forms.Form;$form.Text='READER_V3_FICTIONAL_CONTROL';$form.Show();[Windows.Forms.Application]::DoEvents()
if(-not (@([WinProbe]::Snapshot()|Where-Object{$_ -match 'READER_V3_FICTIONAL_CONTROL'}).Count)){throw 'WINDOW_CONTROL_NOT_DETECTED'}
$form.Close();$form.Dispose()
$baseline=@{};foreach($s in [WinProbe]::Snapshot()){$baseline[($s -split '\|')[0]]=$true}
$foreground=[WinProbe]::Foreground();$newWindows=0;$foregroundChanges=0
$psi=New-Object Diagnostics.ProcessStartInfo
$psi.FileName=(Get-Command node.exe).Source;$psi.Arguments='"'+(Join-Path $PSScriptRoot 'windows-transport.cjs')+'"'
$psi.UseShellExecute=$false;$psi.CreateNoWindow=$true;$psi.WindowStyle='Hidden';$psi.RedirectStandardOutput=$true;$psi.RedirectStandardError=$true
$p=New-Object Diagnostics.Process;$p.StartInfo=$psi;[void]$p.Start();$watch=[Diagnostics.Stopwatch]::StartNew()
while(-not $p.HasExited -and $watch.Elapsed.TotalSeconds -lt 20){
 foreach($s in [WinProbe]::Snapshot()){if(-not $baseline.ContainsKey(($s -split '\|')[0])){$newWindows++}}
 if([WinProbe]::Foreground() -ne $foreground){$foregroundChanges++}
 Start-Sleep -Milliseconds 15
}
if(-not $p.HasExited){$p.Kill();throw 'TRANSPORT_DEADLINE'}
$out=$p.StandardOutput.ReadToEnd();$err=$p.StandardError.ReadToEnd();$p.WaitForExit()
if($p.ExitCode -ne 0 -or $out -notmatch 'POWERSHELL_51_TRANSPORT_PASS'){throw ('TRANSPORT_FAILED '+$err)}
if($newWindows -ne 0 -or $foregroundChanges -ne 0){throw 'VISIBLE_WINDOW_OR_FOCUS_CHANGE'}
[ordered]@{state='WINDOWS_51_PASS';positive_control=$true;new_visible_windows=$newWindows;foreground_changes=$foregroundChanges;duration_ms=$watch.ElapsedMilliseconds;scope='ISOLATED_CI_ONLY'}|ConvertTo-Json -Compress
