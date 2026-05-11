#!/usr/bin/env bash
set -euo pipefail

if [[ "${ALLOW_STAGING_WRITE_SMOKE:-}" != "true" ]]; then
  echo "Set ALLOW_STAGING_WRITE_SMOKE=true to run this write smoke." >&2
  exit 1
fi

base_url="${RTV_STAGING_BASE_URL:-${RTV_BASE_URL:-}}"
if [[ -z "$base_url" ]]; then
  echo "RTV_STAGING_BASE_URL is required" >&2
  exit 1
fi
base_url="${base_url%/}"

if [[ -n "${RTV_PROD_BASE_URL:-}" && "${base_url}" == "${RTV_PROD_BASE_URL%/}" ]]; then
  echo "Refusing to run write smoke against RTV_PROD_BASE_URL." >&2
  exit 1
fi
if [[ "$base_url" != *"staging"* && "${ALLOW_NON_STAGING_WRITE_SMOKE:-}" != "true" ]]; then
  echo "Base URL does not look like staging. Set ALLOW_NON_STAGING_WRITE_SMOKE=true to override." >&2
  exit 1
fi
if [[ -z "${ADMIN_BOOTSTRAP_TOKEN:-}" ]]; then
  echo "ADMIN_BOOTSTRAP_TOKEN is required" >&2
  exit 1
fi
if [[ -z "${OUTPUT_CAPTURE_TOKEN:-}" ]]; then
  echo "OUTPUT_CAPTURE_TOKEN is required" >&2
  exit 1
fi

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT
cookie_jar="$tmp_dir/cookies.txt"
run_id="staging-smoke-$(date -u +%Y%m%d%H%M%S)"
asset_file="$tmp_dir/pixel.png"
printf '%s' 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=' | base64 -d >"$asset_file"

echo "csrf"
csrf="$(curl -fsS -c "$cookie_jar" -b "rpm_admin_token=${ADMIN_BOOTSTRAP_TOKEN}" "$base_url/api/csrf" | node -e 'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>process.stdout.write(JSON.parse(s).csrfToken))')"

echo "upload schedule"
air_date="$(date -u -d '+30 days' +%F)"
curl -fsS -L \
  -b "$cookie_jar" \
  -b "rpm_admin_token=${ADMIN_BOOTSTRAP_TOKEN}" \
  -F "_csrf=${csrf}" \
  -F "media_file=@${asset_file};type=image/png" \
  -F "title=${run_id}" \
  -F "asset_type=image" \
  -F "orientation=landscape" \
  -F "date=${air_date}" \
  -F "start_time=03:00:00" \
  "$base_url/api/assets/upload-schedule" >"$tmp_dir/upload.html"

echo "verify schedule auth"
curl -fsS "$base_url/api/playout/schedule?token=${OUTPUT_CAPTURE_TOKEN}" >"$tmp_dir/schedule.json"
node -e '
const fs = require("fs");
const payload = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
if (!payload.schedule || !Array.isArray(payload.schedule.blocks)) process.exit(1);
' "$tmp_dir/schedule.json"

echo "verify audit"
curl -fsS --cookie "rpm_admin_token=${ADMIN_BOOTSTRAP_TOKEN}" "$base_url/admin/audit" >"$tmp_dir/audit.html"
grep -q "$run_id" "$tmp_dir/audit.html"

echo "staging write smoke ok: $run_id"
