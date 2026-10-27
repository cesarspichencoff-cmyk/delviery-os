param([Parameter(Mandatory=$true)][string]$InstallerPath)
$ErrorActionPreference='Stop'
$tokens=$null;$errors=$null
$ast=[Management.Automation.Language.Parser]::ParseFile($InstallerPath,[ref]$tokens,[ref]$errors)
if($errors.Count){throw 'INSTALLER_PARSE_FAILED'}
$f=@($ast.FindAll({param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq 'Write-AtomicBytes'},$true))
if($f.Count -ne 1){throw 'ATOMIC_FUNCTION_REQUIRED'}
. ([scriptblock]::Create($f[0].Extent.Text))
$work=Join-Path ([IO.Path]::GetTempPath()) ('weekly-atomic-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $work|Out-Null
try {
  $p=Join-Path $work 'candidate.json';$first=[byte[]]@(1,2,3);$second=[byte[]]@(4,5,6,7)
  Write-AtomicBytes $p $first
  if([BitConverter]::ToString([IO.File]::ReadAllBytes($p)) -ne '01-02-03'){throw 'CREATE_FAILED'}
  Write-AtomicBytes $p $second
  if([BitConverter]::ToString([IO.File]::ReadAllBytes($p)) -ne '04-05-06-07'){throw 'REPLACE_FAILED'}
  Write-AtomicBytes $p $first
  if([BitConverter]::ToString([IO.File]::ReadAllBytes($p)) -ne '01-02-03'){throw 'RESTORE_FAILED'}
  if(@(Get-ChildItem -LiteralPath $work -File).Count -ne 1){throw 'UNEXPECTED_TEMP_FILES'}
  'WEEKLY_INSTALL_ATOMIC_PASS 3; TEMP_FILES_ONLY; NO_SERVICE_EFFECT'
}finally{Remove-Item -LiteralPath $work -Recurse -Force}
