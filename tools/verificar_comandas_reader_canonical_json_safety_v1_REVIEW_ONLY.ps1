# Pure adversarial safety checks, isolated Foxxy. No reader/SQL/printing.
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'comandas_reader_canonical_json_v1_REVIEW_ONLY.ps1')
$script:passes=0
function Expect-Exact([string]$name,$obj,[string]$expected){
 $s=ConvertTo-TataCanonicalJsonV1 -Value $obj
 if($s -cne $expected){throw ("SERIALIZATION_NOT_EXACT:"+$name)}
 $script:passes++
}
function Expect-Fail([string]$name,$obj){
 $failed=$false
 try{$null=ConvertTo-TataCanonicalJsonV1 -Value $obj}catch{$failed=$true}
 if(-not $failed){throw ("UNSAFE_OBJECT_ACCEPTED:"+$name)}
 $script:passes++
}
Expect-Exact 'max_safe_integer' ([ordered]@{n=[long]9007199254740991}) '{"n":9007199254740991}'
Expect-Exact 'min_safe_integer' ([ordered]@{n=[long]-9007199254740991}) '{"n":-9007199254740991}'
Expect-Exact 'array_bool_null' ([ordered]@{xs=@($true,$false,$null,1)}) '{"xs":[true,false,null,1]}'
Expect-Fail 'over_max_safe_integer' ([ordered]@{n=[long]9007199254740992})
Expect-Fail 'below_min_safe_integer' ([ordered]@{n=[long]-9007199254740992})
Expect-Fail 'over_max_safe_unsigned' ([ordered]@{n=[uint64]9007199254740992})
Expect-Fail 'unordered_dictionary' @{n='UNORDERED'}
Expect-Fail 'arbitrary_object' ([ordered]@{n=[datetime]'2026-11-03T18:00:00'})
Expect-Fail 'unpaired_high_surrogate' ([ordered]@{v=[string][char]0xD800})
Expect-Fail 'unpaired_low_surrogate' ([ordered]@{v=[string][char]0xDC00})
if($script:passes -ne 10){throw 'SAFETY_CHECK_COUNT_MISMATCH'}
'READER_CANONICAL_JSON_SAFETY_PASS 10/10 PURE_OFFLINE'
