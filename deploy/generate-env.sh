#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

OUT_FILE=".env"
NEXTAUTH_URL=""
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/promptly?schema=public"

usage() {
  cat <<'EOF'
Usage: ./deploy/generate-env.sh --url <public-url> [options]

Options:
  --out <path>      Output file (default: .env)
  --db-url <url>    DATABASE_URL value (default: local postgres)
  --help            Show this help

Example:
  ./deploy/generate-env.sh --url "http://VM_IP:3000"
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --out)
      OUT_FILE="$2"
      shift 2
      ;;
    --url)
      NEXTAUTH_URL="$2"
      shift 2
      ;;
    --db-url)
      DATABASE_URL="$2"
      shift 2
      ;;
    --help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [[ -z "${NEXTAUTH_URL}" ]]; then
  echo "Missing required --url (e.g. --url https://your.domain or --url http://VM_IP:3000)." >&2
  usage >&2
  exit 2
fi

if [[ -f "${OUT_FILE}" ]]; then
  echo "Refusing to overwrite existing ${OUT_FILE}. Move it aside and re-run." >&2
  exit 1
fi

if ! command -v openssl >/dev/null 2>&1; then
  echo "openssl is required to generate secrets. Install it (e.g. apt-get install openssl)." >&2
  exit 1
fi

NEXTAUTH_SECRET="$(openssl rand -base64 48 | tr -d '\n')"
CHANNEL_SECRET_KEY="$(openssl rand -hex 32 | tr -d '\n')"

cat > "${OUT_FILE}" <<EOF
DATABASE_URL="${DATABASE_URL}"
OPENAI_API_KEY=""
NEXTAUTH_SECRET="${NEXTAUTH_SECRET}"
NEXTAUTH_URL="${NEXTAUTH_URL}"

AUTH_GOOGLE_ID=""
AUTH_GOOGLE_SECRET=""
AUTH_GITHUB_ID=""
AUTH_GITHUB_SECRET=""
AUTH_DISCORD_ID=""
AUTH_DISCORD_SECRET=""

CHANNEL_SECRET_KEY="${CHANNEL_SECRET_KEY}"
DAILY_RUN_LIMIT="50"
EOF

chmod 600 "${OUT_FILE}" || true

echo "Wrote ${OUT_FILE}. Next: edit it and set OPENAI_API_KEY + OAuth creds."
