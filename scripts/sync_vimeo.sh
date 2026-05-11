#!/usr/bin/env bash
set -euo pipefail

base_url="${RTV_BASE_URL:-http://127.0.0.1:3450}"
cookie_jar="$(mktemp)"
trap 'rm -f "$cookie_jar"' EXIT

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

csrf_token="$(
  curl -fsS -c "$cookie_jar" "${base_url%/}/api/csrf" \
    | sed -n 's/.*"csrfToken":"\([^"]*\)".*/\1/p'
)"

if [[ -z "${csrf_token:-}" ]]; then
  echo "CSRF token request failed" >&2
  exit 1
fi

curl -fsS \
  -b "$cookie_jar" \
  --cookie "rpm_admin_token=${ADMIN_BOOTSTRAP_TOKEN}" \
  -H "x-csrf-token: ${csrf_token}" \
  -X POST \
  "${base_url%/}/api/vimeo/sync"

echo
