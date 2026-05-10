#!/usr/bin/env bash
set -euo pipefail

npm run build

mkdir -p .next/standalone/.next
mkdir -p .next/standalone/.next/static
cp -R .next/static/. .next/standalone/.next/static/
rm -rf .next/standalone/public
cp -R public .next/standalone/public

sudo systemctl restart rtvplanner.service
sleep 3

curl -fsS http://127.0.0.1:3450/api/health >/dev/null
curl -fsS http://127.0.0.1:3450/manual >/dev/null
curl -fsS http://127.0.0.1:3450/output/live >/dev/null

css_file="$(find .next/static/css -type f -name '*.css' | head -n 1)"
if [[ -n "${css_file}" ]]; then
  css_name="$(basename "${css_file}")"
  curl -fsS "http://127.0.0.1:3450/_next/static/css/${css_name}" >/dev/null
fi

echo "rtvplanner production deploy ok"
