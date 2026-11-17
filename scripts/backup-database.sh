#!/usr/bin/env bash
# Created by Claude driven by Eddie Long on 2026-11-17.
#
# Backs up the database, then proves the backup can be restored.
#
#   scripts/backup-database.sh <source-url> <dump-file> [<scratch-admin-url>]
#
# 1. Counts the rows in the main tables.
# 2. Writes a pg_dump file. Sign-in tokens (session, magic_link) are left out:
#    they are not needed after a restore, and they are the most sensitive rows.
# 3. Counts again. Players can pay or pick while the dump runs.
# 4. If a scratch server is given, restores the dump into a new empty database
#    there, checks each table has a row count between the two counts, and
#    drops the scratch database. A backup nobody has restored is only a hope.
#
# The URLs hold passwords. This script never prints them. Use the direct
# (unpooled) Neon URL, because pg_dump does not work through a pooler.

set -euo pipefail

TABLES=(person competition team week fixture entry payment pick pick_override email_sent alert audit_log)

usage() {
    echo "Usage: $0 <source-url> <dump-file> [<scratch-admin-url>]" >&2
    exit 2
}

row_count() {
    local url=$1 table=$2
    psql "$url" --no-psqlrc --tuples-only --no-align --command "select count(*) from \"$table\""
}

counts_of() {
    local url=$1 table count
    for table in "${TABLES[@]}"; do
        # Assigned on its own line, so a failed query stops the script.
        count=$(row_count "$url" "$table")
        printf '%s=%s\n' "$table" "$count"
    done
}

value_of() {
    local counts=$1 table=$2
    printf '%s\n' "$counts" | sed -n "s/^${table}=//p"
}

if [[ $# -lt 2 || $# -gt 3 ]]; then
    usage
fi

source_url=$1
dump_file=$2
scratch_admin_url=${3:-}

before=$(counts_of "$source_url")

pg_dump \
    --format=custom \
    --no-owner \
    --no-privileges \
    --exclude-table-data=session \
    --exclude-table-data=magic_link \
    --file="$dump_file" \
    "$source_url"

# A dump that cannot even be listed is not a backup.
pg_restore --list "$dump_file" > /dev/null
echo "Wrote the dump: $(wc -c < "$dump_file" | tr -d ' ') bytes."

after=$(counts_of "$source_url")

if [[ -z $scratch_admin_url ]]; then
    echo "No scratch server given, so the restore check was skipped."
    exit 0
fi

scratch_name="lms_verify_$(date +%s)_$RANDOM"
scratch_url=$(printf '%s' "$scratch_admin_url" | sed -E "s#(://[^/]+)/[^?]*#\1/${scratch_name}#")

cleanup() {
    psql "$scratch_admin_url" --no-psqlrc --quiet --command "drop database if exists \"$scratch_name\" with (force)" || true
}
trap cleanup EXIT

psql "$scratch_admin_url" --no-psqlrc --quiet --command "create database \"$scratch_name\""
pg_restore --no-owner --no-privileges --exit-on-error --dbname="$scratch_url" "$dump_file"

restored=$(counts_of "$scratch_url")
failed=0
for table in "${TABLES[@]}"; do
    low=$(value_of "$before" "$table")
    high=$(value_of "$after" "$table")
    if (( low > high )); then
        swap=$low
        low=$high
        high=$swap
    fi

    got=$(value_of "$restored" "$table")
    if (( got < low || got > high )); then
        echo "MISMATCH in $table: restored $got rows, the live database had $low to $high." >&2
        failed=1
    else
        echo "OK $table: $got rows"
    fi
done

if (( failed != 0 )); then
    echo "The restore check failed. Do not trust this backup." >&2
    exit 1
fi

echo "The backup restores, and the row counts match."
