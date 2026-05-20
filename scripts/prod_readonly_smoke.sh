#!/usr/bin/env bash
set -euo pipefail
trap 'node scripts/record_smoke_status.mjs fail production-readonly >/dev/null || true' ERR

base_url="${RTV_PROD_BASE_URL:-${RTV_BASE_URL:-}}"
if [[ -z "$base_url" ]]; then
  echo "RTV_PROD_BASE_URL is required" >&2
  exit 1
fi
base_url="${base_url%/}"

if [[ -z "${ADMIN_BOOTSTRAP_TOKEN:-}" ]]; then
  echo "ADMIN_BOOTSTRAP_TOKEN is required" >&2
  exit 1
fi

output_query=""
if [[ -n "${OUTPUT_CAPTURE_TOKEN:-}" ]]; then
  output_query="?debug=true&token=${OUTPUT_CAPTURE_TOKEN}"
else
  output_query="?debug=true"
fi

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

echo "health"
curl -fsS "$base_url/api/health" >"$tmp_dir/health.json"
node -e '
const fs = require("fs");
const payload = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
if (!payload.ok) {
  console.error(JSON.stringify(payload, null, 2));
  process.exit(1);
}
' "$tmp_dir/health.json"

echo "admin auth redirect"
admin_status="$(curl -sS -o /dev/null -w "%{http_code}" "$base_url/admin/calendar")"
case "$admin_status" in
  301|302|303|307|308) ;;
  *) echo "Expected admin redirect, got $admin_status" >&2; exit 1 ;;
esac

echo "admin authenticated"
curl -fsS --cookie "rpm_admin_token=${ADMIN_BOOTSTRAP_TOKEN}" "$base_url/admin/calendar" >"$tmp_dir/admin.html"
grep -qi "admin\\|calendar\\|program" "$tmp_dir/admin.html"

echo "output session"
session_headers="$tmp_dir/output-session.headers"
session_status="$(curl -sS -D "$session_headers" -o /dev/null -w "%{http_code}" \
  --cookie "rpm_admin_token=${ADMIN_BOOTSTRAP_TOKEN}" \
  "$base_url/api/output/session?debug=true&return_to=/output/live")"
case "$session_status" in
  301|302|303|307|308) ;;
  *) echo "Expected output session redirect, got $session_status" >&2; exit 1 ;;
esac
grep -qi '^set-cookie: rpm_output_token=' "$session_headers"
location="$(awk 'tolower($1)=="location:" {print $2}' "$session_headers" | tr -d '\r' | tail -n 1)"
if [[ "$location" == *"0.0.0.0"* || "$location" == *"localhost"* || "$location" == *":3450"* ]]; then
  echo "Output session redirected to private origin: $location" >&2
  exit 1
fi

echo "playout schedule"
schedule_query=""
if [[ -n "${OUTPUT_CAPTURE_TOKEN:-}" ]]; then
  schedule_query="?token=${OUTPUT_CAPTURE_TOKEN}"
fi
curl -fsS "$base_url/api/playout/schedule${schedule_query}" >"$tmp_dir/schedule.json"
node -e '
const fs = require("fs");
const payload = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
if (!payload.schedule || !Array.isArray(payload.schedule.blocks)) process.exit(1);
const block = payload.schedule.blocks.find((item) => item && (item.status === "ready" || item.status === "active"));
if (block?.id) fs.writeFileSync(process.argv[2], block.id);
' "$tmp_dir/schedule.json" "$tmp_dir/block_id"

echo "live output"
curl -fsS "$base_url/output/live${output_query}" >"$tmp_dir/output.html"
test -s "$tmp_dir/output.html"
if grep -Eqi '<nav\b|href="/admin' "$tmp_dir/output.html"; then
  echo "Admin UI leaked into output route" >&2
  exit 1
fi

if [[ -s "$tmp_dir/block_id" ]]; then
  block_id="$(cat "$tmp_dir/block_id")"
  echo "preview output"
  curl -fsS "$base_url/output/preview/${block_id}${output_query}" >"$tmp_dir/preview.html"
  test -s "$tmp_dir/preview.html"
fi

echo "audit page"
curl -fsS --cookie "rpm_admin_token=${ADMIN_BOOTSTRAP_TOKEN}" "$base_url/admin/audit" >"$tmp_dir/audit.html"
grep -qi "audit" "$tmp_dir/audit.html"

node scripts/record_smoke_status.mjs ok production-readonly >/dev/null
echo "production read-only smoke ok"
