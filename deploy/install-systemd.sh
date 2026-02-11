#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${1:-}"

usage() {
  cat <<'EOF'
Usage: sudo ./deploy/install-systemd.sh /absolute/path/to/promptly
EOF
}

if [[ "${APP_DIR}" == "--help" ]]; then
  usage
  exit 0
fi

if [[ -z "${APP_DIR}" ]]; then
  usage >&2
  exit 2
fi

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root (use sudo)." >&2
  exit 1
fi

if [[ "${APP_DIR}" != /* ]]; then
  echo "APP_DIR must be an absolute path." >&2
  exit 2
fi

if [[ ! -f "${APP_DIR}/docker-compose.yml" ]]; then
  echo "Missing ${APP_DIR}/docker-compose.yml" >&2
  exit 1
fi

cat > /etc/systemd/system/promptly.service <<EOF
[Unit]
Description=Promptly (docker compose)
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=${APP_DIR}
ExecStart=/usr/bin/docker compose up -d --build
ExecStop=/usr/bin/docker compose down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now promptly.service
systemctl status promptly.service --no-pager
