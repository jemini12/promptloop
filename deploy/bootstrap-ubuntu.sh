#!/usr/bin/env bash
set -euo pipefail

WITH_GO=1
OPEN_PORT_3000=1

usage() {
  cat <<'EOF'
Usage: sudo deploy/bootstrap-ubuntu.sh [options]

Options:
  --no-go           Skip installing golang-go
  --no-open-port    Do not open 3000/tcp via UFW
  --help            Show this help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-go)
      WITH_GO=0
      shift
      ;;
    --no-open-port)
      OPEN_PORT_3000=0
      shift
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

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root (use sudo)." >&2
  exit 1
fi

if [[ ! -f /etc/os-release ]]; then
  echo "Missing /etc/os-release; unsupported Linux distribution." >&2
  exit 1
fi

. /etc/os-release

if [[ "${ID:-}" != "ubuntu" && "${ID:-}" != "debian" ]]; then
  echo "This bootstrap script currently supports Ubuntu/Debian only (detected: ${ID:-unknown})." >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive

apt-get update
apt-get install -y \
  ca-certificates \
  curl \
  git \
  gnupg \
  lsb-release \
  openssl \
  ufw

install -m 0755 -d /etc/apt/keyrings

if [[ ! -f /etc/apt/keyrings/docker.gpg ]]; then
  curl -fsSL "https://download.docker.com/linux/${ID}/gpg" | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
fi

ARCH="$(dpkg --print-architecture)"
CODENAME="${VERSION_CODENAME:-}"
if [[ -z "${CODENAME}" ]]; then
  CODENAME="$(lsb_release -cs)"
fi

cat > /etc/apt/sources.list.d/docker.list <<EOF
deb [arch=${ARCH} signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/${ID} ${CODENAME} stable
EOF

apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

systemctl enable --now docker

if [[ -n "${SUDO_USER:-}" && "${SUDO_USER}" != "root" ]]; then
  usermod -aG docker "${SUDO_USER}"
fi

if [[ "${WITH_GO}" -eq 1 ]]; then
  apt-get install -y golang-go
fi

if command -v ufw >/dev/null 2>&1; then
  ufw allow OpenSSH >/dev/null || true
  if [[ "${OPEN_PORT_3000}" -eq 1 ]]; then
    ufw allow 3000/tcp >/dev/null || true
  fi
  ufw --force enable >/dev/null || true
fi

echo "Bootstrap complete."
if [[ -n "${SUDO_USER:-}" && "${SUDO_USER}" != "root" ]]; then
  echo "Note: log out/in for Docker group membership to apply for user '${SUDO_USER}'."
fi
