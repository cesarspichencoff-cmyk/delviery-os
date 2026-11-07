# Offline fixture-only cross-language byte comparison; does not read native files.
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'comandas_reader_canonical_json_v1_REVIEW_ONLY.ps1')
function MakeFixture([string]$name,[AllowNull()][string]$note){
  $basis=[ordered]@{
    CDFILIAL='0001';CDLOJA='01';NRVENDAREST='FAKESALE1';NRCOMANDA='FAKECMD1';
    NRCOMANDAEXT='1234';IDORGCMDVENDA='DLV_IFO';IDSTCOMANDA='3';
    DTHRABERMESA='2026-11-03T18:20:00.0000000';
    items=@([ordered]@{
      NRPRODCOMVEN='LINE01';CDPRODUTO='PROD01';CDARVPROD='9200001000';
      QTPRODCOMVEN='2.000';IDSTPRCOMVEN='4'
    })
  }
  if($name -ne 'no_note'){
    $basis['observation_rows']=@([ordered]@{
      source_field='DSOBSPEDDIGCMD';value=$note;scope_hint='item';
      join_proven=$true;item_index=0;CDPRODUTO='PROD01'
    })
  }
  $json=ConvertTo-TataCanonicalJsonV1 -Value $basis
  $sha=Get-TataCanonicalSha256V1 -Value $basis
  [pscustomobject]@{case=$name;json_b64=[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($json));sha=$sha}
}
$rows=@()
$rows+=MakeFixture 'no_note' $null
$rows+=MakeFixture 'ascii' 'NO ONION'
$rows+=MakeFixture 'accent' ('SEM '+[char]0x00C7+'EBOLA')
$rows+=MakeFixture 'apostrophe' "L'IMITADO"
$rows+=MakeFixture 'double_quote' ('SEM '+[char]0x22+'CEBOLA'+[char]0x22)
$rows+=MakeFixture 'backslash' 'NO\TEA'
$rows+=MakeFixture 'slashes' 'A/B C/D'
$rows+=MakeFixture 'angle_and_ampersand' '< & >'
$rows+=MakeFixture 'em_dash' ('A'+[char]0x2014+'B')
$rows+=MakeFixture 'emoji' ([char]::ConvertFromUtf32(0x1F363))
$rows+=MakeFixture 'line_separator' ('A'+[char]0x2028+'B')
$rows+=MakeFixture 'paragraph_separator' ('A'+[char]0x2029+'B')
$rows+=MakeFixture 'combining_mark' ('A'+[char]0x0301+'B')
$rows+=MakeFixture 'tab' ('A'+[char]0x0009+'B')
$rows+=MakeFixture 'newline' ('A'+[char]0x000A+'B')
$rows+=MakeFixture 'nul' ('A'+[char]0x0000+'B')
@($rows)|ConvertTo-Json -Depth 4 -Compress
