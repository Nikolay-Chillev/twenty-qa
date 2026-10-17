#!/usr/bin/env bash
# Starts Twenty + Mailpit and waits until the server answers its health check.
set -euo pipefail

cd "$(dirname "$0")/.."

# Throwaway secrets for this environment: the key Twenty encrypts secrets with, and the
# password of the test users. Missing ones are added; existing ones are kept, because
# the users in the database were created with them.
touch .env
if ! grep -q '^ENCRYPTION_KEY=' .env; then
  echo "ENCRYPTION_KEY=$(openssl rand -base64 32)" >> .env
  echo "Added ENCRYPTION_KEY to .env"
fi
if ! grep -q '^TWENTY_PASSWORD=' .env; then
  echo "TWENTY_PASSWORD=Qa1-$(openssl rand -hex 12)" >> .env
  echo "Added TWENTY_PASSWORD to .env"
fi

echo "Starting containers (the first start runs migrations and takes about 90 seconds)..."
docker compose up -d --wait

echo
echo "Ready:"
echo "  Twenty   http://localhost:3000/"
echo "  Mailpit  http://localhost:8026/"
