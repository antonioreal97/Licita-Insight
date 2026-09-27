#!/bin/sh
set -eu

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${BUCKET_NAME:?BUCKET_NAME is required}"
endpoint="${AWS_ENDPOINT_URL_S3:-${AWS_ENDPOINT_URL:-}}"
: "${endpoint:?AWS_ENDPOINT_URL_S3 or AWS_ENDPOINT_URL is required}"

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
object="s3://${BUCKET_NAME}/postgres/licitai-${timestamp}.dump"

pg_dump --dbname="${DATABASE_URL}" --format=custom --no-owner --no-acl \
  | aws s3 cp - "${object}" --endpoint-url "${endpoint}" --only-show-errors

printf 'backup uploaded: %s\n' "${object}"
