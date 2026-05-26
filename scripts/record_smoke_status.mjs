#!/usr/bin/env node

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const status = process.argv[2];
const label = process.argv[3] || 'smoke';

if (!status || !['ok', 'fail'].includes(status)) {
    console.error('Usage: node scripts/record_smoke_status.mjs ok|fail [label]');
    process.exit(1);
}

const path = resolve(
    process.cwd(),
    process.env.RTV_SMOKE_STATUS_FILE || '/tmp/rtvplanner-smoke-status.json',
);
mkdirSync(dirname(path), { recursive: true });
writeFileSync(
    path,
    `${JSON.stringify(
        {
            status,
            label,
            recordedAt: new Date().toISOString(),
        },
        null,
        2,
    )}\n`,
);

console.log(`recorded smoke status: ${status} (${label})`);
