#!/bin/sh
set -eu
cd "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
docker compose run --rm certbot renew --webroot -w /var/www/acme
docker compose exec -T proxy nginx -t
docker compose exec -T proxy nginx -s reload
