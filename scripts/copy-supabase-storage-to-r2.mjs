#!/usr/bin/env node

import { statSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '');
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const sourceBucket = process.env.SUPABASE_MEDIA_BUCKET ?? 'small-media-assets';
const targetBucket = process.argv[2] ?? 'broadcast-planner-media';
const wrangler = './node_modules/.bin/wrangler';

if (!baseUrl || !serviceKey) {
    console.error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
    process.exit(1);
}

const workspace = await mkdtemp(join(tmpdir(), 'broadcast-planner-r2-'));
const failures = [];

try {
    const assets = await fetchStorageAssets();
    console.log(`copying ${assets.length} objects to ${targetBucket}`);

    for (const [index, asset] of assets.entries()) {
        const file = join(workspace, `${index}.bin`);

        try {
            const response = await fetchStorageObject(asset.storage_path);
            const bytes = Buffer.from(await response.arrayBuffer());
            await writeFile(file, bytes);
            putObject(targetBucket, asset.storage_path, file, resolveContentType(asset, response));
            verifyObject(targetBucket, asset.storage_path, file, workspace, index);
            console.log(
                `[${index + 1}/${assets.length}] ${asset.storage_path}: ${bytes.length} bytes`,
            );
        } catch (error) {
            failures.push(
                `${asset.storage_path}: ${error instanceof Error ? error.message : error}`,
            );
        }
    }
} finally {
    await rm(workspace, { recursive: true, force: true });
}

if (failures.length) {
    console.error(failures.join('\n'));
    process.exit(1);
}

console.log('Supabase Storage -> R2 copy verified');

async function fetchStorageAssets() {
    const response = await fetch(
        `${baseUrl}/rest/v1/media_assets?select=storage_path,content_type,metadata&storage_path=not.is.null`,
        { headers: authHeaders() },
    );

    if (!response.ok) {
        throw new Error(`media_assets query failed: ${response.status} ${await response.text()}`);
    }

    return response.json();
}

async function fetchStorageObject(storagePath) {
    const response = await fetch(
        `${baseUrl}/storage/v1/object/${sourceBucket}/${encodeStoragePath(storagePath)}`,
        { headers: authHeaders() },
    );

    if (!response.ok) {
        throw new Error(`download failed: HTTP ${response.status}`);
    }

    return response;
}

function putObject(bucket, storagePath, file, contentType) {
    const args = ['r2', 'object', 'put', `${bucket}/${storagePath}`, `--file=${file}`, '--remote'];
    if (contentType) args.push('--content-type', contentType);
    runWrangler(args);
}

function verifyObject(bucket, storagePath, sourceFile, directory, index) {
    const outputFile = join(directory, `${index}.verify.bin`);
    runWrangler([
        'r2',
        'object',
        'get',
        `${bucket}/${storagePath}`,
        `--file=${outputFile}`,
        '--remote',
    ]);

    if (statSync(sourceFile).size !== statSync(outputFile).size) {
        throw new Error('R2 read-back size mismatch');
    }
}

function runWrangler(args) {
    const result = spawnSync(wrangler, args, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (result.status !== 0) {
        throw new Error(result.stderr.trim() || result.stdout.trim() || 'wrangler failed');
    }
}

function resolveContentType(asset, response) {
    const metadata = asset.metadata && typeof asset.metadata === 'object' ? asset.metadata : {};
    return (
        asset.content_type ??
        metadata.mime_type ??
        response.headers.get('content-type') ??
        undefined
    );
}

function authHeaders() {
    return {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
    };
}

function encodeStoragePath(value) {
    return String(value)
        .split('/')
        .map((part) => encodeURIComponent(part))
        .join('/');
}
