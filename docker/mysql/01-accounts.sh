#!/bin/bash
# Run or sourced by the official entrypoint on FIRST initialization only.
# Windows bind mounts may be executable: do not depend on its shell functions.
(
set -eu
case "${MYSQL_USER:-}" in
  ''|root|connectclass_migrator|*[!a-zA-Z0-9_]*) echo 'Invalid application account.' >&2; exit 1 ;;
esac
if [ "${#MYSQL_USER}" -gt 32 ] || [ "${MYSQL_DATABASE:-}" != connectclass ] || [ -z "${DB_MIGRATION_PASSWORD:-}" ] || [ -z "${MYSQL_ROOT_PASSWORD:-}" ]; then
  echo 'Missing or invalid database initialization configuration.' >&2
  exit 1
fi
# SQL string quoting independent of backslashes; never print SQL/password values.
migration_password_sql=${DB_MIGRATION_PASSWORD//\'/\'\'}
MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql --protocol=socket -u root --database=connectclass <<EOSQL
SET SESSION sql_mode = 'NO_BACKSLASH_ESCAPES';
REVOKE ALL PRIVILEGES ON \`connectclass\`.* FROM '$MYSQL_USER'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON \`connectclass\`.* TO '$MYSQL_USER'@'%';
CREATE USER 'connectclass_migrator'@'%' IDENTIFIED BY '$migration_password_sql';
GRANT SELECT, INSERT, CREATE, ALTER, INDEX, REFERENCES ON \`connectclass\`.* TO 'connectclass_migrator'@'%';
EOSQL
unset migration_password_sql
)
