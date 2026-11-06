#!/usr/bin/env bash
# Runs supabase/tests/leads.test.sql against a temporary local Postgres (needs postgres 14+ binaries).
set -euo pipefail
PGBIN=$(ls -d /usr/lib/postgresql/*/bin | sort -V | tail -1)
DIR=$(mktemp -d); chmod 777 "$DIR"
RUN="$PGBIN/pg_ctl"
if [ "$(id -u)" = "0" ]; then AS="su postgres -c"; else AS="bash -c"; fi
$AS "$PGBIN/initdb -D $DIR/data -A trust >/dev/null"
$AS "$PGBIN/pg_ctl -D $DIR/data -o '-p 54399 -k $DIR' -l $DIR/log -w start >/dev/null"
trap '$AS "$PGBIN/pg_ctl -D $DIR/data -m immediate stop >/dev/null" || true; rm -rf "$DIR"' EXIT
PSQL="psql -h $DIR -p 54399 -U postgres -v ON_ERROR_STOP=1 -q"
$PSQL -d postgres -c "create role anon; create role authenticated; create role service_role;"
$PSQL -d postgres -f supabase/migrations/20261106000000_leads.sql
$PSQL -d postgres -f supabase/tests/leads.test.sql | grep -E "passed|FAILED" || true
