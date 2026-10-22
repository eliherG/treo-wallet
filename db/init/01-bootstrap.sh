#!/usr/bin/env bash
set -Eeuo pipefail

: "${POSTGRES_USER:?POSTGRES_USER is required}"
: "${TREO_APP_PASSWORD:?TREO_APP_PASSWORD is required}"
: "${TREO_MIGRATOR_PASSWORD:?TREO_MIGRATOR_PASSWORD is required}"

# This script runs ONLY while the PostgreSQL data directory is initialized.
# Passwords are quoted by psql's :'variable' substitution, never embedded in SQL.
psql --username "$POSTGRES_USER" --dbname postgres --set=ON_ERROR_STOP=1 \
  --set=app_password="$TREO_APP_PASSWORD" \
  --set=migrator_password="$TREO_MIGRATOR_PASSWORD" <<'SQL'
CREATE ROLE treo_migrator LOGIN PASSWORD :'migrator_password';
CREATE ROLE treo_app LOGIN PASSWORD :'app_password';

CREATE DATABASE treo_dev OWNER treo_migrator;
CREATE DATABASE treo_test OWNER treo_migrator;

REVOKE ALL ON DATABASE treo_dev FROM PUBLIC;
REVOKE ALL ON DATABASE treo_test FROM PUBLIC;
GRANT CONNECT ON DATABASE treo_dev TO treo_app;
GRANT CONNECT ON DATABASE treo_test TO treo_app;

\connect treo_dev
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO treo_app;

\connect treo_test
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO treo_app;
SQL

# Application table/sequence privileges are intentionally not granted here.
# Each future TypeORM migration must grant only the permissions required for
# its business tables. The app must never own the migration metadata table.
