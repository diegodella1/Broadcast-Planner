#!/usr/bin/env node

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const status = process.argv[2];
const label = process.argv[3] || 'smoke';

if (!status || !['ok', 'fail'].includes(status)) {
    console.error('Usage: node scripts/record_smoke_status.mjs ok|fail [label]');
    process.exit(1);
}

const recordedAt = new Date().toISOString();
const payload = { status, label, recordedAt };

const path = resolve(
    process.cwd(),
    process.env.RTV_SMOKE_STATUS_FILE || '/tmp/rtvplanner-smoke-status.json',
);
mkdirSync(dirname(path), { recursive: true });
writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`);
console.log(`recorded smoke status to disk: ${status} (${label})`);

const baseUrl = process.env.RTV_BASE_URL;
const token = process.env.SMOKE_WRITE_TOKEN;

if (baseUrl && token) {
    try {
        const response = await fetch(`${baseUrl.replace(/\/$/, '')}/api/internal/smoke-status`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-smoke-token': token,
            },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            const body = await response.text();
            console.error(`failed to POST smoke status to ${baseUrl}: ${response.status} ${body}`);
            process.exit(1);
        }
        console.log(`posted smoke status to ${baseUrl}/api/internal/smoke-status`);
    } catch (error) {
        console.error(
            `failed to POST smoke status to ${baseUrl}:`,
            error instanceof Error ? error.message : error,
        );
        process.exit(1);
    }
} else if (baseUrl && !token) {
    console.warn('RTV_BASE_URL is set but SMOKE_WRITE_TOKEN is missing; skipping remote POST');
}
