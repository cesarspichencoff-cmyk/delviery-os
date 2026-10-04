$ErrorActionPreference = "Stop"

$SqlServer = "(local)\SQLEXPRESS"
$Database = "teknisa"

$result = [ordered]@{
  schema = "deliveryos.tata-reader-cdarvprod-permission-rollback.review.v1"
  mode = "ROLLBACK_CDARVPROD_TO_NMPRODUTO_REVIEW_ONLY"
  captured_at = (Get-Date).ToString("o")
  status = "STARTED"
  transaction_committed = $false
  effects = [ordered]@{
    permission_change = $false
    database_row_read = $false
    database_write = $false
    service_change = $false
    print = $false
    fiscal_action = $false
    cutover = $false
  }
  error = $null
}

$conn=$null
$tx=$null
try {
  $conn = New-Object System.Data.SqlClient.SqlConnection (
    "Server=$SqlServer;Database=$Database;Integrated Security=SSPI;" +
    "Application Name=TataReaderCdArvProdPermissionRollbackReviewV1;Connect Timeout=5;" +
    "Encrypt=False;TrustServerCertificate=True"
  )
  $conn.Open()
  $tx=$conn.BeginTransaction()
  $cmd=$conn.CreateCommand()
  $cmd.Transaction=$tx
  $cmd.CommandTimeout=5
  $cmd.CommandText=@"
REVOKE SELECT ([CDARVPROD])
ON OBJECT::[TEKNISA].[PRODUTO]
FROM [NT SERVICE\TataComandaReader];

GRANT SELECT ([NMPRODUTO])
ON OBJECT::[TEKNISA].[PRODUTO]
TO [NT SERVICE\TataComandaReader];
"@
  $null=$cmd.ExecuteNonQuery()
  $tx.Commit()
  $tx=$null
  $result.transaction_committed=$true
  $result.effects.permission_change=$true
  $result.status="ROLLBACK_COMMITTED"
  $result|ConvertTo-Json -Depth 6
  exit 0
}
catch {
  if($null-ne $tx){try{$tx.Rollback()}catch{}}
  $result.status="ROLLBACK_FAILED"
  $result.error=[string]$_.Exception.Message
  $result|ConvertTo-Json -Depth 6
  exit 6
}
finally {
  if($null-ne $conn -and $conn.State-ne[System.Data.ConnectionState]::Closed){$conn.Close()}
}
