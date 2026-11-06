# SYNTHETIC oracle for Windows PowerShell 5.1 ConvertTo-Json.
# Never reads actual Reader, SQL, order files, printer or scheduler.
param([Parameter(Mandatory=$true)][string]$LabDir)
$ErrorActionPreference='Stop'
if($env:COMPUTERNAME -eq 'CAIXA_MOOCA' -or
 $PSVersionTable.PSEdition -ne 'Desktop' -or
 $PSVersionTable.PSVersion.Major -ne 5){throw 'PS51_WINDOWS_LAB_ONLY'}
$isCI=$env:GITHUB_ACTIONS -eq 'true' -and
 $env:GITHUB_REPOSITORY -eq 'cesarspichencoff-cmyk/delviery-os'
if(-not $isCI -and $env:COMPUTERNAME -ne 'FOXXY'){throw 'UNAUTHORIZED_MACHINE'}
$parent=if($isCI){$env:RUNNER_TEMP}else{$env:TEMP}
if([string]::IsNullOrWhiteSpace($parent)){throw 'NO_LAB_PARENT'}
$expected=[IO.Path]::GetFullPath((Join-Path $parent 'deliveryos-reader-ps51-oracle-lab'))
$received=[IO.Path]::GetFullPath($LabDir)
if($received.TrimEnd('\') -ne $expected.TrimEnd('\') -or
 !(Test-Path $received -PathType Container)){throw 'INVALID_LAB_DIR'}
$attr=(Get-Item -LiteralPath $received).Attributes
if(($attr -band [IO.FileAttributes]::ReparsePoint) -ne 0){throw 'REPARSE_POINT_DENIED'}
$marker=Join-Path $received 'LAB_ONLY.txt'
if(!(Test-Path $marker -PathType Leaf) -or
 (Get-Content $marker -Raw).Trim() -ne 'DELIVERYOS_READER_PS51_ORACLE_LAB_V1')
 {throw 'INVALID_LAB_MARKER'}
function Sha256Utf8([string]$s){
 $sha=[Security.Cryptography.SHA256]::Create()
 try{return [BitConverter]::ToString(
  $sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($s))).Replace('-','')}
 finally{$sha.Dispose()}
}
$cases=@(
 @{name='plain';value='LAB_PLAIN'},
 @{name='apostrophe';value="LAB_O'BRIEN"},
 @{name='angles';value='LAB_<tag>'},
 @{name='ampersand';value='LAB_A&B'},
 @{name='nel';value=('LAB'+[char]0x0085+'NEL')},
 @{name='line_separator';value=('LAB'+[char]0x2028+'LS')},
 @{name='paragraph_separator';value=('LAB'+[char]0x2029+'PS')},
 @{name='accent';value=('LAB_'+[char]0x00e7+[char]0x00e3+'O')},
 @{name='emoji';value=('LAB_'+[char]0xD83D+[char]0xDE80)},
 @{name='controls';value=('LAB_new'+[char]10+'_tab'+[char]9+'_backslash\and_quoted'+[char]34+'end')},
 @{name='combined';value=("LAB_A'&<X>"+[char]0x2028+[char]0x00e7)},
 @{name='no_notes';value='LAB_NO_NOTES'},
 @{name='null_fields';value='LAB_NULL_FIELDS'},
 @{name='multiple_items';value="LAB_EXTRA'ITEM"}
)
foreach($case in $cases){
 $name=[string]$case.name
 if($name -notmatch '^[a-z_]{1,30}$'){throw 'BAD_CASE_LABEL'}
 $items=@([ordered]@{
  NRPRODCOMVEN='LINE_1';CDPRODUTO='FICT_PRODUCT';CDARVPROD='9200001000';
  QTPRODCOMVEN='2.000';IDSTPRCOMVEN='4'
 })
 if($name -eq 'multiple_items'){
  $items+=([ordered]@{
   NRPRODCOMVEN='LINE_2';CDPRODUTO='FICT_PRODUCT_B';CDARVPROD='9200002000';
   QTPRODCOMVEN='1.000';IDSTPRCOMVEN='4'
  })
 }
 $notes=@([ordered]@{
  source_field='DSOBSPEDDIGCMD';scope_hint='item';item_index=0;
  CDPRODUTO='FICT_PRODUCT';join_proven=$true;value=[string]$case.value
 })
 if($name -eq 'no_notes'){$notes=@()}
 $order=[ordered]@{
  CDFILIAL='0001';CDLOJA='01';NRVENDAREST='FICT_SALE';
  NRCOMANDA='FICT_COMMAND';NRCOMANDAEXT='999';
  IDORGCMDVENDA='DLV_IFO';IDSTCOMANDA='3';
  DTHRABERMESA='2026-11-05T12:04:00.0000000';
  items=$items;observation_scan_complete=$true;observation_rows=$notes
 }
 if($name -eq 'null_fields'){
  $order.NRCOMANDAEXT=$null;$order.items[0].CDARVPROD=$null
 }
 $hashItems=@()
 foreach($item in $order.items){
  $hashItems+=([ordered]@{
   NRPRODCOMVEN=$item.NRPRODCOMVEN;CDPRODUTO=$item.CDPRODUTO;
   CDARVPROD=$item.CDARVPROD;QTPRODCOMVEN=$item.QTPRODCOMVEN;
   IDSTPRCOMVEN=$item.IDSTPRCOMVEN
  })
 }
 $basis=[ordered]@{
  CDFILIAL=$order.CDFILIAL;CDLOJA=$order.CDLOJA;
  NRVENDAREST=$order.NRVENDAREST;NRCOMANDA=$order.NRCOMANDA;
  NRCOMANDAEXT=$order.NRCOMANDAEXT;IDORGCMDVENDA=$order.IDORGCMDVENDA;
  IDSTCOMANDA=$order.IDSTCOMANDA;DTHRABERMESA=$order.DTHRABERMESA;
  items=$hashItems
 }
 if($order.observation_rows.Count -gt 0){
  $basis['observation_rows']=$order.observation_rows
 }
 $compact=$basis|ConvertTo-Json -Depth 12 -Compress
 $event=[ordered]@{
  schema='deliveryos.tata-reader-stable-order-event.v1';
  order_key='0001|01|FICT_SALE|FICT_COMMAND';
  snapshot_hash=(Sha256Utf8 $compact);order=$order
 }
 $payload=$event|ConvertTo-Json -Depth 20 -Compress
 $target=Join-Path $received ($name+'.json')
 [IO.File]::WriteAllText($target,$payload,(New-Object Text.UTF8Encoding($false)))
}
Write-Output ('PS51_SYNTHETIC_ORACLE_CREATED '+$cases.Count+'/'+$cases.Count)
