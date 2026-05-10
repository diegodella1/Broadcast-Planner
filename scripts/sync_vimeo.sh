#!/usr/bin/env bash
set -euo pipefail

base_url="${RTV_BASE_URL:-http://127.0.0.1:3450}"

if [[ -z "${ADMIN_BOOTSTRAP_TOKEN:-}" ]]; then
  if [[ -f ".env" ]]; then
    set -a
    # shellcheck disable=SC1091
    . ./.env
    set +a
  fi
fi

if [[ -z "${ADMIN_BOOTSTRAP_TOKEN:-}" ]]; then
  echo "ADMIN_BOOTSTRAP_TOKEN is required" >&2
  exit 1
fi

curl -fsS \
  --cookie "rpm_admin_token=${ADMIN_BOOTSTRAP_TOKEN}" \
  -X POST \
  "${base_url%/}/api/vimeo/sync"

echo
