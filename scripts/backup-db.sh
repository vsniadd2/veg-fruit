#!/usr/bin/env sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
BACKUP_DIR="${ROOT_DIR}/backups"

TS="$(date +"%Y-%m-%d_%H-%M-%S")"
OUT_FILE="${BACKUP_DIR}/veg-fruit_${TS}.sql.gz"

mkdir -p "$BACKUP_DIR"

echo "Creating DB backup at: $OUT_FILE"

# Dumps DB from the postgres service container using its own env vars.
# Requires: docker + docker compose, and the stack must be running.
docker compose exec -T postgres sh -lc 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-privileges' | gzip -9 > "$OUT_FILE"

echo "Done."
