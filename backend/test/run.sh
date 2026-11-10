#!/usr/bin/env bash
# Sobe o Postgres de teste, roda o Jest e encerra o banco.
cd "$(dirname "$0")/.."
node test/pg-server.mjs 54331 > /tmp/pg-server.log 2>&1 &
PGPID=$!
trap 'kill $PGPID 2>/dev/null' EXIT
for i in $(seq 1 60); do grep -q READY /tmp/pg-server.log && break; sleep 1; done
export DATABASE_URL="$(grep READY /tmp/pg-server.log | cut -d' ' -f2)"
export DIRECT_URL="$DATABASE_URL"
npx jest "$@"
