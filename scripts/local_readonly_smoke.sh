#!/usr/bin/env bash
set -euo pipefail
trap 'node scripts/record_smoke_status.mjs fail local-readonly >/dev/null || true' ERR

base_url="${RTV_BASE_URL:-http://127.0.0.1:3450}"
base_url="${base_url%/}"

curl -fsS "$base_url/api/health" >/dev/null
curl -fsS "$base_url/manual" >/dev/null
curl -fsS "$base_url/api/playout/schedule${OUTPUT_CAPTURE_TOKEN:+?token=${OUTPUT_CAPTURE_TOKEN}}" >/dev/null
curl -fsS "$base_url/output/live?debug=true${OUTPUT_CAPTURE_TOKEN:+&token=${OUTPUT_CAPTURE_TOKEN}}" >/dev/null

node scripts/record_smoke_status.mjs ok local-readonly >/dev/null
echo "local read-only smoke ok"
