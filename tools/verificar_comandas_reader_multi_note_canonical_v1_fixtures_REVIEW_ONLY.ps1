# Offline-only 2-items/3-notes PowerShell writer-side reference.
# Source is synthetic, no SQL, host access or print.
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'comandas_reader_canonical_json_v1_REVIEW_ONLY.ps1')
$basis=[ordered]@{
 CDFILIAL='0001';CDLOJA='01';NRVENDAREST='TESTSALE';NRCOMANDA='TESTCMD'
 NRCOMANDAEXT='1234';IDORGCMDVENDA='DLV_IFO';IDSTCOMANDA='3'
 DTHRABERMESA='2026-11-03T18:30:00.0000000'
 items=@(
  [ordered]@{NRPRODCOMVEN='LINE01';CDPRODUTO='PROD01';CDARVPROD='9200001000';QTPRODCOMVEN='2.000';IDSTPRCOMVEN='4'},
  [ordered]@{NRPRODCOMVEN='LINE02';CDPRODUTO='PROD02';CDARVPROD='9200002000';QTPRODCOMVEN='1.000';IDSTPRCOMVEN='4'}
 )
 observation_rows=@(
  [ordered]@{source_field='DSOBSPEDDIGCMD';value='SEM CEBOLINHA';scope_hint='item';join_proven=$true;item_index=0;CDPRODUTO='PROD01'},
  [ordered]@{source_field='TXPRODCOMVEN';value="L'IMITADO";scope_hint='item';join_proven=$true;item_index=1;CDPRODUTO='PROD02'},
  [ordered]@{source_field='DSOBSCOMANDA';value='TESTE FICTICIO';scope_hint='order';join_proven=$true}
 )
}
$json=ConvertTo-TataCanonicalJsonV1 -Value $basis
$sha=Get-TataCanonicalSha256V1 -Value $basis
[pscustomobject]@{sha256=$sha;canonical_b64=[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($json))}|ConvertTo-Json -Compress
