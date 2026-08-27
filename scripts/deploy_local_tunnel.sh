#!/usr/bin/env bash
set -Eeuo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo_dir="$(cd -- "$script_dir/.." && pwd)"
deploy_root="${BROADCAST_PLANNER_DEPLOY_ROOT:-/home/diego/.local/share/broadcast-planner}"
releases_dir="$deploy_root/releases"
shared_dir="$deploy_root/shared"
current_link="$deploy_root/current"
previous_link="$deploy_root/previous"
compat_link="$deploy_root/app"
runtime_state_dir="${BROADCAST_PLANNER_WRANGLER_STATE_DIR:-$deploy_root/wrangler-state}"
shared_env="${BROADCAST_PLANNER_ENV_FILE:-$shared_dir/.env}"
smoke_status_file="${BROADCAST_PLANNER_SMOKE_STATUS_FILE:-$shared_dir/smoke-status.json}"
lock_file="$deploy_root/deploy.lock"
service_name="${BROADCAST_PLANNER_SERVICE_NAME:-broadcast-planner.service}"
local_base_url="${BROADCAST_PLANNER_LOCAL_BASE_URL:-http://127.0.0.1:3450}"
action="${1:-deploy}"

mkdir -p "$deploy_root" "$releases_dir" "$shared_dir" "$runtime_state_dir"
exec 9>"$lock_file"
if ! flock -n 9; then
    echo "Another Broadcast Planner deploy is running" >&2
    exit 1
fi

record_smoke() {
    local status="$1"
    local label="$2"
    BROADCAST_PLANNER_SMOKE_STATUS_FILE="$smoke_status_file" \
        node "$repo_dir/scripts/record_smoke_status.mjs" "$status" "$label" >/dev/null
}

atomic_link() {
    local target="$1"
    local link="$2"
    local pending_link="${link}.next.$$"

    rm -f "$pending_link"
    ln -s "$target" "$pending_link"
    mv -Tf "$pending_link" "$link"
}

resolved_release_link() {
    local link="$1"

    if [[ -L "$link" ]]; then
        readlink -e "$link" 2>/dev/null || true
    fi
}

load_environment() {
    if [[ ! -f "$shared_env" ]]; then
        if [[ ! -f "$repo_dir/.env" ]]; then
            echo "Missing environment file: $shared_env (and no $repo_dir/.env bootstrap source)" >&2
            exit 1
        fi
        cp "$repo_dir/.env" "$shared_env"
        chmod 600 "$shared_env"
        echo "Bootstrapped shared environment: $shared_env"
    fi

    set -a
    # shellcheck disable=SC1090
    source "$shared_env"
    set +a
    export BROADCAST_PLANNER_SMOKE_STATUS_FILE="$smoke_status_file"
}

wait_for_service() {
    local attempts="${BROADCAST_PLANNER_START_ATTEMPTS:-30}"

    for ((attempt = 1; attempt <= attempts; attempt += 1)); do
        if curl -fsS --max-time 3 "$local_base_url/manual" >/dev/null; then
            return 0
        fi
        sleep 1
    done

    echo "Broadcast Planner did not become ready at $local_base_url" >&2
    return 1
}

local_smoke() {
    local output_status login_html

    curl -fsS --max-time 10 "$local_base_url/manual" >/dev/null
    if [[ -n "${OUTPUT_CAPTURE_TOKEN:-}" ]]; then
        curl -fsS --max-time 10 \
            "$local_base_url/output/live?token=${OUTPUT_CAPTURE_TOKEN}" >/dev/null
    else
        output_status="$(curl -sS --max-time 10 -o /dev/null -w "%{http_code}" \
            "$local_base_url/output/live")"
        case "$output_status" in
            200|401) ;;
            *) echo "Unexpected output route status: $output_status" >&2; return 1 ;;
        esac
    fi

    login_html="$(curl -fsS --max-time 10 "$local_base_url/admin/login")"
    mapfile -t css_hrefs < <(printf '%s' "$login_html" \
        | grep -oE '/_next/static/css/[^"]+\.css' | sort -u)
    if [[ "${#css_hrefs[@]}" -eq 0 ]]; then
        echo "No CSS assets found in rendered login HTML" >&2
        return 1
    fi
    for css_href in "${css_hrefs[@]}"; do
        curl -fsS --max-time 10 "$local_base_url${css_href}" >/dev/null
    done

    record_smoke ok local-deploy
    curl -fsS --max-time 20 "$local_base_url/api/health" >/dev/null
}

public_smoke() {
    local public_base_url="${BROADCAST_PLANNER_PROD_BASE_URL:-${NEXT_PUBLIC_APP_BASE_URL:-}}"

    if [[ -z "$public_base_url" ]]; then
        echo "No public base URL configured; skipping public smoke"
        return 0
    fi

    (cd "$repo_dir" && \
        BROADCAST_PLANNER_PROD_BASE_URL="$public_base_url" \
        BROADCAST_PLANNER_SMOKE_STATUS_FILE="$smoke_status_file" \
        bash scripts/prod_readonly_smoke.sh)
}

activate_release() {
    local release_dir="$1"

    if [[ ! -f "$release_dir/server.js" ]]; then
        echo "Release has no server.js: $release_dir" >&2
        return 1
    fi
    if [[ ! -s "$release_dir/node_modules/next/package.json" ]]; then
        echo "Release has no packaged Next.js runtime: $release_dir" >&2
        return 1
    fi
    atomic_link "$release_dir" "$current_link"
    atomic_link "current" "$compat_link"
    sudo systemctl reset-failed "$service_name" >/dev/null 2>&1 || true
    sudo systemctl restart "$service_name"
    wait_for_service
    local_smoke
    public_smoke
}

build_release() {
    local release_id release_dir staging_dir git_ref dirty_suffix

    git_ref="$(git -C "$repo_dir" rev-parse --short HEAD 2>/dev/null || echo nogit)"
    dirty_suffix=""
    if ! git -C "$repo_dir" diff --quiet --ignore-submodules -- 2>/dev/null \
        || [[ -n "$(git -C "$repo_dir" ls-files --others --exclude-standard 2>/dev/null)" ]]; then
        dirty_suffix="-dirty"
    fi
    release_id="$(date -u +%Y%m%dT%H%M%SZ)-${git_ref}${dirty_suffix}-$$"
    release_dir="$releases_dir/$release_id"
    staging_dir="$releases_dir/.staging-$release_id"

    echo "Building release $release_id" >&2
    (cd "$repo_dir" && NEXT_TELEMETRY_DISABLED=1 npm run build) >&2

    if [[ ! -f "$repo_dir/.next/standalone/server.js" ]]; then
        echo "Build completed without .next/standalone/server.js" >&2
        return 1
    fi
    if [[ ! -s "$repo_dir/.next/standalone/node_modules/next/package.json" ]]; then
        echo "Build completed without a packaged Next.js runtime" >&2
        return 1
    fi

    mkdir -p "$staging_dir"
    cp -a "$repo_dir/.next/standalone/." "$staging_dir/"
    rm -rf "$staging_dir/.next/static" "$staging_dir/public" "$staging_dir/.wrangler"
    rm -f "$staging_dir/.env"
    mkdir -p "$staging_dir/.next/static" "$staging_dir/scripts"
    cp -a "$repo_dir/.next/static/." "$staging_dir/.next/static/"
    cp -a "$repo_dir/public" "$staging_dir/public"
    cp -a "$repo_dir/wrangler.jsonc" "$staging_dir/wrangler.jsonc"
    cp -a "$repo_dir/scripts/refresh_media_metadata.sh" "$staging_dir/scripts/"
    ln -s "$runtime_state_dir" "$staging_dir/.wrangler"
    ln -s "$shared_env" "$staging_dir/.env"

    test -s "$staging_dir/server.js"
    test -s "$staging_dir/node_modules/next/package.json"
    test -d "$staging_dir/.next/static"
    test -d "$staging_dir/public"
    test -s "$staging_dir/wrangler.jsonc"
    /usr/bin/node --check "$staging_dir/server.js" >/dev/null

    mv "$staging_dir" "$release_dir"
    printf '%s\n' "$release_dir"
}

prune_releases() {
    local current_target previous_target index release_dir
    local -a all_releases=()

    current_target="$(resolved_release_link "$current_link")"
    previous_target="$(resolved_release_link "$previous_link")"
    mapfile -t all_releases < <(
        find "$releases_dir" -mindepth 1 -maxdepth 1 -type d ! -name '.staging-*' \
            -printf '%T@ %p\n' | sort -rn | cut -d' ' -f2-
    )

    for ((index = 3; index < ${#all_releases[@]}; index += 1)); do
        release_dir="${all_releases[$index]}"
        if [[ "$release_dir" != "$current_target" && "$release_dir" != "$previous_target" ]]; then
            rm -rf -- "$release_dir"
        fi
    done
}

deploy() {
    local old_current new_release switched=false

    load_environment
    old_current="$(resolved_release_link "$current_link")"
    new_release="$(build_release | tail -n 1)"

    rollback_failed_deploy() {
        local exit_code=$?
        trap - ERR
        if [[ "$switched" == true && -n "$old_current" && -f "$old_current/server.js" ]]; then
            echo "Deploy failed; rolling back to $old_current" >&2
            activate_release "$old_current" || record_smoke fail rollback-failed
        else
            record_smoke fail local-deploy || true
        fi
        exit "$exit_code"
    }
    trap rollback_failed_deploy ERR

    switched=true
    activate_release "$new_release"
    if [[ -n "$old_current" && -f "$old_current/server.js" && "$old_current" != "$new_release" ]]; then
        atomic_link "$old_current" "$previous_link"
    fi
    trap - ERR
    prune_releases
    echo "Broadcast Planner deploy ok: $new_release"
}

rollback() {
    local current_target rollback_target

    load_environment
    current_target="$(resolved_release_link "$current_link")"
    rollback_target="$(resolved_release_link "$previous_link")"
    if [[ -z "$rollback_target" || ! -f "$rollback_target/server.js" ]]; then
        echo "No valid previous release available" >&2
        exit 1
    fi

    activate_release "$rollback_target"
    if [[ -n "$current_target" && -f "$current_target/server.js" ]]; then
        atomic_link "$current_target" "$previous_link"
    fi
    echo "Broadcast Planner rollback ok: $rollback_target"
}

case "$action" in
    deploy) deploy ;;
    rollback|--rollback) rollback ;;
    *) echo "Usage: $0 [deploy|rollback]" >&2; exit 2 ;;
esac
