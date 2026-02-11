#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

usage() {
  cat <<'EOF'
Usage: ./deploy/deploy.sh

Requires:
  - docker + docker compose
  - .env in the repo root
EOF
}

if [[ "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

if [[ ! -f docker-compose.yml ]]; then
  echo "Run this from a Promptly repo checkout (missing docker-compose.yml)." >&2
  exit 1
fi

if [[ ! -f .env ]]; then
  echo "Missing .env. Generate one with: ./deploy/generate-env.sh --url http://VM_IP:3000" >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is not installed." >&2
  exit 1
fi

docker compose up -d --build
docker compose ps

echo "Deploy complete."
echo "Logs: docker compose logs -f web worker"
