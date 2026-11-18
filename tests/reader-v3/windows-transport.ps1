$ErrorActionPreference='Stop'
while($null -ne ($line=[Console]::ReadLine())){
 $q=$line|ConvertFrom-Json
 $dates=@();foreach($n in @('after','until')){
  $text=if($q.$n -is [datetime]){$q.$n.ToString('yyyy-MM-ddTHH:mm:ss.fff',[Globalization.CultureInfo]::InvariantCulture)}else{[string]$q.$n}
  $dates += [datetime]::ParseExact($text,[string[]]@('yyyy-MM-ddTHH:mm:ss','yyyy-MM-ddTHH:mm:ss.fff'),[Globalization.CultureInfo]::InvariantCulture,[Globalization.DateTimeStyles]::None).ToString('yyyy-MM-ddTHH:mm:ss.fff')
 }
 [Console]::WriteLine((@{ok=$true;value=@{version=$PSVersionTable.PSVersion.Major;dates=$dates}}|ConvertTo-Json -Compress -Depth 5))
}
