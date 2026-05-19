#!/usr/bin/env bash
set -euo pipefail

npm run build

mkdir -p .next/standalone/.next
rm -rf .next/standalone/.next/static
mkdir -p .next/standalone/.next/static
cp -R .next/static/. .next/standalone/.next/static/
rm -rf .next/standalone/public
cp -R public .next/standalone/public

sudo systemctl restart rtvplanner.service
sleep 3

curl -fsS http://127.0.0.1:3450/api/health >/dev/null
curl -fsS http://127.0.0.1:3450/manual >/dev/null
if [[ -n "${OUTPUT_CAPTURE_TOKEN:-}" ]]; then
  curl -fsS "http://127.0.0.1:3450/output/live?token=${OUTPUT_CAPTURE_TOKEN}" >/dev/null
else
  output_status="$(curl -sS -o /dev/null -w "%{http_code}" http://127.0.0.1:3450/output/live)"
  case "$output_status" in
    200|401) ;;
    *) echo "Unexpected output route status: $output_status" >&2; exit 1 ;;
  esac
fi

login_html="$(curl -fsS http://127.0.0.1:3450/admin/login)"
mapfile -t css_hrefs < <(printf '%s' "$login_html" | grep -oE '/_next/static/css/[^"]+\.css' | sort -u)
if [[ "${#css_hrefs[@]}" -eq 0 ]]; then
  echo "No CSS assets found in rendered login HTML" >&2
  exit 1
fi
for css_href in "${css_hrefs[@]}"; do
  curl -fsS "http://127.0.0.1:3450${css_href}" >/dev/null
done

echo "rtvplanner production deploy ok"
