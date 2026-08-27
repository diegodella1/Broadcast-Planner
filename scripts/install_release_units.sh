#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo_dir="$(cd -- "$script_dir/.." && pwd)"

sudo cp "$repo_dir/deploy/systemd/broadcast-planner.service" \
    /etc/systemd/system/broadcast-planner.service
sudo cp "$repo_dir/deploy/systemd/broadcast-planner-metadata-refresh.service" \
    /etc/systemd/system/broadcast-planner-metadata-refresh.service
sudo cp "$repo_dir/deploy/systemd/broadcast-planner-metadata-refresh.timer" \
    /etc/systemd/system/broadcast-planner-metadata-refresh.timer
sudo systemctl daemon-reload
sudo systemctl enable broadcast-planner.service
sudo systemctl enable --now broadcast-planner-metadata-refresh.timer

echo "Broadcast Planner systemd units installed"
