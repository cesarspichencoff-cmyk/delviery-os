param(
  [string]$Server = "192.168.0.24\SQLEXPRESS",
  [string]$Database = "teknisa"
)

$ErrorActionPreference = "Stop"

# Metadata-only inventory.
# No EXECUTE AS, no order reads, no application tables, no permission changes.
# Principal names are hashed before output.

$result = [ordered]@{
  schema = "deliveryos.shadow.sql-principal-inventory.v1"
  mode = "WINDOWS_SSPI_METADATA_ONLY"
  connected = $false
  database_matches = $false
  candidates = @()
  effects = [ordered]@{
    order_rows_read = $false
    customer_rows_read = $false
    credentials_read = $false
    database_write = $false
    permission_change = $false
    impersonation = $false
  }
  blocker = $null
}

$connString =
  "Server=$Server;Database=$Database;Integrated Security=SSPI;" +
  "Application Name=DeliveryOSShadowPrincipalInventory;Connect Timeout=5;" +
  "Encrypt=False;TrustServerCertificate=True"

$conn = New-Object System.Data.SqlClient.SqlConnection $connString

function Hash-Id([string]$value) {
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try {
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($Database + "|" + $value)
    $hash = $sha.ComputeHash($bytes)
    return ([System.BitConverter]::ToString($hash).Replace("-", "").Substring(0, 20))
  }
  finally {
    $sha.Dispose()
  }
}

try {
  $conn.Open()
  $result.connected = $true

  $dbCmd = $conn.CreateCommand()
  $dbCmd.CommandText = "SELECT CASE WHEN DB_NAME() = @db THEN 1 ELSE 0 END;"
  $null = $dbCmd.Parameters.Add("@db", [System.Data.SqlDbType]::NVarChar, 128)
  $dbCmd.Parameters["@db"].Value = $Database
  $result.database_matches = ([int]$dbCmd.ExecuteScalar() -eq 1)

  if (-not $result.database_matches) {
    $result.blocker = "DATABASE_MISMATCH"
  }
  else {
    $cmd = $conn.CreateCommand()
    $cmd.CommandText = @"
SET NOCOUNT ON;
SELECT
  p.principal_id,
  p.name,
  p.type_desc,
  p.authentication_type_desc,
  r.name AS role_name,
  dp.state_desc,
  dp.permission_name,
  dp.class_desc
FROM sys.database_principals p
LEFT JOIN sys.database_role_members drm
  ON drm.member_principal_id = p.principal_id
LEFT JOIN sys.database_principals r
  ON r.principal_id = drm.role_principal_id
LEFT JOIN sys.database_permissions dp
  ON dp.grantee_principal_id = p.principal_id
WHERE p.is_fixed_role = 0
  AND p.principal_id > 4
  AND p.name NOT IN ('dbo','guest','INFORMATION_SCHEMA','sys')
ORDER BY p.principal_id, r.name, dp.permission_name;
"@

    $reader = $cmd.ExecuteReader()
    $byPrincipal = @{}

    while ($reader.Read()) {
      $name = [string]$reader["name"]
      $pid = [int]$reader["principal_id"]
      $key = [string]$pid

      if (-not $byPrincipal.ContainsKey($key)) {
        $byPrincipal[$key] = [ordered]@{
          candidate_id = Hash-Id ([string]$pid + "|" + $name)
          principal_type = [string]$reader["type_desc"]
          authentication_type = [string]$reader["authentication_type_desc"]
          roles = New-Object System.Collections.Generic.HashSet[string]
          explicit_permissions = New-Object System.Collections.Generic.HashSet[string]
        }
      }

      if (-not ($reader["role_name"] -is [DBNull])) {
        $null = $byPrincipal[$key].roles.Add([string]$reader["role_name"])
      }

      if (-not ($reader["permission_name"] -is [DBNull])) {
        $perm = ([string]$reader["state_desc"]) + ":" +
                ([string]$reader["class_desc"]) + ":" +
                ([string]$reader["permission_name"])
        $null = $byPrincipal[$key].explicit_permissions.Add($perm)
      }
    }
    $reader.Close()

    foreach ($entry in $byPrincipal.Values) {
      $roles = @($entry.roles | Sort-Object)
      $perms = @($entry.explicit_permissions | Sort-Object)

      $writeRole = @(
        "db_owner",
        "db_datawriter",
        "db_ddladmin",
        "db_securityadmin",
        "db_accessadmin"
      ) | Where-Object { $roles -contains $_ }

      $broadRead = ($roles -contains "db_datareader")
      $explicitWrite = @($perms | Where-Object {
        $_ -match ":(INSERT|UPDATE|DELETE|ALTER|CONTROL|TAKE OWNERSHIP|EXECUTE)$"
      }).Count -gt 0

      $result.candidates += [ordered]@{
        candidate_id = $entry.candidate_id
        principal_type = $entry.principal_type
        authentication_type = $entry.authentication_type
        roles = $roles
        explicit_permission_count = $perms.Count
        has_write_role = ($writeRole.Count -gt 0)
        has_db_datareader = $broadRead
        has_explicit_write_or_execute = $explicitWrite
        status = if ($writeRole.Count -gt 0 -or $explicitWrite) {
          "REJECT"
        } elseif ($broadRead) {
          "READONLY_BUT_BROAD_CANDIDATE"
        } else {
          "NEEDS_ADMIN_CONFIRMATION"
        }
      }
    }
  }
}
catch {
  $result.blocker = "METADATA_INVENTORY_FAILED"
}
finally {
  if ($conn.State -ne [System.Data.ConnectionState]::Closed) {
    $conn.Close()
  }
}

$result | ConvertTo-Json -Depth 10
