#!/usr/bin/env bash
# Starts Twenty + Mailpit and waits until the server answers its health check.
set -euo pipefail

cd "$(dirname "$0")/.."

# Twenty encrypts secrets at rest; a throwaway key per environment is enough for tests.
if [ ! -f .env ]; then
  echo "ENCRYPTION_KEY=$(openssl rand -base64 32)" > .env
  echo "Created .env with a new ENCRYPTION_KEY"
fi

echo "Starting containers (the first start runs migrations and takes about 90 seconds)..."
docker compose up -d --wait

echo
echo "Ready:"
echo "  Twenty   http://localhost:3000/"
echo "  Mailpit  http://localhost:8026/"
