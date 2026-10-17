#!/usr/bin/env bash
# Starts Twenty + Mailpit and waits until the server answers its health check.
set -euo pipefail

cd "$(dirname "$0")/.."

# Throwaway secrets for this environment: the key Twenty encrypts secrets with, and the
# password of the test users. Missing ones are added; existing ones are kept, because
# the users in the database were created with them.
add_if_missing() {
  if grep -q "^$1=" .env; then
    return
  fi
  # Start on a new line, even if .env was edited by hand and lacks a final newline.
  if [ -s .env ] && [ -n "$(tail -c 1 .env)" ]; then
    echo >> .env
  fi
  echo "$1=$2" >> .env
  echo "Added $1 to .env"
}

touch .env
add_if_missing ENCRYPTION_KEY "$(openssl rand -base64 32)"
add_if_missing TWENTY_PASSWORD "Qa1-$(openssl rand -hex 12)"

echo "Starting containers (the first start runs migrations and takes about 90 seconds)..."
docker compose up -d --wait

echo
echo "Ready:"
echo "  Twenty   http://localhost:3000/"
echo "  Mailpit  http://localhost:8026/"
