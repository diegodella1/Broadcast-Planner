#!/usr/bin/env bash
set -euo pipefail

npm run build

mkdir -p .next/standalone/.next
rm -rf .next/standalone/.next/static .next/standalone/public
cp -R .next/static .next/standalone/.next/static
cp -R public .next/standalone/public

sudo systemctl restart rtvplanner.service
sleep 3

curl -fsS http://127.0.0.1:3450/rtvtime/api/health >/dev/null
curl -fsS http://127.0.0.1:3450/rtvtime/manual >/dev/null

css_file="$(find .next/static/css -type f -name '*.css' | head -n 1)"
if [[ -n "${css_file}" ]]; then
  css_name="$(basename "${css_file}")"
  curl -fsS "http://127.0.0.1:3450/rtvtime/_next/static/css/${css_name}" >/dev/null
fi

echo "rtvplanner production deploy ok"
