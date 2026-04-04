#!/bin/bash
set -e
# Remove comments, empty lines, then join multi-line statements into single lines
sed "s/--.*$//; /^[[:space:]]*$/d" /opt/seed_with_bugs.sql \
  | awk '{if(/;[[:space:]]*$/) {printf "%s\n", buf $0; buf=""} else {buf=buf $0 " "}}' \
  > /tmp/seed_clean.sql
clickhouse-client --user "$CLICKHOUSE_USER" --password "$CLICKHOUSE_PASSWORD" --database "$CLICKHOUSE_DB" --queries-file /tmp/seed_clean.sql
