#!/usr/bin/env node
// scripts/check_zod_routes.mjs
//
// CI guard: every app/api/**/route.ts that reads a request body MUST import
// a Zod schema from @/lib/schemas or a relative path resolving to lib/schemas/.
//
// Pure GET-only routes that never touch the request body are exempt.
// Files may opt out with a top-of-file comment:
//   // zod-routes-allow: <reason>

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const apiRoot = join(__dirname, '..', 'app', 'api');

const BODY_READ_CALLS = [
    'request.json(',
    'req.json(',
    'request.formData(',
    'req.formData(',
    'request.text(',
    'req.text(',
    'request.arrayBuffer(',
    'req.arrayBuffer(',
    'request.blob(',
    'req.blob(',
];

const SCHEMA_IMPORT_PATTERNS = [
    '@/lib/schemas',
    '/lib/schemas/',
    '../lib/schemas',
    '../../lib/schemas',
    '../../../lib/schemas',
    '../../../../lib/schemas',
];

function* walkRoutes(dir) {
    for (const entry of readdirSync(dir)) {
        const fullPath = join(dir, entry);
        const stat = statSync(fullPath);

        if (stat.isDirectory()) {
            yield* walkRoutes(fullPath);
        } else if (entry === 'route.ts') {
            yield fullPath;
        }
    }
}

function readsBody(source) {
    return BODY_READ_CALLS.some((call) => source.includes(call));
}

function hasSchemaImport(source) {
    return SCHEMA_IMPORT_PATTERNS.some((pattern) => source.includes(pattern));
}

function getAllowlistReason(source) {
    const match = source.match(/\/\/\s*zod-routes-allow:\s*(.+)/);

    return match ? match[1].trim() : null;
}

function findBodyReadLine(source) {
    const lines = source.split('\n');

    for (let i = 0; i < lines.length; i++) {
        if (BODY_READ_CALLS.some((call) => lines[i].includes(call))) {
            return i + 1;
        }
    }

    return 1;
}

function relPath(absPath) {
    return absPath.replace(join(__dirname, '..') + '/', '');
}

const violations = [];
const allowlisted = [];

for (const file of walkRoutes(apiRoot)) {
    const source = readFileSync(file, 'utf8');

    if (!readsBody(source)) {
        continue;
    }

    const allowReason = getAllowlistReason(source);

    if (allowReason !== null) {
        allowlisted.push({ file: relPath(file), reason: allowReason });
        continue;
    }

    if (!hasSchemaImport(source)) {
        const line = findBodyReadLine(source);
        violations.push({
            file: relPath(file),
            line,
            reason: 'reads body without Zod schema import from lib/schemas/',
        });
    }
}

if (allowlisted.length > 0) {
    console.log(`Allowlisted routes (${allowlisted.length}):`);

    for (const entry of allowlisted) {
        console.log(`  ${entry.file} — ${entry.reason}`);
    }
}

if (violations.length > 0) {
    console.error(
        `\nViolations: ${violations.length} route(s) read request body without a lib/schemas/ import:\n`,
    );

    for (const v of violations) {
        console.error(`  ${v.file}:${v.line} ${v.reason}`);
    }

    console.error('');
    process.exit(1);
}

const totalRoutes = [...walkRoutes(apiRoot)].length;
console.log(`OK: ${totalRoutes} routes checked, ${allowlisted.length} allowlisted`);
process.exit(0);
