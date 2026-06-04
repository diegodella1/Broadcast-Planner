#!/usr/bin/env bash
#
# Copy the media FILES that live in Supabase Storage (bucket
# `small-media-assets`) into the DEV Cloudflare R2 bucket
# `rtv-tl-manager-media-dev`.
#
# The DB rows are already migrated to D1; this is the final data step.
#
# For every media_assets row with a non-null `storage_path` (34 rows), this:
#   1. Downloads the object bytes from Supabase Storage (read-only).
#   2. Uploads to R2 REMOTE under the identical key (storage_path).
#   3. Uploads to R2 LOCAL under the identical key (local dev parity).
#
# Content-type is taken from metadata.mime_type when present, otherwise from
# the Supabase download response Content-Type header.
#
# Credentials are read from .env.local — no secrets are hardcoded.
# Supabase access is download-only; nothing is ever deleted there.
#
# Usage:
#   bash scripts/copy-supabase-storage-to-r2-dev.sh
#
# Requirements: wrangler (authenticated), curl, jq.

set -uo pipefail

SUPABASE_BUCKET='small-media-assets'
R2_BUCKET='rtv-tl-manager-media-dev'
WRANGLER='./node_modules/.bin/wrangler'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${ROOT_DIR}/.env.local"

# ── Load credentials from .env.local ─────────────────────────────────────────
if [[ ! -f "${ENV_FILE}" ]]; then
    echo "ERROR: ${ENV_FILE} not found" >&2
    exit 1
fi

read_env() {
    grep -E "^${1}=" "${ENV_FILE}" | head -n1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//"
}

SUPABASE_URL="$(read_env NEXT_PUBLIC_SUPABASE_URL)"
SERVICE_KEY="$(read_env SUPABASE_SERVICE_ROLE_KEY)"

if [[ -z "${SUPABASE_URL}" || -z "${SERVICE_KEY}" ]]; then
    echo "ERROR: missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local" >&2
    exit 1
fi
SUPABASE_URL="${SUPABASE_URL%/}"

# ── Temp workspace ───────────────────────────────────────────────────────────
TMP_DIR="$(mktemp -d)"
cleanup() { rm -rf "${TMP_DIR}"; }
trap cleanup EXIT

echo "Copying Supabase Storage \"${SUPABASE_BUCKET}\" -> R2 \"${R2_BUCKET}\""
echo "Supabase: ${SUPABASE_URL}"
echo

# ── 1. Query rows with a non-null storage_path ───────────────────────────────
ROWS_JSON="${TMP_DIR}/rows.json"
HTTP_CODE="$(curl -sS -w '%{http_code}' -o "${ROWS_JSON}" \
    -H "apikey: ${SERVICE_KEY}" \
    -H "Authorization: Bearer ${SERVICE_KEY}" \
    "${SUPABASE_URL}/rest/v1/media_assets?select=storage_path,metadata&storage_path=not.is.null")"

if [[ "${HTTP_CODE}" != "200" ]]; then
    echo "ERROR: REST query failed (HTTP ${HTTP_CODE})" >&2
    cat "${ROWS_JSON}" >&2
    exit 1
fi

TOTAL="$(jq 'length' "${ROWS_JSON}")"
echo "Found ${TOTAL} rows with a non-null storage_path."
echo

# Emit "storage_path\tmime_type" lines (mime_type empty when absent).
ROWS_TSV="${TMP_DIR}/rows.tsv"
jq -r '.[] | [.storage_path, (.metadata.mime_type // "")] | @tsv' "${ROWS_JSON}" > "${ROWS_TSV}"

# ── 2. For each storage_path: download from Supabase, upload to R2 ───────────
copied_remote=0
copied_local=0
missing_paths=()
failed_paths=()
ok_paths=()

idx=0
while IFS=$'\t' read -r STORAGE_PATH META_MIME; do
    [[ -z "${STORAGE_PATH}" ]] && continue
    idx=$((idx + 1))
    echo "[${idx}/${TOTAL}] ${STORAGE_PATH}"

    TMP_FILE="${TMP_DIR}/obj_${idx}.bin"
    HDR_FILE="${TMP_DIR}/obj_${idx}.hdr"

    # 2a. Download object bytes (read-only).
    DL_CODE="$(curl -sS -D "${HDR_FILE}" -w '%{http_code}' -o "${TMP_FILE}" \
        -H "apikey: ${SERVICE_KEY}" \
        -H "Authorization: Bearer ${SERVICE_KEY}" \
        "${SUPABASE_URL}/storage/v1/object/${SUPABASE_BUCKET}/${STORAGE_PATH}")"

    if [[ "${DL_CODE}" == "404" ]]; then
        echo "  MISSING in Supabase Storage (HTTP 404) — skipping"
        missing_paths+=("${STORAGE_PATH}")
        continue
    fi
    if [[ "${DL_CODE}" != "200" ]]; then
        echo "  ERROR downloading (HTTP ${DL_CODE}) — skipping"
        failed_paths+=("${STORAGE_PATH}")
        continue
    fi

    # Resolve content-type: metadata.mime_type wins, else response header.
    CONTENT_TYPE="${META_MIME}"
    if [[ -z "${CONTENT_TYPE}" ]]; then
        CONTENT_TYPE="$(grep -i '^content-type:' "${HDR_FILE}" | tail -n1 | cut -d: -f2- | tr -d '\r' | sed 's/^ *//;s/ *$//' | cut -d';' -f1)"
    fi

    CT_ARGS=()
    if [[ -n "${CONTENT_TYPE}" ]]; then
        CT_ARGS=(--content-type "${CONTENT_TYPE}")
    fi
    SIZE="$(wc -c < "${TMP_FILE}" | tr -d ' ')"
    echo "  downloaded ${SIZE} bytes (content-type: ${CONTENT_TYPE:-<unknown>})"

    # 2b. Upload to R2 REMOTE.
    if "${WRANGLER}" r2 object put "${R2_BUCKET}/${STORAGE_PATH}" \
        --file="${TMP_FILE}" "${CT_ARGS[@]}" --remote >/dev/null 2>"${TMP_DIR}/err.log"; then
        echo "  uploaded -> R2 remote"
        copied_remote=$((copied_remote + 1))
        remote_ok=1
    else
        echo "  ERROR uploading to R2 remote:"
        sed 's/^/    /' "${TMP_DIR}/err.log"
        failed_paths+=("${STORAGE_PATH} (remote upload)")
        remote_ok=0
    fi

    # 2c. Upload to R2 LOCAL.
    if "${WRANGLER}" r2 object put "${R2_BUCKET}/${STORAGE_PATH}" \
        --file="${TMP_FILE}" "${CT_ARGS[@]}" --local >/dev/null 2>"${TMP_DIR}/err.log"; then
        echo "  uploaded -> R2 local"
        copied_local=$((copied_local + 1))
        local_ok=1
    else
        echo "  ERROR uploading to R2 local:"
        sed 's/^/    /' "${TMP_DIR}/err.log"
        failed_paths+=("${STORAGE_PATH} (local upload)")
        local_ok=0
    fi

    if [[ "${remote_ok}" == "1" && "${local_ok}" == "1" ]]; then
        ok_paths+=("${STORAGE_PATH}")
    fi

    rm -f "${TMP_FILE}" "${HDR_FILE}"
done < "${ROWS_TSV}"

# ── 3. Summary ───────────────────────────────────────────────────────────────
echo
echo "==================== SUMMARY ===================="
echo "Rows processed:        ${idx}/${TOTAL}"
echo "Copied OK to R2 remote: ${copied_remote}"
echo "Copied OK to R2 local:  ${copied_local}"
echo "Missing in Supabase:    ${#missing_paths[@]}"
echo "Failed:                 ${#failed_paths[@]}"

if [[ ${#missing_paths[@]} -gt 0 ]]; then
    echo
    echo "MISSING objects (DB row exists, Supabase object 404):"
    printf '  - %s\n' "${missing_paths[@]}"
fi
if [[ ${#failed_paths[@]} -gt 0 ]]; then
    echo
    echo "FAILED objects:"
    printf '  - %s\n' "${failed_paths[@]}"
fi

# ── 4. Verify a sample (up to 3 fully-copied paths) in R2 remote ─────────────
echo
echo "==================== VERIFY (R2 remote sample) ===================="
sample_count=0
for path in "${ok_paths[@]}"; do
    [[ ${sample_count} -ge 3 ]] && break
    sample_count=$((sample_count + 1))
    VERIFY_FILE="${TMP_DIR}/verify_${sample_count}.bin"
    echo "[verify ${sample_count}] ${R2_BUCKET}/${path}"
    if "${WRANGLER}" r2 object get "${R2_BUCKET}/${path}" \
        --file="${VERIFY_FILE}" --remote >/dev/null 2>"${TMP_DIR}/verr.log"; then
        VSIZE="$(wc -c < "${VERIFY_FILE}" | tr -d ' ')"
        echo "  OK — present in R2 remote (${VSIZE} bytes)"
    else
        echo "  FAILED to read back from R2 remote:"
        sed 's/^/    /' "${TMP_DIR}/verr.log"
    fi
    rm -f "${VERIFY_FILE}"
done

if [[ ${#failed_paths[@]} -gt 0 ]]; then
    exit 1
fi
echo
echo "Done."
