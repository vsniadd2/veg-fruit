$ErrorActionPreference = "Stop"

$RootDir = Resolve-Path (Join-Path $PSScriptRoot "..")
$BackupDir = Join-Path $RootDir "backups"

New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null

$ts = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$outFile = Join-Path $BackupDir ("veg-fruit_{0}.sql.gz" -f $ts)

Write-Host ("Creating DB backup at: {0}" -f $outFile)

# Dumps DB from the postgres service container using its own env vars.
# Requires: docker + docker compose, and the stack must be running.
# Note: we gzip inside the container, so Windows doesn't need gzip installed.
docker compose exec -T postgres sh -lc 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-privileges | gzip -9' > $outFile
if ($LASTEXITCODE -ne 0) { throw "pg_dump failed" }

Write-Host "Done."
